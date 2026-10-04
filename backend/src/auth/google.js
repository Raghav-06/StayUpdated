import { OAuth2Client } from "google-auth-library";
import { httpError } from "../utils/httpError.js";

let client;

function getClient() {
  if (!client) {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
      throw httpError(500, "Google sign-in is not configured (GOOGLE_CLIENT_ID / SECRET / REDIRECT_URI)");
    }
    client = new OAuth2Client({
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      redirectUri: GOOGLE_REDIRECT_URI,
    });
  }
  return client;
}

export function getGoogleAuthUrl(state) {
  return getClient().generateAuthUrl({
    scope: ["openid", "email", "profile"],
    state,
    prompt: "select_account",
  });
}

async function profileFromIdToken(idToken) {
  let payload;
  try {
    const ticket = await getClient().verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch {
    throw httpError(401, "Invalid Google credential");
  }
  if (!payload?.email || !payload.email_verified) {
    throw httpError(401, "Your Google account's email address is not verified");
  }
  return { googleId: payload.sub, email: payload.email, name: payload.name ?? null, avatarUrl: payload.picture ?? null };
}

// Redirect flow: Google sent the user back with ?code=...
export async function profileFromAuthCode(code) {
  let tokens;
  try {
    ({ tokens } = await getClient().getToken(code));
  } catch {
    throw httpError(401, "Google sign-in failed or was cancelled");
  }
  return profileFromIdToken(tokens.id_token);
}

// Button flow: the frontend used Google Identity Services and sends us the ID token.
export const profileFromGoogleCredential = profileFromIdToken;
