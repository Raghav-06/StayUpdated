import { bingNews, duckduckgo, gdelt, googleNews, googleSearch, wikipedia } from "./providers/web.js";
import { bluesky, hackerNews, mastodon, reddit, youtube } from "./providers/social.js";

export const PROVIDERS = [
  bingNews,
  googleNews,
  googleSearch,
  gdelt,
  duckduckgo,
  hackerNews,
  reddit,
  bluesky,
  mastodon,
  youtube,
  wikipedia,
];

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) {
      if (key.startsWith("utm_") || key === "ocid") u.searchParams.delete(key);
    }
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/**
 * Searches every provider in parallel, plus any URLs the caller supplied directly.
 * A provider that is missing its credentials is skipped; one that errors is reported. Neither is fatal.
 */
export async function discoverAll(topic, { perSource = 15, maxAgeDays = 7, extraUrls = [] } = {}) {
  const providerStatus = {};
  const active = PROVIDERS.filter((p) => {
    const missing = (p.requires ?? []).filter((v) => !process.env[v]);
    if (missing.length) providerStatus[p.name] = { ok: false, skipped: `set ${missing.join(", ")} to enable` };
    return !missing.length;
  });

  const settled = await Promise.allSettled(
    active.map((p) => p.search(topic, { limit: perSource, maxAgeDays }))
  );

  const candidates = extraUrls.map((url) => ({
    kind: "article", title: "", url, source: null, publishedAt: null, text: "", fetch: true, discoveredVia: "user",
  }));

  active.forEach((p, i) => {
    const result = settled[i];
    if (result.status === "fulfilled") {
      providerStatus[p.name] = { ok: true, found: result.value.length };
      candidates.push(...result.value.map((c) => ({ ...c, discoveredVia: p.name })));
    } else {
      providerStatus[p.name] = { ok: false, error: result.reason?.message ?? String(result.reason) };
    }
  });

  const seen = new Set();
  const unique = [];
  for (const c of candidates) {
    const key = normalizeUrl(c.url);
    if (!key || !/^https?:/.test(key) || seen.has(key)) continue;
    seen.add(key);
    unique.push({ ...c, url: key });
  }

  return { candidates: unique, providerStatus };
}
