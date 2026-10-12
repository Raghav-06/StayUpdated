// Runs a news search for a user: serve it from the recent-search cache when possible,
// otherwise run the pipeline, then save it to the user's history.
import { createHash } from "node:crypto";
import { query } from "../db/index.js";
import { httpError } from "../utils/httpError.js";
import { getTopicNews } from "./pipeline.js";
import { normalizeUrl } from "./sources.js";

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
    `SELECT summary, context, sources, provider_status, stats, models, created_at
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
    `INSERT INTO news_searches (user_id, topic, params, summary, sources, provider_status, stats, models, cache_key, context)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
      result.context ?? null,
    ]
  );
  return rows[0];
}

// The user's earlier search this one is compared against (Refresh).
async function loadPrevious(userId, searchId) {
  const { rows } = await query(
    "SELECT id, created_at, sources FROM news_searches WHERE id = $1 AND user_id = $2",
    [searchId, userId]
  );
  if (!rows[0]) throw httpError(404, "The search to compare with was not found");
  return rows[0];
}

// Flags each source whose URL wasn't in the previous search, and records what it was compared with.
function markNew(result, previous) {
  const seen = new Set(previous.sources.map((s) => normalizeUrl(s.url) ?? s.url));
  const sources = result.sources.map((s) => ({ ...s, isNew: !seen.has(normalizeUrl(s.url) ?? s.url) }));
  return {
    ...result,
    sources,
    stats: {
      ...result.stats,
      comparedTo: { id: previous.id, createdAt: previous.created_at, newCount: sources.filter((s) => s.isNew).length },
    },
  };
}

/**
 * Searches `topic` for `userId` and saves the result to their history.
 * With `previousSearchId` (one of the user's searches), sources not in that search get isNew = true.
 * Searches that include the user's own URLs are never cached or served from the cache,
 * since those URLs (and what was rejected from them) are private to the user.
 */
export async function runSearch({ userId, topic, params, force = false, previousSearchId, onEvent, signal }) {
  const cacheKey = params.urls?.length ? null : cacheKeyFor(topic, params);
  const previous = previousSearchId ? await loadPrevious(userId, previousSearchId) : null;
  const save = async (result) => {
    const final = previous ? markNew(result, previous) : result;
    const saved = await insertSearch(userId, topic, params, final, cacheKey);
    // The context is only stored for follow-up questions; clients don't need it.
    const { context, ...response } = final;
    return { id: saved.id, createdAt: saved.created_at, params, ...response };
  };

  if (cacheKey && !force) {
    const cached = await findCached(cacheKey);
    if (cached) {
      // Drop flags that belong to whichever search the cached copy was compared with.
      const { comparedTo, ...stats } = cached.stats;
      return save({
        topic,
        summary: cached.summary,
        context: cached.context,
        sources: cached.sources.map(({ isNew, ...s }) => s),
        rejected: [],
        providerStatus: cached.provider_status,
        models: cached.models,
        stats: { ...stats, cached: true, cachedFrom: cached.created_at },
      });
    }
  }

  const result = await getTopicNews(topic, { ...params, onEvent, signal });

  // Nothing usable was found: show it to the user, but don't clutter their history with it.
  if (!result.sources.length) return result;

  return save(result);
}
