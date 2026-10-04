import jwt from "jsonwebtoken";
import { httpError } from "../utils/httpError.js";

const ACCESS_TOKEN_TTL = process.env.JWT_EXPIRES_IN || "7d";
const SETUP_TOKEN_TTL = "15m";

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) throw httpError(500, "JWT_SECRET must be set (at least 32 characters)");
  return value;
}

// Each token carries a `typ` so a set-password token can never be used as a login token.
export function signAccessToken(user) {
  return jwt.sign({ typ: "access", email: user.email }, secret(), {
    subject: user.id,
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

export function signSetupToken(verificationId, email) {
  return jwt.sign({ typ: "setup", email }, secret(), { subject: verificationId, expiresIn: SETUP_TOKEN_TTL });
}

// Issued after Google sign-in when the account has no password yet; only usable to set one.
export function signGoogleSetupToken(userId, email) {
  return jwt.sign({ typ: "google-setup", email }, secret(), { subject: userId, expiresIn: "30m" });
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
