import { assertLLMConfigured, EMBEDDING_CONFIG, getEmbeddings, getLLM, LLM_CONFIG, toAIError } from "../config/llm.js";
import { discoverAll } from "./sources.js";
import { extractArticle } from "./extract.js";
import { stripHtml } from "./http.js";

const FETCH_CONCURRENCY = 6;
const MAX_PAGES_TO_FETCH = 30;
const MIN_ARTICLE_CHARS = 400;
const MIN_SNIPPET_CHARS = 120;
const MIN_PROVIDED_CHARS = 30;
const DUPLICATE_SIMILARITY = 0.92;
// How much of each item's text goes into the summary prompt.
const PROMPT_CHARS = { article: 1500, post: 400, video: 400, reference: 800 };

const MIN_RELEVANCE = Number(process.env.NEWS_MIN_RELEVANCE ?? 0.35);

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

const STOPWORDS = new Set(
  "a an and are as at be by for from has have in is it of on or that the to was were will with about after news latest".split(" ")
);
const HASH_DIMS = 1024;

function words(text) {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

// Bag-of-words vector, hashed into a fixed size so it can share cosine() with real embeddings.
function wordVector(text) {
  const vector = new Array(HASH_DIMS).fill(0);
  for (const w of words(text)) {
    let h = 0;
    for (const ch of w) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    vector[h % HASH_DIMS]++;
  }
  return vector;
}

/**
 * Scores how relevant each text is to the topic (0-1) and returns a vector per text for duplicate checks.
 * Uses the configured embedding model, or local keyword matching when there is none.
 */
async function scoreRelevance(topic, texts) {
  const embeddings = getEmbeddings();
  if (embeddings) {
    let topicVector, vectors;
    try {
      [topicVector, ...vectors] = await embeddings.embedDocuments([topic, ...texts]);
    } catch (err) {
      throw toAIError(err, { assumeConnection: true });
    }
    return vectors.map((vector) => ({ vector, relevance: cosine(topicVector, vector) }));
  }

  // Share of the topic's keywords that appear in the text.
  const topicWords = [...new Set(words(topic))];
  return texts.map((text) => {
    const present = new Set(words(text));
    const hits = topicWords.filter((w) => present.has(w)).length;
    return { vector: wordVector(text), relevance: topicWords.length ? hits / topicWords.length : 1 };
  });
}

function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// Turns a candidate into something with readable text, or marks it rejected.
async function readCandidate(candidate, timeoutMs) {
  if (!candidate.fetch) {
    const text = stripHtml(candidate.text);
    return text.length >= MIN_PROVIDED_CHARS
      ? { ...candidate, text, contentFrom: "provided" }
      : { ...candidate, rejected: "too little content" };
  }

  try {
    const page = await extractArticle(candidate.url, { timeoutMs });
    if (page.text.length < MIN_ARTICLE_CHARS) throw new Error(`only ${page.text.length} chars of readable text`);
    return {
      ...candidate,
      url: page.finalUrl,
      title: page.title || candidate.title,
      source: candidate.source || page.siteName || hostname(page.finalUrl),
      publishedAt: candidate.publishedAt || page.publishedAt,
      text: page.text,
      contentFrom: "page",
    };
  } catch (err) {
    // Many sites render with JavaScript or block bots; fall back to the search
    // result's own description when it is substantial enough to be useful.
    const snippet = stripHtml(candidate.text);
    if (snippet.length >= MIN_SNIPPET_CHARS && candidate.title) {
      return { ...candidate, source: candidate.source || hostname(candidate.url), text: snippet, contentFrom: "snippet" };
    }
    return { ...candidate, rejected: `could not read page: ${err.message}` };
  }
}

const CONTENT_RANK = { page: 0, snippet: 1, provided: 2 };

/**
 * Runs the whole news flow for a topic:
 *  1. discover candidates from news sites, web search, social media, YouTube and Wikipedia
 *  2. fetch article pages and extract their text
 *  3. validate: recent enough, enough content, relevant to the topic (embeddings or keywords), not a duplicate
 *  4. summarize the surviving items with the configured LLM, citing sources as [n]
 */
export async function getTopicNews(
  topic,
  { maxSources = 6, maxPosts = 5, maxVideos = 3, maxAgeDays = 7, region, urls = [], timeoutMs = 10000 } = {}
) {
  assertLLMConfigured(); // fail fast if the LLM is not configured, before scraping anything
  const startedAt = Date.now();
  const rejected = [];
  const reject = (item, reason) => rejected.push({ url: item.url, title: item.title, via: item.discoveredVia, reason });

  // 1. Discover
  const { candidates, providerStatus } = await discoverAll(topic, {
    perSource: Math.max(10, maxSources * 2),
    maxAgeDays,
    region,
    extraUrls: urls,
  });

  const cutoff = Date.now() - maxAgeDays * 86400000;
  const fresh = candidates.filter((c) => {
    const stale = c.kind !== "reference" && c.discoveredVia !== "user" && c.publishedAt && Date.parse(c.publishedAt) < cutoff;
    if (stale) reject(c, `older than ${maxAgeDays} days`);
    return !stale;
  });

  // 2. Read. Cap the number of page downloads so one request can't fetch hundreds of sites.
  let pagesLeft = MAX_PAGES_TO_FETCH;
  const toRead = fresh.filter((c) => {
    if (!c.fetch) return true;
    if (c.discoveredVia === "user" || pagesLeft-- > 0) return true;
    reject(c, "skipped: page fetch limit reached");
    return false;
  });

  const read = await mapWithConcurrency(toRead, FETCH_CONCURRENCY, (c) => readCandidate(c, timeoutMs));
  const readable = read.filter((item) => {
    if (item.rejected) reject(item, item.rejected);
    return !item.rejected;
  });

  if (readable.length === 0) {
    return { topic, summary: null, sources: [], rejected, providerStatus, message: "Nothing readable was found for this topic." };
  }

  // 3. Validate relevance and remove near-duplicates
  const scores = await scoreRelevance(
    topic,
    readable.map((a) => `${a.title}. ${a.text.slice(0, 1000)}`)
  );

  const scored = readable
    .map((a, i) => ({ ...a, ...scores[i] }))
    .sort((a, b) => CONTENT_RANK[a.contentFrom] - CONTENT_RANK[b.contentFrom] || b.relevance - a.relevance);

  const limits = { article: maxSources, post: maxPosts, video: maxVideos, reference: 1 };
  const counts = { article: 0, post: 0, video: 0, reference: 0 };
  const accepted = [];

  for (const a of scored) {
    if (a.relevance < MIN_RELEVANCE) {
      reject(a, `not relevant enough (score ${a.relevance.toFixed(2)})`);
      continue;
    }
    const duplicateOf = accepted.find((b) => cosine(a.vector, b.vector) >= DUPLICATE_SIMILARITY);
    if (duplicateOf) {
      reject(a, `duplicate of ${duplicateOf.url}`);
      continue;
    }
    if (counts[a.kind] >= limits[a.kind]) continue;
    counts[a.kind]++;
    accepted.push(a);
  }

  if (counts.article + counts.post + counts.video === 0) {
    return { topic, summary: null, sources: [], rejected, providerStatus, message: "Found results, but none were relevant enough to the topic." };
  }

  // 4. Summarize. Number the sources in a stable order: news, then posts, videos, background.
  const order = ["article", "post", "video", "reference"];
  accepted.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));

  const sources = accepted.map((a, i) => ({
    id: i + 1,
    kind: a.kind,
    title: a.title,
    url: a.url,
    source: a.source,
    publishedAt: a.publishedAt,
    relevance: Number(a.relevance.toFixed(3)),
    foundVia: a.discoveredVia,
    contentFrom: a.contentFrom,
    excerpt: a.text.slice(0, 280) + (a.text.length > 280 ? "…" : ""),
  }));

  const headings = {
    article: "NEWS ARTICLES",
    post: "SOCIAL MEDIA POSTS (public reactions, not verified facts)",
    video: "YOUTUBE VIDEOS (title and description only)",
    reference: "BACKGROUND (Wikipedia, not news)",
  };
  const context = order
    .map((kind) => {
      const items = accepted
        .map((a, i) => ({ a, n: i + 1 }))
        .filter(({ a }) => a.kind === kind)
        .map(({ a, n }) =>
          `[${n}] ${a.title}\nSource: ${a.source ?? "unknown"} | Published: ${a.publishedAt ?? "unknown"}\n` +
          a.text.slice(0, PROMPT_CHARS[kind])
        );
      return items.length ? `=== ${headings[kind]} ===\n\n${items.join("\n\n")}` : null;
    })
    .filter(Boolean)
    .join("\n\n");

  let completion;
  try {
    completion = await getLLM({ temperature: 0.3, maxTokens: 800 }).invoke([
      {
        role: "system",
        content:
          "You are a news analyst. Summarize ONLY the information in the provided sources. " +
          "Cite sources inline with their bracket numbers like [1] or [2][3]. " +
          "Base facts on news articles; treat social media posts as public reaction, not fact. " +
          "Do not invent facts, dates or numbers. If sources disagree, say so.",
      },
      {
        role: "user",
        content:
          `Topic: ${topic}\nToday's date: ${new Date().toISOString().slice(0, 10)}\n\n${context}\n\n` +
          "Write:\n1. A 2-3 sentence overview of the latest developments.\n" +
          "2. 'Key points:' followed by 4-7 bullet points, each with citations.\n" +
          "3. If there are social media posts or videos, 'What people are saying:' with 1-3 bullets.",
      },
    ]);
  } catch (err) {
    throw toAIError(err, { assumeConnection: true });
  }

  return {
    topic,
    summary: String(completion.content ?? "").trim(),
    sources,
    rejected,
    providerStatus,
    models: { chat: LLM_CONFIG.model, embedding: EMBEDDING_CONFIG.model || "local keyword matching" },
    stats: {
      discovered: candidates.length,
      readable: readable.length,
      accepted: counts,
      tookMs: Date.now() - startedAt,
    },
  };
}
