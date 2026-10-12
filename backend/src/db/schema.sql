-- Applied on every server start; every statement must be idempotent.

CREATE TABLE IF NOT EXISTS users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             TEXT NOT NULL,
  name              TEXT,
  avatar_url        TEXT,
  password_hash     TEXT,               -- NULL for accounts that only sign in with Google
  google_id         TEXT UNIQUE,        -- NULL for accounts that never used Google
  email_verified_at TIMESTAMPTZ NOT NULL,
  last_login_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));

-- Per-user settings, e.g. { "region": "IN", "digestEnabled": true }.
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}';

-- One row per code emailed. A code is first "verified" (correct code entered), then
-- "used" (password set with it). Only a hash of the code is stored.
CREATE TABLE IF NOT EXISTS email_verifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_verifications_email_idx ON email_verifications (lower(email), created_at DESC);

CREATE TABLE IF NOT EXISTS news_searches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic           TEXT NOT NULL,
  params          JSONB NOT NULL DEFAULT '{}',
  summary         TEXT,
  sources         JSONB NOT NULL DEFAULT '[]',
  provider_status JSONB NOT NULL DEFAULT '{}',
  stats           JSONB NOT NULL DEFAULT '{}',
  models          JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS news_searches_user_idx ON news_searches (user_id, created_at DESC);

-- Hash of topic + options; recent searches with the same key are reused (NULL = never cached).
ALTER TABLE news_searches ADD COLUMN IF NOT EXISTS cache_key TEXT;
CREATE INDEX IF NOT EXISTS news_searches_cache_idx ON news_searches (cache_key, created_at DESC);

-- Set while the search has a public read-only link (/s/<share_id>).
ALTER TABLE news_searches ADD COLUMN IF NOT EXISTS share_id TEXT UNIQUE;

-- The source text the summary was written from, so follow-up questions use the same material.
ALTER TABLE news_searches ADD COLUMN IF NOT EXISTS context TEXT;

-- Follow-up questions about a search, answered from its sources.
CREATE TABLE IF NOT EXISTS search_questions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id   UUID NOT NULL REFERENCES news_searches(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS search_questions_search_idx ON search_questions (search_id, created_at);
