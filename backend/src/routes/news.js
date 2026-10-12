import { Router } from "express";
import { query } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { runSearch } from "../news/searches.js";
import { DEFAULT_REGION, isRegion } from "../news/regions.js";
import { httpError } from "../utils/httpError.js";
import { clampInt, requireString } from "./validate.js";

const router = Router();
router.use(requireAuth);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Rejects anything that isn't an absolute http(s) URL; private hosts are filtered later by safeFetch.
function validateUrl(value) {
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw httpError(400, `Invalid URL: "${value}"`);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw httpError(400, `Only http:// and https:// URLs are allowed: "${value}"`);
  }
  return url.href;
}

function requireUuid(value) {
  if (!UUID_RE.test(value)) throw httpError(404, "Search not found");
  return value;
}

// Reads and validates the search options shared by /search and /search/stream.
function parseSearchRequest(req) {
  const topic = requireString(req.body, "topic");
  const { urls, region } = req.body;

  if (urls !== undefined && (!Array.isArray(urls) || urls.some((u) => typeof u !== "string"))) {
    throw httpError(400, "'urls' must be an array of strings");
  }
  if (region !== undefined && !isRegion(region)) throw httpError(400, "'region' must be one of IN, US, GB, global");

  const params = {
    region: region ?? (isRegion(req.user.preferences?.region) ? req.user.preferences.region : DEFAULT_REGION),
    maxSources: clampInt(req.body.maxSources, 1, 10, 6),
    maxPosts: clampInt(req.body.maxPosts, 0, 10, 5),
    maxVideos: clampInt(req.body.maxVideos, 0, 10, 3),
    maxAgeDays: clampInt(req.body.maxAgeDays, 1, 30, 7),
    urls: (urls ?? []).slice(0, 10).map(validateUrl),
  };
  return { topic, params, force: req.body.force === true };
}

// Pipeline: discover -> fetch -> validate -> summarize (or a recent cached result), saved to the user's history.
router.post("/search", async (req, res) => {
  const { topic, params, force } = parseSearchRequest(req);
  res.json(await runSearch({ userId: req.user.id, topic, params, force }));
});

router.get("/history", async (req, res) => {
  const limit = clampInt(req.query.limit, 1, 100, 20);
  const offset = clampInt(req.query.offset, 0, 1_000_000, 0);
  const { rows } = await query(
    `SELECT id, topic, created_at, left(summary, 200) AS summary_preview,
            jsonb_array_length(sources) AS source_count
       FROM news_searches WHERE user_id = $1
      ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [req.user.id, limit, offset]
  );
  res.json({ searches: rows, limit, offset });
});

router.get("/history/:id", async (req, res) => {
  const { rows } = await query(
    "SELECT * FROM news_searches WHERE id = $1 AND user_id = $2",
    [requireUuid(req.params.id), req.user.id]
  );
  if (!rows[0]) throw httpError(404, "Search not found");
  res.json(rows[0]);
});

router.delete("/history/:id", async (req, res) => {
  const { rowCount } = await query(
    "DELETE FROM news_searches WHERE id = $1 AND user_id = $2",
    [requireUuid(req.params.id), req.user.id]
  );
  if (!rowCount) throw httpError(404, "Search not found");
  res.status(204).end();
});

export default router;
