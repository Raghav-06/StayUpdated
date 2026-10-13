# StayUpdated

StayUpdated gathers the latest news on any topic from many sources, checks each item is actually about that topic, and writes a short summary that cites its sources.

- **Many sources**: Bing News, Google News, Google Search (via Serper), GDELT, DuckDuckGo, Hacker News, Reddit, Bluesky, Mastodon, YouTube and Wikipedia. Sources that need API keys are skipped until their keys are set.
- **Relevance-checked**: every article is fetched, its text extracted, and scored against the topic with embeddings (or local keyword matching). Old, thin, off-topic and duplicate items are dropped.
- **Summarized with citations**: an LLM summarizes what's left, citing each claim as `[n]` with links back to the sources.
- **Accounts**: sign up with email (6-digit verification code) or with Google. Forgot-password uses the same code flow.
- **Per-user history**: every search is saved to your account so you can open or delete it later.
- **Regions**: search India, the US, the UK or worldwide. Each news source gets the matching edition/market; your default is saved in Settings.
- **Live progress**: results stream in as they're found: each source ticking in, "Reading 12/24", then the summary word by word. You can cancel a search.
- **Fast repeats**: an identical search made in the last 15 minutes (by anyone) is served from the cache and marked "cached".
- **Refresh + "New"**: re-run a past search and see which sources are new since last time.
- **Share and export**: create a public read-only link (and revoke it), or copy the result as Markdown.
- **Ask about a result**: ask follow-up questions answered only from that search's sources, with `[n]` citations.
- **Settings**: name, default region, change password, sign out of all devices, delete account.
- **Follow topics + daily digest**: follow up to 10 topics and get one email a day with only the stories you haven't been sent before. Every email has a one-click unsubscribe link.

## Tech stack

| Part | Stack |
| --- | --- |
| Frontend | React 19, React Router 7, Vite |
| Backend | Node.js, Express 5, LangChain.js (`@langchain/openai` against any OpenAI-compatible API) |
| Database | PostgreSQL (`pg`); the schema is applied automatically on startup |
| Auth | JWT, email codes via Nodemailer (SMTP), Google OAuth (`google-auth-library`) |
| News | RSS/JSON source providers, `@mozilla/readability` + `linkedom` for article extraction |

## Prerequisites

- **Node.js 20.19+** (and npm)
- **PostgreSQL** (any recent version), running locally or reachable over the network
- An API key for an LLM provider with an OpenAI-compatible API (OpenAI, Mistral, Groq, Gemini, Hugging Face, Ollama, ...)

## Setup

### 1. Install dependencies

From the repo root:

```bash
npm install            # installs the root tooling (concurrently)
npm run install:all    # installs backend and frontend
```

### 2. Create the database

```bash
createdb stayupdated
# or, in psql:  CREATE DATABASE stayupdated;
```

The tables are created automatically when the backend starts (and by `npm run check`).

### 3. Configure the backend

Copy the example file and fill it in:

```bash
cp backend/.env.example backend/.env
# Windows (PowerShell): Copy-Item backend/.env.example backend/.env
```

`backend/.env` is git-ignored. Never commit it.

**Required**

| Variable | What it is |
| --- | --- |
| `LLM_API_KEY` | API key for your chat model provider |
| `LLM_BASE_URL` | The provider's OpenAI-compatible base URL (see the table in `.env.example`) |
| `LLM_MODEL` | Chat model name |
| `DATABASE_URL` | e.g. `postgres://postgres:password@localhost:5432/stayupdated` |
| `JWT_SECRET` | Random string, **at least 32 characters** (e.g. `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |

**Optional**

| Variable(s) | Used for | If unset |
| --- | --- | --- |
| `EMBEDDING_MODEL`, `EMBEDDING_PROVIDER`, `EMBEDDING_API_KEY`, `EMBEDDING_BASE_URL` | Relevance scoring and de-duplication | Local keyword matching is used |
| `NEWS_MIN_RELEVANCE` | Relevance cut-off (default `0.35`) | Default is used |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | "Continue with Google" | The Google button shows "not available" |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Sending verification codes | Codes are printed to the backend console (development only) |
| `SERPER_API_KEY`, `YOUTUBE_API_KEY`, `REDDIT_CLIENT_ID`/`SECRET`, `BSKY_HANDLE`/`BSKY_APP_PASSWORD`, `MASTODON_INSTANCE` | Extra news sources | That source is skipped |
| `TAVILY_API_KEY`, `OPENWEATHER_API_KEY` | City agent tools | Those tools are unavailable |
| `PORT`, `FRONTEND_URL`, `JWT_EXPIRES_IN`, `DATABASE_SSL` | Server settings | Defaults: `5000`, `http://localhost:5173`, `7d`, `false` |
| `BACKEND_URL` | The API's public URL, for links in emails that point at the backend (the digest's unsubscribe link) | `http://localhost:<PORT>` |
| `LLM_TIMEOUT_MS` | How long one AI request may take before it fails (retried once) | `60000` |
| `NEWS_CACHE_MINUTES` | Reuse an identical recent search for this many minutes; `0` disables the cache | `15` |
| `DIGEST_ENABLED` | `false` turns the scheduled daily digest off ("Send me my digest now" still works) | `true` |
| `DIGEST_CRON`, `DIGEST_TIMEZONE` | When the daily digest is sent | `0 8 * * *` (8:00), `Asia/Kolkata` |

**Example: Hugging Face for both chat and embeddings**

```ini
LLM_API_KEY=hf_your_token_here
LLM_BASE_URL=https://router.huggingface.co/v1
LLM_MODEL=meta-llama/Llama-3.3-70B-Instruct

# HF's router /v1 endpoint only serves chat, so embeddings use HF's native
# feature-extraction API. The key defaults to LLM_API_KEY.
EMBEDDING_PROVIDER=huggingface
EMBEDDING_MODEL=BAAI/bge-small-en-v1.5
```

Create the token at <https://huggingface.co/settings/tokens> with permission to call Inference Providers.

The frontend needs no configuration in development: Vite proxies `/api` to the backend. For production, set `VITE_API_URL` (see `frontend/.env.example`).

### 4. Check the setup

```bash
npm run check
```

This checks the required variables, connects to PostgreSQL and applies the schema, and makes a test call to the chat model, embeddings, Google config, SMTP and each news source. It prints ✔ / ! / ✖ per item, never prints secret values, and exits with an error if anything required failed.

### 5. Start the app

```bash
npm run dev
```

This runs both dev servers together with labelled output:

- Frontend: <http://localhost:5173> (open this one)
- Backend: <http://localhost:5000> (health check at `/health`)

Press `Ctrl+C` to stop both. To run them separately: `npm run dev --prefix backend` and `npm run dev --prefix frontend`.

## Daily digest

Press **Follow** on any result to follow its topic (up to 10). Every day at `DIGEST_CRON` (default 08:00, `DIGEST_TIMEZONE`), the backend searches each followed topic for users who have the digest on, keeps only sources it hasn't emailed them before, saves the search to their history, and sends one email per user. Topics with nothing new are left out, and nobody gets an email if nothing is new.

- Turn it on or off in **Settings**, or with the unsubscribe link in any digest email (no sign-in needed).
- **Following → Send me my digest now** sends yours right away (3 times an hour at most).
- If the server was down at the scheduled time, it catches up 2 minutes after the next start.
- Run it once by hand: `npm run digest`. Runs never overlap, even across processes.
- Without SMTP, digests are printed to the backend console (text version only), like verification codes.

## Tests

```bash
npm test                    # backend + frontend
npm test --prefix backend   # backend only
npm test --prefix frontend  # frontend only
```

The backend tests never call a real AI service or news site: they start a small local OpenAI-compatible mock server and answer news requests with fixture pages. They need **a separate, empty PostgreSQL database** (the tests wipe it):

```bash
createdb stayupdated_test
DATABASE_URL_TEST=postgres://postgres:password@localhost:5432/stayupdated_test npm test --prefix backend
# Windows (PowerShell): $env:DATABASE_URL_TEST="postgres://..."; npm test --prefix backend
```

Without `DATABASE_URL_TEST`, the database tests are skipped (with a message) and the rest still run. CI (`.github/workflows/ci.yml`) runs everything on every push and pull request, with a Postgres service and no secrets.

## Docker Compose

```bash
docker compose up --build   # Postgres + backend + frontend, at http://localhost:5173
docker compose up db        # just Postgres, if you run the app itself with `npm run dev`
```

- The backend reads `backend/.env` (create it first, see step 3), but always uses the `db` service as its database.
- Postgres data lives in the `pgdata` volume. `docker compose down -v` deletes it.
- If port 5432 is already in use on your machine, pick another: `DB_PORT=5433 docker compose up db`, and use that port in `DATABASE_URL`. The database password defaults to `postgres` (set `POSTGRES_PASSWORD` to change it).
- With `docker compose up db` and the app running locally, use `DATABASE_URL=postgres://postgres:postgres@localhost:5432/stayupdated`.

## Google OAuth setup

1. Open <https://console.cloud.google.com/apis/credentials> and select (or create) a project.
2. Configure the **OAuth consent screen** if asked: user type *External*, scopes `openid`, `email`, `profile`.
3. **Create credentials → OAuth client ID**, application type **Web application**.
4. **Authorized JavaScript origins**: `http://localhost:5173`
5. **Authorized redirect URIs**: `http://localhost:5000/api/auth/google/callback`
6. Copy the client ID and secret into `backend/.env`:
   ```ini
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   GOOGLE_REDIRECT_URI=http://localhost:5000/api/auth/google/callback
   ```
7. While the consent screen's publishing status is **Testing**, only listed accounts can sign in: add your Google account(s) under **Audience → Test users** (older consoles: *OAuth consent screen → Test users*).

For production, add your real frontend origin and backend callback URL as well, and set `GOOGLE_REDIRECT_URI` and `FRONTEND_URL` to match.

## Gmail SMTP (App Password) setup

To send verification codes from a Gmail account:

1. Turn on **2-Step Verification** for the Google account: <https://myaccount.google.com/security>.
2. Create an App Password at <https://myaccount.google.com/apppasswords> (name it e.g. "StayUpdated"). Google shows a 16-character password once.
3. Put it in `backend/.env` (spaces in the app password can be removed):
   ```ini
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=you@gmail.com
   SMTP_PASS=your16charapppassword
   MAIL_FROM=StayUpdated <you@gmail.com>
   ```
4. Run `npm run check` to confirm the SMTP login works.

Use the App Password, not your normal Gmail password. Without `SMTP_HOST`, codes are printed to the backend console instead, which is fine for local development.

## Project structure

```
StayUpdated/
├── package.json            # root scripts: install:all, dev, check, digest, test
├── docker-compose.yml      # db + backend + frontend
├── .github/workflows/ci.yml
├── backend/
│   ├── .env.example        # copy to .env
│   ├── Dockerfile
│   ├── scripts/
│   │   ├── check-setup.js  # npm run check
│   │   └── digest.js       # npm run digest
│   ├── test/               # vitest + supertest, mock AI server, news fixtures
│   └── src/
│       ├── server.js       # entry point: loads .env, migrates the DB, starts Express
│       ├── app.js          # Express app, middleware, error handling
│       ├── routes/         # /api/auth, /api/news, /api/account, /api/follows, /api/public, chains/tools/agent
│       ├── digest/         # daily digest: run, email, scheduler
│       ├── auth/           # sign-up, login, Google OAuth, tokens, passwords, mailer
│       ├── middleware/     # requireAuth, per-user AI rate limit
│       ├── db/             # pg pool + schema.sql
│       ├── news/           # news pipeline, source providers, article extraction
│       ├── config/         # LLM / embeddings / Tavily config
│       ├── chains/         # LangChain chains
│       ├── agents/         # city agent (tool calling)
│       ├── tools/          # agent tools (news, weather, ...)
│       └── utils/
└── frontend/
    ├── vite.config.js      # dev server on 5173, proxies /api to the backend
    └── src/
        ├── App.jsx         # routes
        ├── pages/          # Home, Login, sign-up / forgot-password, history, settings, following, shared page
        ├── components/     # layout, auth forms, results and summary views
        └── lib/            # API client, auth context, history, formatting
```

## How the news pipeline works

When you search a topic (`POST /api/news/search`, or `POST /api/news/search/stream` for live progress as server-sent events), `backend/src/news/pipeline.js` runs:

1. **Discover**: every source provider is queried in parallel. Providers missing credentials are skipped, and a failing provider doesn't stop the others. URLs are normalized (tracking parameters removed) and de-duplicated.
2. **Fetch and extract**: article pages are fetched with limited concurrency and their main text is extracted with Readability. Social posts and videos use the text the source provides.
3. **Validate**: items that are too old, too short, off-topic (relevance below `NEWS_MIN_RELEVANCE`, scored with embeddings or keyword overlap) or near-duplicates of a better item are rejected.
4. **Summarize**: the remaining items go to the LLM, which writes a summary citing them as `[n]`. The result, with its sources, is saved to your history.

An identical search (same topic, region and options) from the last `NEWS_CACHE_MINUTES` skips all of this and reuses the earlier result. Searches that include your own URLs are never cached.
