// Canned responses for the news providers and article pages, so tests never reach real sites.
// Only Bing News answers (an RSS feed); every other provider gets a 503 and is reported as failed.

export const TOPIC = "solar power";

const DAY = 86400000;
const iso = (msAgo) => new Date(Date.now() - msAgo).toUTCString();

export const URLS = {
  grid: "https://news.fixture.test/solar-grid",
  farms: "https://daily.fixture.test/solar-farms",
  stale: "https://old.fixture.test/solar-archive",
  offTopic: "https://food.fixture.test/pasta-recipe",
  blocked: "https://blocked.fixture.test/solar-paywall",
};

function articlePage(title, paragraphs) {
  return `<!doctype html><html><head><title>${title}</title>
<meta property="og:site_name" content="Fixture News"></head>
<body><nav>Home | World | Business</nav><article><h1>${title}</h1>
${paragraphs.map((p) => `<p>${p}</p>`).join("\n")}
</article><footer>Copyright Fixture News</footer></body></html>`;
}

const PAGES = {
  [URLS.grid]: articlePage("Solar power output hits a record on the national grid", [
    "Solar power plants supplied a record share of electricity to the national grid this week, according to the grid operator.",
    "Officials said rooftop panels and large solar parks together produced more power than coal for six consecutive afternoons.",
    "Analysts expect the trend to continue as new battery storage projects come online and smooth out evening demand peaks.",
    "The operator warned that transmission upgrades are still needed to move solar power from sunny regions to big cities.",
  ]),
  [URLS.farms]: articlePage("New solar farms approved as power demand climbs", [
    "Regulators approved twelve new solar farms on Monday, citing rising power demand from data centres and electric vehicles.",
    "The projects will add several gigawatts of capacity over the next three years, developers said in a joint statement.",
    "Local councils raised concerns about land use, but most of the farms will be built on degraded agricultural land.",
    "Industry groups welcomed the decision and called for faster grid connections for smaller community solar schemes.",
  ]),
  [URLS.offTopic]: articlePage("The perfect weeknight pasta recipe", [
    "Boil the pasta in plenty of salted water until it is just tender, then reserve a cup of the cooking water.",
    "Meanwhile fry garlic gently in olive oil, add chilli flakes and a squeeze of lemon, and toss everything together.",
    "Finish with grated parmesan, black pepper and a handful of chopped parsley, loosening with the reserved water.",
    "Serve immediately in warm bowls. Leftovers keep for a day in the fridge but are best eaten fresh from the pan.",
  ]),
};

function rss(items) {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>Bing News</title>
${items
  .map(
    (i) => `<item><title>${i.title}</title><link>${i.link}</link><pubDate>${i.pubDate}</pubDate>
<description>${i.description}</description><Source>${i.source}</Source></item>`
  )
  .join("\n")}
</channel></rss>`;
}

export function bingFeed() {
  return rss([
    { title: "Solar power output hits a record", link: `${URLS.grid}?utm_source=rss&amp;utm_medium=feed`, pubDate: iso(2 * 3600000), description: "Record solar power.", source: "Fixture News" },
    // The same article again, with different tracking params: must be de-duplicated.
    { title: "Solar power output hits a record (copy)", link: `${URLS.grid}?utm_campaign=dup`, pubDate: iso(3 * 3600000), description: "Record solar power.", source: "Fixture News" },
    { title: "New solar farms approved", link: URLS.farms, pubDate: iso(DAY), description: "Solar farms approved.", source: "Daily Fixture" },
    { title: "Solar power in the archive", link: URLS.stale, pubDate: iso(40 * DAY), description: "An old solar power story.", source: "Old Fixture" },
    { title: "Weeknight pasta", link: URLS.offTopic, pubDate: iso(5 * 3600000), description: "A recipe.", source: "Food Fixture" },
    { title: "Solar power paywalled story", link: URLS.blocked, pubDate: iso(4 * 3600000), description: "Short.", source: "Blocked Fixture" },
  ]);
}

/** Every fixture request, for assertions. */
export const fetchLog = [];

/** Answers a URL the way the fixture "internet" would. */
export function fixtureResponse(url) {
  const u = new URL(url);
  if (u.hostname === "www.bing.com" && u.pathname === "/news/search") {
    return new Response(bingFeed(), { status: 200, headers: { "Content-Type": "application/rss+xml" } });
  }
  const page = PAGES[`${u.origin}${u.pathname}`];
  if (page) return new Response(page, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  if (u.hostname === "blocked.fixture.test") return new Response("Forbidden", { status: 403, headers: { "Content-Type": "text/html" } });
  return new Response("unavailable in tests", { status: 503, headers: { "Content-Type": "text/plain" } });
}

/** Replaces global fetch: the mock AI server is reached for real, everything else gets fixtures. */
export function installFixtureFetch(mockUrl) {
  const realFetch = globalThis.fetch;
  const mockOrigin = new URL(mockUrl).origin;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(mockOrigin)) return realFetch(input, init);
    fetchLog.push(url);
    init?.signal?.throwIfAborted();
    return fixtureResponse(url);
  };
}
