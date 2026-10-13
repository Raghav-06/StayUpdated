import { randomUUID } from "node:crypto";
import request from "supertest";
import app from "../../src/app.js";
import { hashPassword } from "../../src/auth/passwords.js";
import { signAccessToken } from "../../src/auth/tokens.js";
import { migrate, query } from "../../src/db/index.js";

export const hasDb = Boolean(process.env.DATABASE_URL_TEST);

export const api = () => request(app);

/** Creates the schema and empties every table. */
export async function resetDb() {
  await migrate();
  await query(
    `TRUNCATE users, email_verifications, news_searches, search_questions,
              followed_topics, followed_seen_urls, app_state CASCADE`
  );
}

/** A signed-in user, created directly in the database (the auth routes are rate-limited per IP). */
export async function createUser({ email = `user-${randomUUID()}@example.com`, password = "Test-pass-123", name = "Test User", preferences = {} } = {}) {
  const { rows } = await query(
    `INSERT INTO users (email, name, password_hash, email_verified_at, preferences)
     VALUES ($1, $2, $3, now(), $4) RETURNING id, email, name, token_version`,
    [email, name, await hashPassword(password), preferences]
  );
  const user = rows[0];
  return { user, token: signAccessToken(user), auth: { Authorization: `Bearer ${signAccessToken(user)}` } };
}

/** Collects a whole server-sent-events response as text (supertest buffers it until the stream ends). */
export function sse(req) {
  return req.buffer(true).parse((res, done) => {
    let body = "";
    res.setEncoding("utf8");
    res.on("data", (chunk) => (body += chunk));
    res.on("end", () => done(null, body));
  });
}

/** "event: x\ndata: {...}\n\n" blocks -> [{ type, data }] */
export function parseEvents(text) {
  return text
    .split("\n\n")
    .map((block) => {
      const type = /^event: (.*)$/m.exec(block)?.[1];
      const data = /^data: (.*)$/m.exec(block)?.[1];
      return type ? { type, data: data ? JSON.parse(data) : null } : null;
    })
    .filter(Boolean);
}
