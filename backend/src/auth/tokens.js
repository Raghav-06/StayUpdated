import jwt from "jsonwebtoken";
import { httpError } from "../utils/httpError.js";

const ACCESS_TOKEN_TTL = process.env.JWT_EXPIRES_IN || "7d";
const SETUP_TOKEN_TTL = "15m";

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) throw httpError(500, "JWT_SECRET must be set (at least 32 characters)");
  return value;
}

// Each token carries a `typ` so a set-password token can never be used as a login token,
// and access tokens a `tv` (the user's token_version) so they can all be revoked at once.
export function signAccessToken(user) {
  return jwt.sign({ typ: "access", email: user.email, tv: user.token_version ?? 0 }, secret(), {
    subject: user.id,
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

export function signSetupToken(verificationId, email) {
  return jwt.sign({ typ: "setup", email }, secret(), { subject: verificationId, expiresIn: SETUP_TOKEN_TTL });
}

// `typ` may be a single token type or a list of accepted types.
export function verifyToken(token, typ) {
  let payload;
  try {
    payload = jwt.verify(token, secret());
  } catch {
    throw httpError(401, "Invalid or expired token");
  }
  if (![typ].flat().includes(payload.typ)) throw httpError(401, "Invalid or expired token");
  return payload;
}
