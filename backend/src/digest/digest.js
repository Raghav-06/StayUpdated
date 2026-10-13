// The daily digest: for each user with the digest on, search every topic they follow,
// keep the sources they haven't been sent before, and email them one digest.
import { createHash } from "node:crypto";
import { sendDigest } from "../auth/mailer.js";
import { signUnsubscribeToken } from "../auth/tokens.js";
import { getPool, query } from "../db/index.js";
import { runSearch } from "../news/searches.js";
import { normalizeUrl } from "../news/sources.js";
import { buildDigestEmail } from "./email.js";

const CONCURRENCY = 2; // topic searches at once, across all users
const SEEN_URL_DAYS = 30;
export const LAST_FULL_RUN_KEY = "digest_last_full_run";
// Postgres advisory lock id, so runs in different processes (server, `npm run digest`, more instances) never overlap.
const RUN_LOCK_ID = 7_310_442;

// Search options for a followed topic; the follow's own saved params win.
const DEFAULT_PARAMS = { maxSources: 6, maxPosts: 5, maxVideos: 3, maxAgeDays: 7 };

const frontendUrl = () => (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
const backendUrl = () => (process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/$/, "");

export function urlHash(url) {
  return createHash("sha256").update(normalizeUrl(url) ?? url).digest("hex");
}

export function unsubscribeUrl(userId) {
  return `${backendUrl()}/api/follows/unsubscribe?token=${encodeURIComponent(signUnsubscribeToken(userId))}`;
}

// Runs at most `max` of the given tasks at a time.
function createLimiter(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || !queue.length) return;
    active++;
    const { task, resolve, reject } = queue.shift();
    task()
      .then(resolve, reject)
      .finally(() => {
        active--;
        next();
      });
  };
  return (task) =>
    new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      next();
    });
}

// Searches one followed topic (reusing the recent-search cache) and saves it to the user's history.
async function checkTopic(userId, follow) {
  const params = { ...DEFAULT_PARAMS, ...follow.params, region: follow.region, urls: [] };
  const result = await runSearch({ userId, topic: follow.topic, params });
  if (!result.id) return { follow, result: null, fresh: [] }; // nothing usable found today

  const hashes = result.sources.map((s) => urlHash(s.url));
  const { rows } = await query(
    "SELECT url_hash FROM followed_seen_urls WHERE followed_topic_id = $1 AND url_hash = ANY($2)",
    [follow.id, hashes]
  );
  const seen = new Set(rows.map((r) => r.url_hash));
  const fresh = result.sources.filter((s, i) => !seen.has(hashes[i]));
  return { follow, result, fresh, freshHashes: hashes.filter((h) => !seen.has(h)) };
}

// Records what was sent, and when each topic was last checked.
async function recordChecked(checked) {
  for (const { follow, result, freshHashes = [] } of checked) {
    if (freshHashes.length) {
      await query(
        `INSERT INTO followed_seen_urls (followed_topic_id, url_hash)
         SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING`,
        [follow.id, freshHashes]
      );
    }
    await query(
      "UPDATE followed_topics SET last_checked_at = now(), last_search_id = COALESCE($2, last_search_id) WHERE id = $1",
      [follow.id, result?.id ?? null]
    );
  }
}

/** One user's digest. Throws only if the email couldn't be sent; failed topics are counted and skipped. */
async function digestUser(user, follows, limit) {
  const settled = await Promise.allSettled(follows.map((f) => limit(() => checkTopic(user.id, f))));
  const checked = [];
  let failedTopics = 0;
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") return checked.push(s.value);
    failedTopics++;
    console.error(`Digest: topic "${follows[i].topic}" failed for user ${user.id}: ${s.reason?.message ?? s.reason}`);
  });

  const withNews = checked.filter((c) => c.fresh.length);
  if (withNews.length) {
    const unsubscribe = unsubscribeUrl(user.id);
    const { subject, html, text } = buildDigestEmail({ user, items: withNews, frontendUrl: frontendUrl(), unsubscribeUrl: unsubscribe });
    await sendDigest(user.email, html, text, { subject, unsubscribeUrl: unsubscribe });
  }
  // Only after the email went out, so a failed send is retried with the same sources next time.
  await recordChecked(checked);

  return {
    topics: checked.length,
    failedTopics,
    newSources: withNews.reduce((n, c) => n + c.fresh.length, 0),
    emailed: withNews.length > 0,
  };
}

// Users being processed right now, so "send now" and the scheduled run never double-send.
const busyUsers = new Set();
let fullRunInProgress = false;

async function loadFollows(userId) {
  const { rows } = await query(
    "SELECT id, topic, region, params FROM followed_topics WHERE user_id = $1 ORDER BY created_at",
    [userId]
  );
  return rows;
}

/** "Send me my digest now": the user's digest right away, whether or not the daily one is on. */
export async function sendDigestNow(user) {
  if (busyUsers.has(user.id)) return { busy: true };
  busyUsers.add(user.id);
  try {
    const follows = await loadFollows(user.id);
    if (!follows.length) return { topics: 0, failedTopics: 0, newSources: 0, emailed: false };
    return await digestUser(user, follows, createLimiter(CONCURRENCY));
  } finally {
    busyUsers.delete(user.id);
  }
}

async function fullRun() {
  const startedAt = Date.now();
  const stats = { users: 0, topics: 0, emailsSent: 0, failures: 0 };
  try {
    await query("DELETE FROM followed_seen_urls WHERE first_seen_at < now() - make_interval(days => $1)", [SEEN_URL_DAYS]);

    const { rows: users } = await query(
      `SELECT u.id, u.email, u.name FROM users u
        WHERE (u.preferences->>'digestEnabled')::boolean IS TRUE
          AND EXISTS (SELECT 1 FROM followed_topics f WHERE f.user_id = u.id)`
    );
    const limit = createLimiter(CONCURRENCY);

    await Promise.all(
      users.map(async (user) => {
        if (busyUsers.has(user.id)) return; // a "send now" is running for them
        busyUsers.add(user.id);
        try {
          const result = await digestUser(user, await loadFollows(user.id), limit);
          stats.users++;
          stats.topics += result.topics;
          stats.failures += result.failedTopics;
          if (result.emailed) stats.emailsSent++;
        } catch (err) {
          stats.users++;
          stats.failures++;
          console.error(`Digest: failed for user ${user.id}: ${err.message}`);
        } finally {
          busyUsers.delete(user.id);
        }
      })
    );

    await query(
      `INSERT INTO app_state (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [LAST_FULL_RUN_KEY, JSON.stringify({ at: new Date().toISOString(), ...stats })]
    );
    return stats;
  } finally {
    console.log(
      `Digest run: ${stats.users} users, ${stats.topics} topics, ${stats.emailsSent} emails sent, ` +
        `${stats.failures} failures (${((Date.now() - startedAt) / 1000).toFixed(1)}s)`
    );
  }
}

/**
 * The full daily run over every user with the digest on and at least one follow.
 * Returns a summary; one user's failure never stops the others. Overlapping runs are skipped,
 * in this process and (through a Postgres advisory lock) across processes.
 */
export async function runDigest() {
  if (fullRunInProgress) {
    console.warn("Digest: previous run still in progress, skipping this one");
    return { skipped: true };
  }
  fullRunInProgress = true;
  let client;
  let locked = false;
  try {
    client = await getPool().connect();
    locked = (await client.query("SELECT pg_try_advisory_lock($1) AS ok", [RUN_LOCK_ID])).rows[0].ok;
    if (!locked) {
      console.warn("Digest: another process is running the digest, skipping this one");
      return { skipped: true };
    }
    return await fullRun();
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock($1)", [RUN_LOCK_ID]).catch(() => {});
    client?.release();
    fullRunInProgress = false;
  }
}

/** When the last full run finished (a Date), or null if it never has. */
export async function lastFullRun() {
  const { rows } = await query("SELECT value->>'at' AS at FROM app_state WHERE key = $1", [LAST_FULL_RUN_KEY]);
  return rows[0]?.at ? new Date(rows[0].at) : null;
}
