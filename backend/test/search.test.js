import { beforeAll, describe, expect, it } from "vitest";
import { query } from "../src/db/index.js";
import { api, createUser, hasDb, parseEvents, resetDb, sse } from "./helpers/db.js";
import { TOPIC, URLS } from "./helpers/fixtures.js";

const body = { topic: TOPIC, region: "US", maxSources: 4, maxPosts: 0, maxVideos: 0, maxAgeDays: 7 };

describe.skipIf(!hasDb)("news search", () => {
  let alice, bob;
  beforeAll(async () => {
    await resetDb();
    alice = await createUser();
    bob = await createUser({ preferences: { region: "GB" } });
  });

  it("runs the pipeline and saves the search to history", async () => {
    const res = await api().post("/api/news/search").set(alice.auth).send(body).expect(200);
    expect(res.body.id).toBeTruthy();
    expect(res.body.stats.cached).toBeUndefined();
    expect(res.body.params).toMatchObject({ region: "US", maxSources: 4 });
    expect(res.body.context).toBeUndefined(); // stored for questions, never sent to the client

    const history = await api().get("/api/news/history").set(alice.auth).expect(200);
    expect(history.body.searches.map((s) => s.id)).toContain(res.body.id);
  });

  it("serves the same search from the cache, for any user, as a new history row", async () => {
    const res = await api().post("/api/news/search").set(bob.auth).send({ ...body, topic: "  SOLAR   Power " }).expect(200);
    expect(res.body.stats.cached).toBe(true);
    expect(res.body.rejected).toEqual([]);
    const { rows } = await query("SELECT user_id FROM news_searches WHERE id = $1", [res.body.id]);
    expect(rows[0].user_id).toBe(bob.user.id);
  });

  it("misses the cache when the params differ or force is set", async () => {
    const other = await api().post("/api/news/search").set(bob.auth).send({ ...body, maxSources: 3 }).expect(200);
    expect(other.body.stats.cached).toBeUndefined();
    const forced = await api().post("/api/news/search").set(bob.auth).send({ ...body, force: true }).expect(200);
    expect(forced.body.stats.cached).toBeUndefined();
  });

  it("never caches searches that include the user's own URLs", async () => {
    const withUrl = { ...body, urls: ["https://example.com/private-page"] };
    await api().post("/api/news/search").set(alice.auth).send(withUrl).expect(200);
    const again = await api().post("/api/news/search").set(alice.auth).send(withUrl).expect(200);
    expect(again.body.stats.cached).toBeUndefined();
  });

  it("uses the saved region preference when none is given", async () => {
    const res = await api().post("/api/news/search").set(bob.auth).send({ topic: TOPIC, maxPosts: 0, maxVideos: 0 }).expect(200);
    expect(res.body.params.region).toBe("GB");
    await api().post("/api/news/search").set(bob.auth).send({ topic: TOPIC, region: "FR" }).expect(400);
  });

  it("streams events in order and ends with the saved result", async () => {
    const res = await sse(api().post("/api/news/search/stream").set(alice.auth).send({ ...body, force: true })).expect(200);
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
    expect(res.headers["cache-control"]).toBe("no-cache");
    expect(res.headers["x-accel-buffering"]).toBe("no");

    const events = parseEvents(res.body);
    const kinds = events.map((e) => (e.type === "stage" ? `stage:${e.data.stage}` : e.type));
    const first = (k) => kinds.indexOf(k);
    expect(first("stage:discovering")).toBe(0);
    expect(first("provider")).toBeGreaterThan(first("stage:discovering"));
    expect(first("stage:reading")).toBeGreaterThan(first("provider"));
    expect(first("progress")).toBeGreaterThan(first("stage:reading"));
    expect(first("stage:validating")).toBeGreaterThan(first("progress"));
    expect(first("stage:summarizing")).toBeGreaterThan(first("stage:validating"));
    expect(first("summary")).toBeGreaterThan(first("stage:summarizing"));
    expect(kinds.at(-1)).toBe("done");
    expect(kinds).not.toContain("error");

    const done = events.at(-1).data;
    expect(done.id).toBeTruthy();
    expect(events.filter((e) => e.type === "summary").map((e) => e.data.delta).join("").trim()).toBe(done.summary);
  });

  it("streams a cache hit straight to done", async () => {
    const res = await sse(api().post("/api/news/search/stream").set(bob.auth).send(body)).expect(200);
    const events = parseEvents(res.body);
    expect(events.at(-1).type).toBe("done");
    expect(events.at(-1).data.stats.cached).toBe(true);
  });

  it("marks sources that weren't in the previous search as new", async () => {
    const first = await api().post("/api/news/search").set(alice.auth).send({ ...body, maxSources: 1, force: true }).expect(200);
    expect(first.body.sources).toHaveLength(1);
    const refreshed = await api()
      .post("/api/news/search")
      .set(alice.auth)
      .send({ ...body, force: true, previousSearchId: first.body.id })
      .expect(200);
    const flags = Object.fromEntries(refreshed.body.sources.map((s) => [s.url, s.isNew === true]));
    expect(Object.keys(flags).sort()).toEqual([URLS.farms, URLS.grid].sort());
    expect(Object.values(flags).filter(Boolean)).toHaveLength(1);
    expect(flags[first.body.sources[0].url]).toBe(false);
  });
});
