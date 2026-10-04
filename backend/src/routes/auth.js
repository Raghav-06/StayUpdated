import { randomBytes } from "node:crypto";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import {
  loginWithGoogle,
  loginWithPassword,
  setPassword,
  startPasswordReset,
  startRegistration,
  verifyEmailCode,
} from "../auth/service.js";
import { getGoogleAuthUrl, profileFromAuthCode, profileFromGoogleCredential } from "../auth/google.js";
import { requireAuth } from "../middleware/auth.js";
import { httpError } from "../utils/httpError.js";

const router = Router();

// Slows down password guessing and code spamming from a single IP.
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false });

const STATE_COOKIE = "g_oauth_state";
const stateCookieOptions = {
  httpOnly: true,
  sameSite: "lax", // must survive the top-level redirect back from Google
  secure: process.env.NODE_ENV === "production",
  maxAge: 10 * 60 * 1000,
  path: "/api/auth/google",
};

function googleConfigured() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REDIRECT_URI);
}

// Lets the frontend hide sign-in options that aren't set up.
router.get("/config", (req, res) => {
  res.json({ google: googleConfigured() });
});

// --- Email sign-up: register -> verify-email -> set-password ---
router.post("/register", limiter, async (req, res) => {
  res.json(await startRegistration(req.body?.email));
});

router.post("/verify-email", limiter, async (req, res) => {
  res.json(await verifyEmailCode(req.body?.email, req.body?.code));
});

router.post("/set-password", limiter, async (req, res) => {
  const { setupToken, password, name } = req.body ?? {};
  if (typeof setupToken !== "string") throw httpError(400, "'setupToken' is required");
  res.json(await setPassword(setupToken, password, name));
});

// Same code flow as sign-up, then /verify-email and /set-password.
router.post("/forgot-password", limiter, async (req, res) => {
  res.json(await startPasswordReset(req.body?.email));
});

router.post("/login", limiter, async (req, res) => {
  res.json(await loginWithPassword(req.body?.email, req.body?.password));
});

// --- Google: redirect flow ---
router.get("/google", (req, res) => {
  const frontend = process.env.FRONTEND_URL;
  if (!googleConfigured()) {
    const message = "Google sign-in is not available right now. Please use your email instead.";
    if (!frontend) throw httpError(503, message);
    return res.redirect(`${frontend}/auth/callback#${new URLSearchParams({ error: message })}`);
  }
  const state = randomBytes(16).toString("hex");
  res.cookie(STATE_COOKIE, state, stateCookieOptions);
  res.redirect(getGoogleAuthUrl(state));
});

router.get("/google/callback", async (req, res) => {
  const frontend = process.env.FRONTEND_URL;
  const finish = (fragment, status = 200, body) => {
    res.clearCookie(STATE_COOKIE, { path: stateCookieOptions.path });
    if (frontend) return res.redirect(`${frontend}/auth/callback#${new URLSearchParams(fragment)}`);
    return res.status(status).json(body ?? fragment);
  };

  // Google sends ?error=access_denied when the user closes the consent screen.
  if (req.query.error) {
    const message = req.query.error === "access_denied" ? "Google sign-in was cancelled" : "Google sign-in failed. Please try again.";
    return finish({ error: message }, 400);
  }

  const expected = req.cookies?.[STATE_COOKIE];
  if (!expected || req.query.state !== expected) {
    return finish({ error: "Sign-in session expired. Please try again." }, 400);
  }

  try {
    const result = await loginWithGoogle(await profileFromAuthCode(String(req.query.code ?? "")));
    // Tokens go in the URL fragment, which browsers never send to servers or put in logs.
    // New Google users get a setupToken and must set a password before they get a session token.
    const fragment =
      result.status === "password_required"
        ? { status: result.status, setupToken: result.setupToken }
        : { status: result.status, token: result.token };
    return finish(fragment, 200, result);
  } catch (err) {
    if (!err.status) throw err;
    return finish({ error: err.message }, err.status);
  }
});

// --- Google: button flow (frontend sends the credential from Google Identity Services) ---
router.post("/google", limiter, async (req, res) => {
  const credential = req.body?.credential;
  if (typeof credential !== "string") throw httpError(400, "'credential' is required");
  res.json(await loginWithGoogle(await profileFromGoogleCredential(credential)));
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
