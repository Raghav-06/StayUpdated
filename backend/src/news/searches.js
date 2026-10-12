// Runs a news search for a user: serve it from the recent-search cache when possible,
// otherwise run the pipeline, then save it to the user's history.
import { createHash } from "node:crypto";
import { query } from "../db/index.js";
import { getTopicNews } from "./pipeline.js";

// 0 disables the cache.
const CACHE_MINUTES = Number(process.env.NEWS_CACHE_MINUTES ?? 15);

export function normalizeTopic(topic) {
  return topic.trim().toLowerCase().replace(/\s+/g, " ");
}

// Same topic + same options = same results, whoever asked.
export function cacheKeyFor(topic, { region, maxAgeDays, maxSources, maxPosts, maxVideos }) {
  return createHash("sha256")
    .update(JSON.stringify([normalizeTopic(topic), region, maxAgeDays, maxSources, maxPosts, maxVideos]))
    .digest("hex");
}

// The newest real (non-copied) result for this key, so copies never extend a result's lifetime.
async function findCached(cacheKey) {
  if (!(CACHE_MINUTES > 0)) return null;
  const { rows } = await query(
    `SELECT summary, sources, provider_status, stats, models, created_at
       FROM news_searches
      WHERE cache_key = $1 AND created_at > now() - make_interval(mins => $2)
        AND NOT COALESCE((stats->>'cached')::boolean, false)
      ORDER BY created_at DESC LIMIT 1`,
    [cacheKey, CACHE_MINUTES]
  );
  return rows[0] ?? null;
}

async function insertSearch(userId, topic, params, result, cacheKey) {
  const { rows } = await query(
    `INSERT INTO news_searches (user_id, topic, params, summary, sources, provider_status, stats, models, cache_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, created_at`,
    [
      userId,
      topic,
      params,
      result.summary,
      JSON.stringify(result.sources),
      result.providerStatus,
      result.stats ?? {},
      result.models ?? {},
      cacheKey,
    ]
  );
  return rows[0];
}

/**
 * Searches `topic` for `userId` and saves the result to their history.
 * Searches that include the user's own URLs are never cached or served from the cache,
 * since those URLs (and what was rejected from them) are private to the user.
 */
export async function runSearch({ userId, topic, params, force = false, onEvent, signal }) {
  const cacheKey = params.urls?.length ? null : cacheKeyFor(topic, params);

  if (cacheKey && !force) {
    const cached = await findCached(cacheKey);
    if (cached) {
      const result = {
        topic,
        summary: cached.summary,
        sources: cached.sources,
        rejected: [],
        providerStatus: cached.provider_status,
        models: cached.models,
        stats: { ...cached.stats, cached: true, cachedFrom: cached.created_at },
      };
      const saved = await insertSearch(userId, topic, params, result, cacheKey);
      return { id: saved.id, createdAt: saved.created_at, ...result };
    }
  }

  const result = await getTopicNews(topic, { ...params, onEvent, signal });

  // Nothing usable was found: show it to the user, but don't clutter their history with it.
  if (!result.sources.length) return result;

  const saved = await insertSearch(userId, topic, params, result, cacheKey);
  return { id: saved.id, createdAt: saved.created_at, ...result };
}
