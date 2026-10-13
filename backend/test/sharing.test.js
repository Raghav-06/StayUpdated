import { beforeAll, describe, expect, it } from "vitest";
import { query } from "../src/db/index.js";
import { api, createUser, hasDb, parseEvents, resetDb, sse } from "./helpers/db.js";
import { TOPIC } from "./helpers/fixtures.js";

const body = { topic: TOPIC, region: "IN", maxPosts: 0, maxVideos: 0 };

describe.skipIf(!hasDb)("share links, questions and account deletion", () => {
  let owner, stranger, search;
  beforeAll(async () => {
    await resetDb();
    owner = await createUser({ email: "owner@example.com" });
    stranger = await createUser();
    search = (await api().post("/api/news/search").set(owner.auth).send(body).expect(200)).body;
  });

  it("shares only the public fields, and revoking stops the link", async () => {
    await api().post(`/api/news/history/${search.id}/share`).set(stranger.auth).expect(404);

    const shared = await api().post(`/api/news/history/${search.id}/share`).set(owner.auth).expect(200);
    expect(shared.body.shareId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(shared.body.url).toBe(`http://frontend.test/s/${shared.body.shareId}`);
    const again = await api().post(`/api/news/history/${search.id}/share`).set(owner.auth).expect(200);
    expect(again.body.shareId).toBe(shared.body.shareId);

    const pub = await api().get(`/api/public/searches/${shared.body.shareId}`).expect(200);
    expect(Object.keys(pub.body).sort()).toEqual(["created_at", "region", "sources", "summary", "topic"]);
    expect(pub.body.region).toBe("IN");
    const json = JSON.stringify(pub.body);
    for (const leak of ["owner@example.com", owner.user.id, "rejected", "provider", "foundVia", "user_id"]) {
      expect(json).not.toContain(leak);
    }

    await api().delete(`/api/news/history/${search.id}/share`).set(owner.auth).expect(204);
    await api().get(`/api/public/searches/${shared.body.shareId}`).expect(404);
  });

  it("answers questions for the owner only, and keeps them", async () => {
    await api().post(`/api/news/history/${search.id}/ask`).set(owner.auth).send({ question: "?" }).expect(400);
    await api().post(`/api/news/history/${search.id}/ask`).set(stranger.auth).send({ question: "What happened?" }).expect(404);
    await api().get(`/api/news/history/${search.id}/questions`).set(stranger.auth).expect(404);

    const res = await sse(api().post(`/api/news/history/${search.id}/ask`).set(owner.auth).send({ question: "What happened?" })).expect(200);
    const events = parseEvents(res.body);
    expect(events.some((e) => e.type === "delta")).toBe(true);
    const done = events.at(-1);
    expect(done.type).toBe("done");
    expect(done.data.answer).toMatch(/\[\d+\]/);
    expect(done.data.limited).toBe(false);

    const list = await api().get(`/api/news/history/${search.id}/questions`).set(owner.auth).expect(200);
    expect(list.body.questions).toEqual([expect.objectContaining({ question: "What happened?", answer: done.data.answer })]);
  });

  it("answers older searches without saved context from the excerpts, flagged as limited", async () => {
    await query("UPDATE news_searches SET context = NULL WHERE id = $1", [search.id]);
    const res = await sse(api().post(`/api/news/history/${search.id}/ask`).set(owner.auth).send({ question: "Any numbers?" })).expect(200);
    expect(parseEvents(res.body).at(-1).data.limited).toBe(true);
  });

  it("deleting the account removes everything that belongs to it", async () => {
    await api().post("/api/follows").set(owner.auth).send({ topic: TOPIC, region: "IN", searchId: search.id }).expect(201);
    await query("INSERT INTO email_verifications (email, code_hash, expires_at) VALUES ('OWNER@example.com', 'x', now())");

    await api().delete("/api/account").set(owner.auth).send({ confirmEmail: "someone@else.com" }).expect(400);
    await api().delete("/api/account").set(owner.auth).send({ confirmEmail: " Owner@Example.com " }).expect(204);

    const count = async (sql) => Number((await query(sql, [owner.user.id])).rows[0].count);
    expect(await count("SELECT count(*) FROM users WHERE id = $1")).toBe(0);
    expect(await count("SELECT count(*) FROM news_searches WHERE user_id = $1")).toBe(0);
    expect(await count("SELECT count(*) FROM search_questions WHERE user_id = $1")).toBe(0);
    expect(await count("SELECT count(*) FROM followed_topics WHERE user_id = $1")).toBe(0);
    expect(Number((await query("SELECT count(*) FROM followed_seen_urls")).rows[0].count)).toBe(0);
    expect(Number((await query("SELECT count(*) FROM email_verifications WHERE lower(email) = 'owner@example.com'")).rows[0].count)).toBe(0);
    await api().get("/api/auth/me").set(owner.auth).expect(401);
  });
});
