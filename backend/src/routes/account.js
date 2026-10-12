import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { getAuthUser, session } from "../auth/service.js";
import { hashPassword, validatePassword, verifyPassword } from "../auth/passwords.js";
import { query } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { isRegion } from "../news/regions.js";
import { httpError } from "../utils/httpError.js";

const router = Router();
router.use(requireAuth);

// Slows down guessing the current password with a stolen session.
const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => req.user.id,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

function validatePreferences(value) {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw httpError(400, "'preferences' must be an object");
  const prefs = {};
  if (value.region !== undefined) {
    if (!isRegion(value.region)) throw httpError(400, "'preferences.region' must be one of IN, US, GB, global");
    prefs.region = value.region;
  }
  if (value.digestEnabled !== undefined) {
    if (typeof value.digestEnabled !== "boolean") throw httpError(400, "'preferences.digestEnabled' must be true or false");
    prefs.digestEnabled = value.digestEnabled;
  }
  return prefs;
}

// Bumps token_version, which retires every access token issued so far.
async function revokeSessions(userId) {
  await query("UPDATE users SET token_version = token_version + 1, updated_at = now() WHERE id = $1", [userId]);
}

// Name and/or preferences (region, digestEnabled). Preferences are merged, not replaced.
router.patch("/", async (req, res) => {
  const { name } = req.body ?? {};
  if (name !== undefined && name !== null && typeof name !== "string") throw httpError(400, "'name' must be a string");
  const cleanName = typeof name === "string" ? name.trim().slice(0, 100) || null : null;
  const prefs = validatePreferences(req.body?.preferences);

  await query(
    `UPDATE users SET name = CASE WHEN $2 THEN $3 ELSE name END,
            preferences = preferences || $4::jsonb, updated_at = now()
      WHERE id = $1`,
    [req.user.id, name !== undefined, cleanName, prefs]
  );
  const { token_version, ...user } = await getAuthUser(req.user.id);
  res.json({ user });
});

// Requires the current password. Signs out every other device and returns a fresh token for this one.
router.post("/password", passwordLimiter, async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};
  const { rows } = await query("SELECT password_hash FROM users WHERE id = $1", [req.user.id]);
  if (!rows[0]?.password_hash) {
    throw httpError(400, "Your account signs in with Google and has no password yet. Use “Forgot password” on the sign-in page to set one.");
  }
  // 400, not 401: a wrong password here must not look like an expired session to the app.
  if (typeof currentPassword !== "string" || !(await verifyPassword(currentPassword, rows[0].password_hash))) {
    throw httpError(400, "Your current password is incorrect");
  }
  validatePassword(newPassword);

  await query(
    `UPDATE users SET password_hash = $2, token_version = token_version + 1, updated_at = now() WHERE id = $1`,
    [req.user.id, await hashPassword(newPassword)]
  );
  res.json(session(await getAuthUser(req.user.id)));
});

// Signs out everywhere, this device included.
router.post("/logout-all", async (req, res) => {
  await revokeSessions(req.user.id);
  res.status(204).end();
});

// Deletes the account and everything that belongs to it (searches, questions and follows cascade).
router.delete("/", async (req, res) => {
  const confirmEmail = req.body?.confirmEmail;
  if (typeof confirmEmail !== "string" || confirmEmail.trim().toLowerCase() !== req.user.email.toLowerCase()) {
    throw httpError(400, "Type your email address exactly to confirm");
  }
  // One statement, so the user and their pending email codes go together.
  await query(
    `WITH deleted AS (DELETE FROM users WHERE id = $1 RETURNING email)
     DELETE FROM email_verifications WHERE lower(email) IN (SELECT lower(email) FROM deleted)`,
    [req.user.id]
  );
  res.status(204).end();
});

export default router;
