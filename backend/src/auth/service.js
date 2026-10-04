import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { query } from "../db/index.js";
import { httpError } from "../utils/httpError.js";
import { hashPassword, validatePassword, verifyPassword } from "./passwords.js";
import { sendAlreadyRegistered, sendVerificationCode } from "./mailer.js";
import { signAccessToken, signSetupToken, verifyToken } from "./tokens.js";

const CODE_TTL_MINUTES = 15;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_CODE_ATTEMPTS = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Columns safe to send to the client.
const PUBLIC_USER = `id, email, name, avatar_url, email_verified_at, created_at,
  (password_hash IS NOT NULL) AS has_password, (google_id IS NOT NULL) AS has_google`;

export function normalizeEmail(email) {
  const value = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(value) || value.length > 254) throw httpError(400, "A valid email is required");
  return value;
}

function hashCode(code) {
  return createHmac("sha256", process.env.JWT_SECRET ?? "").update(code).digest("hex");
}

function session(user) {
  return { status: "signed_in", token: signAccessToken(user), user };
}

function cleanName(name) {
  return typeof name === "string" && name.trim() ? name.trim().slice(0, 100) : null;
}

async function findUserByEmail(email) {
  const { rows } = await query("SELECT * FROM users WHERE lower(email) = $1", [email]);
  return rows[0] ?? null;
}

export async function getPublicUser(id) {
  const { rows } = await query(`SELECT ${PUBLIC_USER} FROM users WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

async function issueCode(email) {
  const { rows } = await query(
    `SELECT 1 FROM email_verifications
      WHERE lower(email) = $1 AND created_at > now() - make_interval(secs => $2)`,
    [email, RESEND_COOLDOWN_SECONDS]
  );
  if (rows.length) throw httpError(429, `Please wait ${RESEND_COOLDOWN_SECONDS} seconds before requesting another code`);

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { rows: inserted } = await query(
    `INSERT INTO email_verifications (email, code_hash, expires_at)
     VALUES ($1, $2, now() + make_interval(mins => $3))
     RETURNING id`,
    [email, hashCode(code), CODE_TTL_MINUTES]
  );
  try {
    await sendVerificationCode(email, code);
  } catch (err) {
    await query("DELETE FROM email_verifications WHERE id = $1", [inserted[0].id]).catch(() => {});
    console.error("Failed to send verification email:", err.message);
    throw httpError(502, "We couldn't send the verification email. Please try again.");
  }
}

const CODE_SENT = { message: "If this email can be used, a 6-digit verification code has been sent to it." };

/** Step 1 of email sign-up: email a verification code. */
export async function startRegistration(rawEmail) {
  const email = normalizeEmail(rawEmail);
  const user = await findUserByEmail(email);
  if (user?.password_hash) {
    await sendAlreadyRegistered(email);
  } else {
    // New email, or a Google-only account adding a password.
    await issueCode(email);
  }
  return CODE_SENT;
}

/** Forgot password: same code flow, only for accounts that exist. */
export async function startPasswordReset(rawEmail) {
  const email = normalizeEmail(rawEmail);
  if (await findUserByEmail(email)) await issueCode(email);
  return CODE_SENT;
}

/** Step 2: check the code. Returns a short-lived token that allows setting a password. */
export async function verifyEmailCode(rawEmail, code) {
  const email = normalizeEmail(rawEmail);
  if (typeof code !== "string" || !/^\d{6}$/.test(code.trim())) throw httpError(400, "Code must be 6 digits");

  const { rows } = await query(
    `SELECT * FROM email_verifications
      WHERE lower(email) = $1 AND verified_at IS NULL AND expires_at > now()
      ORDER BY created_at DESC LIMIT 1`,
    [email]
  );
  const record = rows[0];
  const invalid = httpError(400, "Invalid or expired code");
  if (!record) throw invalid;
  if (record.attempts >= MAX_CODE_ATTEMPTS) throw httpError(429, "Too many attempts. Request a new code.");

  const matches = timingSafeEqual(Buffer.from(hashCode(code.trim())), Buffer.from(record.code_hash));
  if (!matches) {
    await query("UPDATE email_verifications SET attempts = attempts + 1 WHERE id = $1", [record.id]);
    throw invalid;
  }

  // Sign first: if JWT_SECRET is misconfigured this throws before the code is used up.
  const setupToken = signSetupToken(record.id, email);
  await query("UPDATE email_verifications SET verified_at = now() WHERE id = $1", [record.id]);
  return { setupToken, expiresIn: "15m" };
}

/** Step 3: set the password, then log in. Creates the account, or updates it on reset. */
export async function setPassword(setupToken, password, name) {
  const { sub: verificationId, email } = verifyToken(setupToken, "setup");
  validatePassword(password);

  // Mark the verification used in the same statement that checks it, so a token works once.
  const { rowCount } = await query(
    `UPDATE email_verifications SET used_at = now()
      WHERE id = $1 AND verified_at IS NOT NULL AND used_at IS NULL`,
    [verificationId]
  );
  if (!rowCount) throw httpError(401, "This verification code was already used. Please start again.");

  const passwordHash = await hashPassword(password);
  const { rows } = await query(
    `INSERT INTO users (email, name, password_hash, email_verified_at, last_login_at)
     VALUES ($1, $2, $3, now(), now())
     ON CONFLICT ((lower(email))) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           name = COALESCE(users.name, EXCLUDED.name),
           last_login_at = now(), updated_at = now()
     RETURNING ${PUBLIC_USER}`,
    [email, cleanName(name), passwordHash]
  );
  return session(rows[0]);
}

export async function loginWithPassword(rawEmail, password) {
  const email = normalizeEmail(rawEmail);
  const user = await findUserByEmail(email);
  const ok = user?.password_hash && typeof password === "string" && (await verifyPassword(password, user.password_hash));
  if (!ok) {
    if (user && !user.password_hash) {
      throw httpError(401, "This account uses Google sign-in. Continue with Google, or use Forgot password to set a password.");
    }
    throw httpError(401, "Invalid email or password");
  }
  await query("UPDATE users SET last_login_at = now() WHERE id = $1", [user.id]);
  return session(await getPublicUser(user.id));
}

// Google proves who the user is, so they're signed in directly. A Google-only account
// can add a password later through "Forgot password".
async function googleResult(userId) {
  return session(await getPublicUser(userId));
}

/** Google sign-in: find by Google ID, else link to an existing account with the same email, else create. */
export async function loginWithGoogle({ googleId, email: rawEmail, name, avatarUrl }) {
  const email = normalizeEmail(rawEmail);

  // Matched by Google ID first, so it still works if the Google account's email changed.
  const existing = await query(
    `UPDATE users SET name = COALESCE(name, $2), avatar_url = COALESCE($3, avatar_url),
            last_login_at = now(), updated_at = now()
      WHERE google_id = $1 RETURNING id`,
    [googleId, name, avatarUrl]
  );
  if (existing.rows[0]) return googleResult(existing.rows[0].id);

  const { rows } = await query(
    `INSERT INTO users (email, name, avatar_url, google_id, email_verified_at, last_login_at)
     VALUES ($1, $2, $3, $4, now(), now())
     ON CONFLICT ((lower(email))) DO UPDATE
       SET google_id = COALESCE(users.google_id, EXCLUDED.google_id),
           name = COALESCE(users.name, EXCLUDED.name),
           avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url),
           last_login_at = now(), updated_at = now()
     RETURNING id, google_id`,
    [email, name, avatarUrl, googleId]
  );

  // The email belongs to an account already linked to a *different* Google account.
  if (rows[0].google_id !== googleId) throw httpError(409, "This email is linked to a different Google account");
  return googleResult(rows[0].id);
}
