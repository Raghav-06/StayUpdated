import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { USER_AGENT, withTimeout } from "./http.js";
import { safeFetch } from "./safeFetch.js";

const MAX_HTML_BYTES = 3 * 1024 * 1024;

function meta(document, ...names) {
  for (const name of names) {
    const el =
      document.querySelector(`meta[property="${name}"]`) ||
      document.querySelector(`meta[name="${name}"]`);
    const content = el?.getAttribute("content")?.trim();
    if (content) return content;
  }
  return null;
}

/**
 * Downloads a page and pulls out the readable article body.
 * Throws with a human-readable reason when the page can't be used.
 */
export async function extractArticle(url, { timeoutMs = 10000, signal } = {}) {
  // safeFetch refuses private/local hosts and checks every redirect hop.
  const res = await safeFetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
    signal: withTimeout(signal, timeoutMs),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("html")) throw new Error(`not an HTML page (${type || "unknown type"})`);

  const html = await res.text();
  if (html.length > MAX_HTML_BYTES) throw new Error("page too large");

  const { document } = parseHTML(html);
  const publishedAt = meta(document, "article:published_time", "og:published_time", "pubdate", "date");
  const siteName = meta(document, "og:site_name");
  const article = new Readability(document).parse();
  const text = (article?.textContent ?? "").replace(/\s+/g, " ").trim();

  return {
    finalUrl: res.url || url,
    title: article?.title?.trim() || meta(document, "og:title") || "",
    siteName: article?.siteName || siteName,
    publishedAt,
    text,
  };
}
