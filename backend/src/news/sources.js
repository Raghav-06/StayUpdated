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

export function normalizeUrl(url) {
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
 * `onProvider(name, status)` is called as each provider finishes.
 */
export async function discoverAll(topic, { perSource = 15, maxAgeDays = 7, region, extraUrls = [], signal, onProvider } = {}) {
  const status = {};
  const report = (name, s) => {
    status[name] = s;
    onProvider?.(name, s);
  };

  const active = PROVIDERS.filter((p) => {
    const missing = (p.requires ?? []).filter((v) => !process.env[v]);
    if (missing.length) report(p.name, { ok: false, skipped: `set ${missing.join(", ")} to enable` });
    return !missing.length;
  });

  const settled = await Promise.allSettled(
    active.map((p) =>
      p.search(topic, { limit: perSource, maxAgeDays, region, signal }).then(
        (found) => (report(p.name, { ok: true, found: found.length }), found),
        (err) => {
          report(p.name, { ok: false, error: err?.message ?? String(err) });
          throw err;
        }
      )
    )
  );
  signal?.throwIfAborted();

  // Same order as PROVIDERS, whatever order they finished in.
  const providerStatus = Object.fromEntries(PROVIDERS.filter((p) => status[p.name]).map((p) => [p.name, status[p.name]]));

  const candidates = extraUrls.map((url) => ({
    kind: "article", title: "", url, source: null, publishedAt: null, text: "", fetch: true, discoveredVia: "user",
  }));

  active.forEach((p, i) => {
    const result = settled[i];
    if (result.status === "fulfilled") {
      candidates.push(...result.value.map((c) => ({ ...c, discoveredVia: p.name })));
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
