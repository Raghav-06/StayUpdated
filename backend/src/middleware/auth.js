import { getPublicUser } from "../auth/service.js";
import { verifyToken } from "../auth/tokens.js";
import { httpError } from "../utils/httpError.js";

// Expects `Authorization: Bearer <token>`; sets req.user.
export async function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization ?? "").split(" ");
  if (scheme !== "Bearer" || !token) throw httpError(401, "Sign in required");

  const { sub } = verifyToken(token, "access");
  const user = await getPublicUser(sub);
  if (!user) throw httpError(401, "Account no longer exists");

  req.user = user;
  next();
}
