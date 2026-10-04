// Social media and video platforms. Same candidate shape as web.js.
import { decodeEntities, fetchJson, stripHtml, toDate } from "../http.js";

// Hacker News (Algolia API, no key). Link posts point at real articles we can read.
export const hackerNews = {
  name: "hacker-news",
  async search(topic, { limit, maxAgeDays }) {
    const since = Math.floor(Date.now() / 1000) - maxAgeDays * 86400;
    const data = await fetchJson(
      "https://hn.algolia.com/api/v1/search" +
        `?query=${encodeURIComponent(topic)}&tags=story&hitsPerPage=${limit}` +
        `&numericFilters=created_at_i>${since}`
    );
    return (data.hits ?? []).map((h) => {
      const discussion = `https://news.ycombinator.com/item?id=${h.objectID}`;
      return h.url
        ? { kind: "article", title: h.title, url: h.url, source: "Hacker News", publishedAt: toDate(h.created_at), text: h.title, fetch: true }
        : { kind: "post", title: h.title, url: discussion, source: "Hacker News", publishedAt: toDate(h.created_at), text: stripHtml(h.story_text) || h.title, fetch: false };
    });
  },
};

// Mastodon public hashtag timeline (no key). "electric vehicles" -> #electricvehicles
export const mastodon = {
  name: "mastodon",
  async search(topic, { limit }) {
    const tag = topic.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!tag) return [];
    const instance = process.env.MASTODON_INSTANCE || "https://mastodon.social";
    const statuses = await fetchJson(`${instance}/api/v1/timelines/tag/${tag}?limit=${Math.min(limit, 40)}`);
    return statuses
      .filter((s) => !s.sensitive && (!s.language || s.language === "en"))
      .map((s) => {
        const text = stripHtml(s.content);
        return {
          kind: "post",
          title: text.slice(0, 100),
          url: s.url ?? s.uri,
          source: `Mastodon · @${s.account?.acct ?? "unknown"}`,
          publishedAt: toDate(s.created_at),
          text,
          fetch: false,
        };
      });
  },
};

// Reddit requires OAuth for API access. A free "script" app at reddit.com/prefs/apps
// gives a client id/secret; we use the app-only (client_credentials) flow.
let redditToken = { value: null, expiresAt: 0 };

async function getRedditToken() {
  if (redditToken.value && Date.now() < redditToken.expiresAt) return redditToken.value;
  const basic = Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString("base64");
  const data = await fetchJson("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  redditToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return redditToken.value;
}

export const reddit = {
  name: "reddit",
  requires: ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET"],
  async search(topic, { limit, maxAgeDays }) {
    const t = maxAgeDays <= 1 ? "day" : maxAgeDays <= 7 ? "week" : "month";
    const data = await fetchJson(
      `https://oauth.reddit.com/search?q=${encodeURIComponent(topic)}&sort=relevance&t=${t}&limit=${limit}&type=link`,
      { headers: { Authorization: `Bearer ${await getRedditToken()}`, "User-Agent": "StayUpdated/1.0" } }
    );
    return (data.data?.children ?? [])
      .map((c) => c.data)
      .filter((p) => !p.over_18)
      .map((p) => ({
        kind: "post",
        title: decodeEntities(p.title),
        url: `https://www.reddit.com${p.permalink}`,
        source: `Reddit · r/${p.subreddit} (${p.score} upvotes)`,
        publishedAt: toDate(p.created_utc * 1000),
        text: [decodeEntities(p.title), decodeEntities(p.selftext ?? "")].filter(Boolean).join(". "),
        fetch: false,
      }));
  },
};

// Bluesky search needs a logged-in session. Use an app password (Settings -> App passwords).
let bskySession = { jwt: null, expiresAt: 0 };

async function getBskyJwt() {
  if (bskySession.jwt && Date.now() < bskySession.expiresAt) return bskySession.jwt;
  const data = await fetchJson("https://bsky.social/xrpc/com.atproto.server.createSession", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: process.env.BSKY_HANDLE, password: process.env.BSKY_APP_PASSWORD }),
  });
  bskySession = { jwt: data.accessJwt, expiresAt: Date.now() + 90 * 60 * 1000 };
  return bskySession.jwt;
}

export const bluesky = {
  name: "bluesky",
  requires: ["BSKY_HANDLE", "BSKY_APP_PASSWORD"],
  async search(topic, { limit, maxAgeDays }) {
    const since = new Date(Date.now() - maxAgeDays * 86400000).toISOString();
    const data = await fetchJson(
      "https://bsky.social/xrpc/app.bsky.feed.searchPosts" +
        `?q=${encodeURIComponent(topic)}&sort=top&lang=en&limit=${Math.min(limit, 100)}&since=${since}`,
      { headers: { Authorization: `Bearer ${await getBskyJwt()}` } }
    );
    return (data.posts ?? []).map((p) => {
      const rkey = p.uri.split("/").pop();
      const text = p.record?.text ?? "";
      return {
        kind: "post",
        title: text.slice(0, 100),
        url: `https://bsky.app/profile/${p.author.handle}/post/${rkey}`,
        source: `Bluesky · @${p.author.handle} (${p.likeCount ?? 0} likes)`,
        publishedAt: toDate(p.record?.createdAt ?? p.indexedAt),
        text,
        fetch: false,
      };
    });
  },
};

// YouTube Data API v3 (free key from Google Cloud Console). A search costs 100 of the
// 10,000 daily quota units, so roughly 100 searches per day on the free tier.
export const youtube = {
  name: "youtube",
  requires: ["YOUTUBE_API_KEY"],
  async search(topic, { limit, maxAgeDays }) {
    const after = new Date(Date.now() - maxAgeDays * 86400000).toISOString();
    const data = await fetchJson(
      "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=relevance" +
        `&relevanceLanguage=en&safeSearch=strict&maxResults=${Math.min(limit, 50)}` +
        `&publishedAfter=${after}&q=${encodeURIComponent(topic)}&key=${process.env.YOUTUBE_API_KEY}`
    );
    return (data.items ?? []).map((v) => {
      const title = decodeEntities(v.snippet.title);
      return {
        kind: "video",
        title,
        url: `https://www.youtube.com/watch?v=${v.id.videoId}`,
        source: `YouTube · ${decodeEntities(v.snippet.channelTitle)}`,
        publishedAt: toDate(v.snippet.publishedAt),
        text: `${title}. ${decodeEntities(v.snippet.description)}`,
        fetch: false,
      };
    });
  },
};
