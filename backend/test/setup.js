// Runs before every test file: a local mock AI server, fixture responses instead of real news
// sites, and a test-only environment. Nothing here reads backend/.env.
import { isIP } from "node:net";
import { vi } from "vitest";
import { installFixtureFetch } from "./helpers/fixtures.js";
import { startMockOpenAI } from "./helpers/mockOpenAI.js";
import "./helpers/mail.js";

const mock = await startMockOpenAI();

Object.assign(process.env, {
  NODE_ENV: "test",
  JWT_SECRET: "test-secret-that-is-long-enough-for-hs256-signing",
  LLM_API_KEY: "mock-key",
  LLM_MODEL: "mock-model",
  LLM_BASE_URL: mock.url,
  LLM_TIMEOUT_MS: "10000",
  FRONTEND_URL: "http://frontend.test",
  BACKEND_URL: "http://backend.test",
  NEWS_CACHE_MINUTES: "15",
  DIGEST_ENABLED: "false",
});
// Keyword relevance keeps the pipeline tests deterministic; the mock still serves embeddings.
for (const key of ["EMBEDDING_MODEL", "EMBEDDING_PROVIDER", "SMTP_HOST", "SERPER_API_KEY", "YOUTUBE_API_KEY",
  "REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET", "BSKY_HANDLE", "BSKY_APP_PASSWORD", "GOOGLE_CLIENT_ID"]) {
  delete process.env[key];
}
if (process.env.DATABASE_URL_TEST) process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
else delete process.env.DATABASE_URL;

// Fixture hosts resolve to a public address; IP literals resolve to themselves (for the SSRF tests).
vi.mock("node:dns/promises", () => ({
  lookup: async (host) => {
    const family = isIP(host);
    return [{ address: family ? host : "93.184.216.34", family: family || 4 }];
  },
}));

installFixtureFetch(mock.url);
