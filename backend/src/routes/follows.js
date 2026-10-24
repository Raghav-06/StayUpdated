import express, { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { verifyToken } from "../auth/tokens.js";
import { query } from "../db/index.js";
import { sendDigestNow, urlHash } from "../digest/digest.js";
import { escapeHtml } from "../digest/email.js";
import { requireAuth } from "../middleware/auth.js";
import { DEFAULT_REGION, isRegion } from "../news/regions.js";
import { httpError } from "../utils/httpError.js";
import { clampInt, requireString } from "./validate.js";

const router = Router();

const MAX_FOLLOWS = 10;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// `extraHtml` must already be safe HTML (it is never built from user input).
function page(title, message, extraHtml = "") {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · StayUpdated</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#07080d;color:#e8eaf2;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;">
<main style="max-width:420px;padding:32px;text-align:center;">
<div style="font-weight:700;color:#a78bfa;letter-spacing:.06em;">StayUpdated</div>
<h1 style="font-size:22px;color:#fff;">${escapeHtml(title)}</h1>
<p style="color:#8b90a5;line-height:1.6;">${escapeHtml(message)}</p>${extraHtml}
</main></body></html>`;
}

const EXPIRED = ["Link expired", "This unsubscribe link is invalid or has expired. You can turn the digest off in Settings."];

function unsubscribeUserId(token) {
  try {
    return verifyToken(String(token ?? ""), "unsubscribe").sub;
  } catch {
    return null;
  }
}

// Linked from every digest email; works without signing in. Opening the link only shows a
// confirm button: email security scanners open every link in a message, and a GET that
// unsubscribed would silently turn the digest off for people who never clicked.
router.get("/unsubscribe", (req, res) => {
  if (!unsubscribeUserId(req.query.token)) return res.status(400).type("html").send(page(...EXPIRED));
  const action = `?token=${encodeURIComponent(String(req.query.token))}`;
  res.type("html").send(
    page(
      "Unsubscribe from the daily digest?",
      "You'll stop getting emails about the topics you follow. You can turn the digest back on any time in Settings.",
      `<form method="post" action="${escapeHtml(action)}" style="margin-top:20px;">
<button type="submit" style="font:inherit;font-weight:600;color:#fff;background:#7c3aed;border:0;border-radius:8px;padding:10px 18px;cursor:pointer;">Unsubscribe</button>
</form>`
    )
  );
});

// The confirm button above, and one-click unsubscribe from mail apps (RFC 8058 List-Unsubscribe-Post).
router.post("/unsubscribe", express.urlencoded({ extended: false }), async (req, res) => {
  const userId = unsubscribeUserId(req.query.token);
  if (!userId) return res.status(400).type("html").send(page(...EXPIRED));
  await query(
    `UPDATE users SET preferences = preferences || '{"digestEnabled": false}'::jsonb, updated_at = now() WHERE id = $1`,
    [userId]
  );
  res.type("html").send(page("You're unsubscribed", "You won't get the daily digest anymore. You can turn it back on any time in Settings."));
});

router.use(requireAuth);

const FOLLOW_COLUMNS = "id, topic, region, params, created_at, last_checked_at, last_search_id";

router.get("/", async (req, res) => {
  const { rows } = await query(
    `SELECT ${FOLLOW_COLUMNS} FROM followed_topics WHERE user_id = $1 ORDER BY created_at`,
    [req.user.id]
  );
  res.json({ follows: rows, digestEnabled: req.user.preferences?.digestEnabled === true, limit: MAX_FOLLOWS });
});

// Follow a topic. Following from a search (searchId) links that search and counts its sources as
// already seen, so the first digest only has what's new since.
router.post("/", async (req, res) => {
  const topic = requireString(req.body, "topic").replace(/\s+/g, " ").slice(0, 200);
  const { region: rawRegion, searchId } = req.body;
  if (rawRegion !== undefined && !isRegion(rawRegion)) throw httpError(400, "'region' must be one of IN, US, GB, global");
  if (searchId !== undefined && !UUID_RE.test(searchId)) throw httpError(400, "'searchId' must be a search id");
  const region = rawRegion ?? (isRegion(req.user.preferences?.region) ? req.user.preferences.region : DEFAULT_REGION);
  const p = req.body.params ?? {};
  const params = {
    maxSources: clampInt(p.maxSources, 1, 10, 6),
    maxPosts: clampInt(p.maxPosts, 0, 10, 5),
    maxVideos: clampInt(p.maxVideos, 0, 10, 3),
    maxAgeDays: clampInt(p.maxAgeDays, 1, 30, 7),
  };

  let search = null;
  if (searchId) {
    const { rows } = await query("SELECT id, sources FROM news_searches WHERE id = $1 AND user_id = $2", [searchId, req.user.id]);
    if (!rows[0]) throw httpError(404, "Search not found");
    search = rows[0];
  }

  const existing = await query(
    `SELECT ${FOLLOW_COLUMNS} FROM followed_topics WHERE user_id = $1 AND lower(topic) = lower($2) AND region = $3`,
    [req.user.id, topic, region]
  );
  if (existing.rows[0]) return res.json({ follow: existing.rows[0] });

  // The count check and insert are one statement, so parallel requests can't pass the limit.
  const { rows } = await query(
    `INSERT INTO followed_topics (user_id, topic, region, params, last_search_id)
     SELECT $1, $2, $3, $4, $5
      WHERE (SELECT count(*) FROM followed_topics WHERE user_id = $1) < $6
     ON CONFLICT DO NOTHING
     RETURNING ${FOLLOW_COLUMNS}`,
    [req.user.id, topic, region, params, search?.id ?? null, MAX_FOLLOWS]
  );
  if (!rows[0]) throw httpError(400, `You can follow up to ${MAX_FOLLOWS} topics. Unfollow one to add another.`);
  const follow = rows[0];

  if (search?.sources.length) {
    await query(
      `INSERT INTO followed_seen_urls (followed_topic_id, url_hash) SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING`,
      [follow.id, search.sources.map((s) => urlHash(s.url))]
    );
  }
  // Following is opting in to the digest, unless the user already chose otherwise.
  await query(
    `UPDATE users SET preferences = preferences || '{"digestEnabled": true}'::jsonb
      WHERE id = $1 AND NOT preferences ? 'digestEnabled'`,
    [req.user.id]
  );
  res.status(201).json({ follow });
});

router.delete("/:id", async (req, res) => {
  if (!UUID_RE.test(req.params.id)) throw httpError(404, "Followed topic not found");
  const { rowCount } = await query("DELETE FROM followed_topics WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
  if (!rowCount) throw httpError(404, "Followed topic not found");
  res.status(204).end();
});

// Sends the user's digest right away. Each one runs real searches, so it's limited.
const digestNowLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  keyGenerator: (req) => req.user.id,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "You can send your digest 3 times an hour. Please try again later." },
});

router.post("/digest-now", digestNowLimiter, async (req, res) => {
  const result = await sendDigestNow(req.user);
  if (result.busy) throw httpError(409, "Your digest is already being prepared. Check your inbox in a minute.");
  const message = !result.topics
    ? "You don't follow any topics yet."
    : result.emailed
      ? `Sent! ${result.newSources} new ${result.newSources === 1 ? "source" : "sources"} on your topics.`
      : "Nothing new since your last digest, so no email was sent.";
  res.json({ ...result, message });
});

export default router;
