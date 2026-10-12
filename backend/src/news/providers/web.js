// News sites and general web search. Each provider returns candidates in the shared shape:
// { kind, title, url, source, publishedAt, text, fetch, discoveredVia }
// `fetch: true` means the pipeline should download the page and extract the full article.
import { XMLParser } from "fast-xml-parser";
import { parseHTML } from "linkedom";
import { decodeEntities, fetchJson, fetchText, stripHtml, toDate } from "../http.js";
import { regionSettings } from "../regions.js";

const xml = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true });

function rssItems(body) {
  return [xml.parse(body)?.rss?.channel?.item ?? []].flat();
}

// Bing wraps every link in a click-tracker; the real article URL is in the `url` param.
function unwrapParam(link, param) {
  try {
    return new URL(link, "https://example.com").searchParams.get(param) || link;
  } catch {
    return link;
  }
}

export const bingNews = {
  name: "bing-news",
  async search(topic, { limit, region }) {
    const market = regionSettings(region).bing;
    const body = await fetchText(
      `https://www.bing.com/news/search?q=${encodeURIComponent(topic)}&format=rss&count=${limit}` +
        (market ? `&setmkt=${market.setmkt}&cc=${market.cc}` : "")
    );
    return rssItems(body).slice(0, limit).map((item) => ({
      kind: "article",
      title: decodeEntities(item.title),
      url: unwrapParam(String(item.link ?? ""), "url"),
      source: item.Source ? String(item.Source) : null,
      publishedAt: toDate(item.pubDate),
      text: stripHtml(item.description),
      fetch: true,
    }));
  },
};

// Google News links are opaque redirects that can't be read without a browser,
// so these are used as headlines (title + outlet + date) rather than full articles.
export const googleNews = {
  name: "google-news",
  async search(topic, { limit, maxAgeDays, region }) {
    const q = encodeURIComponent(`${topic} when:${maxAgeDays}d`);
    const body = await fetchText(`https://news.google.com/rss/search?q=${q}&${regionSettings(region).googleNews}`);
    return rssItems(body).slice(0, limit).map((item) => {
      const source = item.source ? String(item.source) : null;
      let title = decodeEntities(item.title);
      if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
      return {
        kind: "article",
        title,
        url: String(item.link ?? ""),
        source,
        publishedAt: toDate(item.pubDate),
        text: title,
        fetch: false,
      };
    });
  },
};

// GDELT dates look like 20261001T094500Z.
function parseGdeltDate(value) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value ?? "");
  return m ? toDate(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`) : null;
}

export const gdelt = {
  name: "gdelt",
  async search(topic, { limit, maxAgeDays, region }) {
    // GDELT uses FIPS country codes (the UK is "UK", not "GB").
    const country = regionSettings(region).gdelt;
    const query = `${topic} sourcelang:english${country ? ` sourcecountry:${country}` : ""}`;
    const body = await fetchText(
      "https://api.gdeltproject.org/api/v2/doc/doc" +
        `?query=${encodeURIComponent(query)}` +
        `&mode=artlist&format=json&sort=datedesc&maxrecords=${limit}&timespan=${maxAgeDays}d`
    );
    // GDELT answers with a plain-text message (not JSON) when rate limited.
    if (!body.trimStart().startsWith("{")) throw new Error(body.slice(0, 120));
    return (JSON.parse(body).articles ?? []).map((a) => ({
      kind: "article",
      title: a.title ?? "",
      url: a.url,
      source: a.domain ?? null,
      publishedAt: parseGdeltDate(a.seendate),
      text: "",
      fetch: true,
    }));
  },
};

// General web search via DuckDuckGo's HTML endpoint, limited to the past week/month.
export const duckduckgo = {
  name: "duckduckgo",
  async search(topic, { limit, maxAgeDays, region }) {
    const df = maxAgeDays <= 1 ? "d" : maxAgeDays <= 7 ? "w" : "m";
    const body = await fetchText(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`${topic} news`)}&df=${df}&kl=${regionSettings(region).ddg}`
    );
    const { document } = parseHTML(body);

    return [...document.querySelectorAll(".result")]
      .filter((el) => !el.classList.contains("result--ad"))
      .map((el) => {
        const link = el.querySelector(".result__a");
        return {
          kind: "article",
          title: link?.textContent?.trim() ?? "",
          url: unwrapParam(link?.getAttribute("href") ?? "", "uddg"),
          source: el.querySelector(".result__url")?.textContent?.trim() || null,
          publishedAt: null,
          text: el.querySelector(".result__snippet")?.textContent?.trim() ?? "",
          fetch: true,
        };
      })
      // Skip site home pages and topic hubs; we want individual stories.
      .filter((c) => {
        try {
          return new URL(c.url).pathname.split("/").filter(Boolean).length >= 2;
        } catch {
          return false;
        }
      })
      .slice(0, limit);
  },
};

// Google results through Serper.dev (Google blocks direct scraping). Optional: needs SERPER_API_KEY.
function parseRelativeDate(value) {
  const m = /(\d+)\s+(minute|hour|day|week|month)s?\s+ago/i.exec(value ?? "");
  if (!m) return toDate(value);
  const unitMs = { minute: 6e4, hour: 36e5, day: 864e5, week: 6048e5, month: 2592e6 }[m[2].toLowerCase()];
  return new Date(Date.now() - Number(m[1]) * unitMs).toISOString();
}

export const googleSearch = {
  name: "google-search",
  requires: ["SERPER_API_KEY"],
  async search(topic, { limit, maxAgeDays, region }) {
    const tbs = maxAgeDays <= 1 ? "qdr:d" : maxAgeDays <= 7 ? "qdr:w" : "qdr:m";
    const gl = regionSettings(region).serper;
    const data = await fetchJson("https://google.serper.dev/news", {
      method: "POST",
      headers: { "X-API-KEY": process.env.SERPER_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ q: topic, tbs, num: limit, ...(gl && { gl }) }),
    });
    return (data.news ?? []).map((n) => ({
      kind: "article",
      title: n.title ?? "",
      url: n.link,
      source: n.source ?? null,
      publishedAt: parseRelativeDate(n.date),
      text: n.snippet ?? "",
      fetch: true,
    }));
  },
};

// Background context (not news): the best-matching Wikipedia article's summary.
export const wikipedia = {
  name: "wikipedia",
  async search(topic) {
    const headers = { "User-Agent": "StayUpdated/1.0 (news summarizer backend)" };
    const found = await fetchJson(
      "https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=1" +
        `&srsearch=${encodeURIComponent(topic)}`,
      { headers }
    );
    const title = found?.query?.search?.[0]?.title;
    if (!title) return [];

    const page = await fetchJson(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`,
      { headers }
    );
    return [
      {
        kind: "reference",
        title: page.title ?? title,
        url: page.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
        source: "Wikipedia",
        publishedAt: toDate(page.timestamp),
        text: page.extract ?? "",
        fetch: false,
      },
    ];
  },
};
