// Checks that .env, the database and every external service are set up. Run with: npm run check
// Prints ✔ (ok) / ! (warning) / ✖ (failure) per item and exits 1 if anything failed.
// Never prints secret values, only variable names.
import "dotenv/config";

const TIMEOUT_MS = 30000;
const counts = { pass: 0, warn: 0, fail: 0 };

const ok = (msg) => (counts.pass++, console.log(`  ✔ ${msg}`));
const warn = (msg) => (counts.warn++, console.log(`  ! ${msg}`));
const fail = (msg) => (counts.fail++, console.log(`  ✖ ${msg}`));
const section = (title) => console.log(`\n${title}`);
const reason = (err) => String(err?.message ?? err).split("\n")[0].slice(0, 300);

// Rejects if the promise takes longer than ms.
function withTimeout(promise, ms = TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Runs one check; a thrown error becomes a failure (or a warning when soft).
async function check(label, fn, { soft = false } = {}) {
  try {
    const detail = await withTimeout(Promise.resolve().then(fn));
    ok(detail ? `${label}: ${detail}` : label);
    return true;
  } catch (err) {
    (soft ? warn : fail)(`${label}: ${reason(err)}`);
    return false;
  }
}

async function checkEnv() {
  section("1. Required environment variables");
  for (const name of ["LLM_API_KEY", "LLM_MODEL", "DATABASE_URL"]) {
    process.env[name] ? ok(`${name} is set`) : fail(`${name} is not set`);
  }
  const secret = process.env.JWT_SECRET ?? "";
  if (!secret) fail("JWT_SECRET is not set");
  else if (secret.length < 32) fail(`JWT_SECRET is too short (${secret.length} chars, need at least 32)`);
  else ok("JWT_SECRET is set (32+ chars)");
}

async function checkDatabase() {
  section("2. Database");
  if (!process.env.DATABASE_URL) return warn("skipped: DATABASE_URL is not set");
  const { getPool, migrate } = await import("../src/db/index.js");

  if (!(await check("Postgres connection", async () => (await getPool().query("SELECT version()")).rows[0].version.split(",")[0]))) return;
  if (!(await check("migrate() applied schema.sql", () => migrate()))) return;
  await check("tables exist", async () => {
    const wanted = ["users", "email_verifications", "news_searches"];
    const { rows } = await getPool().query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1)",
      [wanted]
    );
    const missing = wanted.filter((t) => !rows.some((r) => r.table_name === t));
    if (missing.length) throw new Error(`missing ${missing.join(", ")}`);
    return wanted.join(", ");
  });
}

async function checkJwt() {
  section("3. JWT");
  const { signAccessToken, verifyToken } = await import("../src/auth/tokens.js");
  await check("sign + verify access token", () => {
    const token = signAccessToken({ id: "00000000-0000-0000-0000-000000000000", email: "check@example.com" });
    if (verifyToken(token, "access").email !== "check@example.com") throw new Error("payload mismatch");
  });
}

async function checkLLM() {
  section("4. Chat model");
  if (!process.env.LLM_API_KEY || !process.env.LLM_MODEL) return warn("skipped: LLM_API_KEY / LLM_MODEL not set");
  const { getLLM, LLM_CONFIG } = await import("../src/config/llm.js");
  const { getTextLength } = await import("../src/tools/textLength.js");

  const chatOk = await check(`chat call (${LLM_CONFIG.model})`, async () => {
    const res = await getLLM({ maxTokens: 20 }).invoke("Reply with the single word: pong");
    const text = String(res.content ?? "").trim();
    if (!text) throw new Error("empty reply");
    return `replied "${text.slice(0, 40)}"`;
  });
  if (!chatOk) return;

  await check(
    "tool calling (bindTools)",
    async () => {
      const llm = getLLM().bindTools([getTextLength]);
      const res = await llm.invoke("Use the get_text_length tool to count the characters in 'StayUpdated'.");
      if (!res.tool_calls?.length) throw new Error("model answered without calling the tool");
      return `called ${res.tool_calls[0].name}`;
    },
    { soft: true }
  );
}

async function checkEmbeddings() {
  section("5. Embeddings");
  if (!process.env.EMBEDDING_MODEL) return warn("EMBEDDING_MODEL not set: news relevance uses keyword matching");
  const { getEmbeddings } = await import("../src/config/llm.js");
  await check(`embedQuery (${process.env.EMBEDDING_MODEL})`, async () => {
    const vector = await getEmbeddings().embedQuery("electric vehicles");
    if (!Array.isArray(vector) || !vector.length || typeof vector[0] !== "number") throw new Error("not a vector of numbers");
    return `${vector.length} dimensions`;
  });
}

function checkGoogle() {
  section("6. Google sign-in");
  const names = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"];
  // A redirect URI on its own (as in .env.example) doesn't enable anything.
  const secrets = names.slice(0, 2).filter((n) => process.env[n]);
  if (!secrets.length) return warn("not configured (optional): the Google button shows a 'not available' message");
  const missing = names.filter((n) => !process.env[n]);
  missing.length ? fail(`partly configured; also set ${missing.join(", ")}`) : ok("configured");
}

async function checkSmtp() {
  section("7. Email");
  if (!process.env.SMTP_HOST) return warn("SMTP_HOST not set: verification codes are printed to the backend console");
  const nodemailer = (await import("nodemailer")).default;
  await check("SMTP transport.verify()", () =>
    nodemailer
      .createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
        connectionTimeout: TIMEOUT_MS,
      })
      .verify()
  );
}

async function checkAgentTools() {
  section("8. City agent tools");
  if (!process.env.TAVILY_API_KEY) warn("TAVILY_API_KEY not set (optional): news tool disabled");
  else {
    const { getTavily } = await import("../src/config/tavily.js");
    await check("Tavily search", async () => `${(await getTavily().search("technology", { maxResults: 1 })).results.length} result(s)`);
  }

  if (!process.env.OPENWEATHER_API_KEY) warn("OPENWEATHER_API_KEY not set (optional): weather tool disabled");
  else {
    const { getWeather } = await import("../src/tools/weather.js");
    await check("OpenWeather", async () => {
      const out = String(await getWeather.invoke({ city: "London", country: "GB" }));
      if (out.startsWith("Error")) throw new Error(out);
      return out;
    });
  }
}

async function checkNewsSources() {
  section("9. News sources");
  const { PROVIDERS } = await import("../src/news/sources.js");
  let working = 0;
  await Promise.all(
    PROVIDERS.map(async (p) => {
      const missing = (p.requires ?? []).filter((v) => !process.env[v]);
      if (missing.length) return console.log(`  - ${p.name}: skipped (set ${missing.join(", ")})`);
      const passed = await check(
        p.name,
        async () => {
          const results = await p.search("technology", { limit: 5, maxAgeDays: 7 });
          if (!results.length) throw new Error("no results");
          return `${results.length} result(s)`;
        },
        { soft: true }
      );
      if (passed) working++;
    })
  );
  working ? ok(`${working} source(s) working`) : fail("no news source is working");
}

await checkEnv();
await checkDatabase();
await checkJwt();
await checkLLM();
await checkEmbeddings();
checkGoogle();
await checkSmtp();
await checkAgentTools();
await checkNewsSources();

console.log(`\n${counts.pass} passed, ${counts.warn} warning(s), ${counts.fail} failed`);
if (process.env.DATABASE_URL) {
  const { getPool } = await import("../src/db/index.js");
  await getPool().end().catch(() => {});
}
process.exit(counts.fail ? 1 : 0);
