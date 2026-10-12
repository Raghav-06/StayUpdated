import { getAuthUser } from "../auth/service.js";
import { verifyToken } from "../auth/tokens.js";
import { httpError } from "../utils/httpError.js";

// Expects `Authorization: Bearer <token>`; sets req.user.
export async function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization ?? "").split(" ");
  if (scheme !== "Bearer" || !token) throw httpError(401, "Sign in required");

  const { sub, tv = 0 } = verifyToken(token, "access");
  const found = await getAuthUser(sub);
  if (!found) throw httpError(401, "Account no longer exists");

  // Changing the password or "sign out of all devices" bumps token_version, retiring older tokens.
  const { token_version, ...user } = found;
  if (tv !== token_version) throw httpError(401, "Your session has ended. Please sign in again.");

  req.user = user;
  next();
}
