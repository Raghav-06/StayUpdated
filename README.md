# StayUpdated

StayUpdated gathers the latest news on any topic from many sources, checks each item is actually about that topic, and writes a short summary that cites its sources.

- **Many sources**: Bing News, Google News, Google Search (via Serper), GDELT, DuckDuckGo, Hacker News, Reddit, Bluesky, Mastodon, YouTube and Wikipedia. Sources that need API keys are skipped until their keys are set.
- **Relevance-checked**: every article is fetched, its text extracted, and scored against the topic with embeddings (or local keyword matching). Old, thin, off-topic and duplicate items are dropped.
- **Summarized with citations**: an LLM summarizes what's left, citing each claim as `[n]` with links back to the sources.
- **Accounts**: sign up with email (6-digit verification code) or with Google. Forgot-password uses the same code flow.
- **Per-user history**: every search is saved to your account so you can open or delete it later.

## Tech stack

| Part | Stack |
| --- | --- |
| Frontend | React 19, React Router 7, Vite |
| Backend | Node.js, Express 5, LangChain.js (`@langchain/openai` against any OpenAI-compatible API) |
| Database | PostgreSQL (`pg`); the schema is applied automatically on startup |
| Auth | JWT, email codes via Nodemailer (SMTP), Google OAuth (`google-auth-library`) |
| News | RSS/JSON source providers, `@mozilla/readability` + `linkedom` for article extraction |

## Prerequisites

- **Node.js 20+** (and npm)
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

**Example: Hugging Face for both chat and embeddings**

```ini
LLM_API_KEY=hf_your_token_here
LLM_BASE_URL=https://router.huggingface.co/v1
LLM_MODEL=meta-llama/Llama-3.1-8B-Instruct

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
├── package.json            # root scripts: install:all, dev, check
├── backend/
│   ├── .env.example        # copy to .env
│   ├── scripts/
│   │   └── check-setup.js  # npm run check
│   └── src/
│       ├── server.js       # entry point: loads .env, migrates the DB, starts Express
│       ├── app.js          # Express app, middleware, error handling
│       ├── routes/         # /api/auth, /api/news, chains/tools/agent routes
│       ├── auth/           # sign-up, login, Google OAuth, tokens, passwords, mailer
│       ├── middleware/     # requireAuth
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
        ├── pages/          # Home, Login, sign-up / forgot-password, history
        ├── components/     # layout, auth forms, results and summary views
        └── lib/            # API client, auth context, history, formatting
```

## How the news pipeline works

When you search a topic (`POST /api/news/search`), `backend/src/news/pipeline.js` runs:

1. **Discover**: every source provider is queried in parallel. Providers missing credentials are skipped, and a failing provider doesn't stop the others. URLs are normalized (tracking parameters removed) and de-duplicated.
2. **Fetch and extract**: article pages are fetched with limited concurrency and their main text is extracted with Readability. Social posts and videos use the text the source provides.
3. **Validate**: items that are too old, too short, off-topic (relevance below `NEWS_MIN_RELEVANCE`, scored with embeddings or keyword overlap) or near-duplicates of a better item are rejected.
4. **Summarize**: the remaining items go to the LLM, which writes a summary citing them as `[n]`. The result, with its sources, is saved to your history.
