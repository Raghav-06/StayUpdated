import { describe, expect, it } from "vitest";
import { getTopicNews } from "../src/news/pipeline.js";
import { TOPIC, URLS } from "./helpers/fixtures.js";

describe("news pipeline (fixtures)", () => {
  it("accepts fresh, relevant, readable articles and says why the rest were rejected", async () => {
    const result = await getTopicNews(TOPIC, { maxSources: 6, maxPosts: 0, maxVideos: 0, maxAgeDays: 7, region: "US" });

    const urls = result.sources.map((s) => s.url);
    expect(urls).toEqual(expect.arrayContaining([URLS.grid, URLS.farms]));
    expect(urls).toHaveLength(2);
    expect(result.sources.every((s) => s.contentFrom === "page")).toBe(true);

    const reasons = Object.fromEntries(result.rejected.map((r) => [r.url, r.reason]));
    expect(reasons[URLS.stale]).toBe("older than 7 days");
    expect(reasons[URLS.offTopic]).toMatch(/^not relevant enough/);
    expect(reasons[URLS.blocked]).toBe("could not read page: HTTP 403");
    // The utm_ copy of the grid article was merged with it, not read twice.
    expect(result.rejected.some((r) => r.url.includes("utm_"))).toBe(false);

    expect(result.providerStatus["bing-news"]).toEqual({ ok: true, found: 6 });
    expect(result.providerStatus["google-news"]).toMatchObject({ ok: false, error: "HTTP 503" });
    expect(result.providerStatus.youtube).toMatchObject({ ok: false, skipped: expect.stringContaining("YOUTUBE_API_KEY") });

    expect(result.summary).toMatch(/\[1\]/);
    expect(result.context).toContain("[1] ");
  });

  it("reports progress events in order", async () => {
    const events = [];
    const result = await getTopicNews(TOPIC, { maxPosts: 0, maxVideos: 0, onEvent: (type, data) => events.push({ type, data }) });

    const stages = events.filter((e) => e.type === "stage").map((e) => e.data.stage);
    expect(stages).toEqual(["discovering", "reading", "validating", "summarizing"]);

    const firstIndex = (type) => events.findIndex((e) => e.type === type);
    expect(firstIndex("provider")).toBeLessThan(events.findIndex((e) => e.data.stage === "reading"));
    expect(events.filter((e) => e.type === "progress").at(-1).data).toEqual({ read: 4, total: 4 });
    expect(firstIndex("summary")).toBeGreaterThan(events.findIndex((e) => e.data.stage === "summarizing"));
    expect(events.filter((e) => e.type === "summary").map((e) => e.data.delta).join("").trim()).toBe(result.summary);
  });

  it("stops when the signal is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(getTopicNews(TOPIC, { signal: controller.signal })).rejects.toThrow();
  });
});
