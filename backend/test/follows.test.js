import { beforeAll, describe, expect, it } from "vitest";
import { signAccessToken, signUnsubscribeToken } from "../src/auth/tokens.js";
import { query } from "../src/db/index.js";
import { runDigest, urlHash } from "../src/digest/digest.js";
import { api, createUser, hasDb, resetDb } from "./helpers/db.js";
import { TOPIC, URLS } from "./helpers/fixtures.js";
import { lastMailTo, mailbox } from "./helpers/mail.js";

const params = { maxSources: 4, maxPosts: 0, maxVideos: 0, maxAgeDays: 7 };

describe.skipIf(!hasDb)("followed topics and the daily digest", () => {
  beforeAll(resetDb);

  it("limits follows to 10 per user and ignores duplicates", async () => {
    const { auth } = await createUser();
    for (let i = 0; i < 10; i++) await api().post("/api/follows").set(auth).send({ topic: `topic ${i}`, region: "IN" }).expect(201);
    const dup = await api().post("/api/follows").set(auth).send({ topic: "  TOPIC   3 ", region: "IN" }).expect(200);
    expect(dup.body.follow.topic).toBe("topic 3");
    const over = await api().post("/api/follows").set(auth).send({ topic: "topic 11", region: "IN" }).expect(400);
    expect(over.body.error).toMatch(/up to 10/);

    const list = await api().get("/api/follows").set(auth).expect(200);
    expect(list.body.follows).toHaveLength(10);
    await api().delete(`/api/follows/${list.body.follows[0].id}`).set(auth).expect(204);
    await api().post("/api/follows").set(auth).send({ topic: "topic 11", region: "IN" }).expect(201);
  });

  it("a user can't unfollow someone else's topic", async () => {
    const a = await createUser();
    const b = await createUser();
    const { body } = await api().post("/api/follows").set(a.auth).send({ topic: TOPIC, region: "US" }).expect(201);
    await api().delete(`/api/follows/${body.follow.id}`).set(b.auth).expect(404);
  });

  it("emails only sources the user hasn't been sent, then nothing until there's news", async () => {
    const { user, auth } = await createUser({ email: "reader@example.com", name: "Rea Der" });
    const { body } = await api().post("/api/follows").set(auth).send({ topic: TOPIC, region: "US", params }).expect(201);
    // Following turns the digest on.
    expect((await api().get("/api/auth/me").set(auth)).body.user.preferences.digestEnabled).toBe(true);
    // Pretend the grid story went out in an earlier digest.
    await query("INSERT INTO followed_seen_urls (followed_topic_id, url_hash) VALUES ($1, $2)", [body.follow.id, urlHash(URLS.grid)]);

    const sent = await api().post("/api/follows/digest-now").set(auth).expect(200);
    expect(sent.body).toMatchObject({ emailed: true, newSources: 1 });
    const mail = lastMailTo("reader@example.com");
    expect(mail.text).toContain(URLS.farms);
    expect(mail.text).not.toContain(URLS.grid);
    expect(mail.text).toContain(`Read the full summary: http://frontend.test/history/`);
    expect(mail.text).not.toMatch(/\[\d+\]/);
    expect(mail.raw).not.toContain("<html"); // the console fallback prints the text version only

    const { rows } = await query("SELECT last_checked_at, last_search_id FROM followed_topics WHERE id = $1", [body.follow.id]);
    expect(rows[0].last_checked_at).toBeTruthy();
    expect(mail.text).toContain(`/history/${rows[0].last_search_id}`);

    const before = mailbox.length;
    const again = await api().post("/api/follows/digest-now").set(auth).expect(200);
    expect(again.body.emailed).toBe(false);
    expect(mailbox.length).toBe(before);

    // The scheduled run skips users with nothing new too, and records the run.
    const stats = await runDigest();
    expect(stats.failures).toBe(0);
    expect(stats.users).toBeGreaterThanOrEqual(1);
    expect(mailbox.filter((m) => m.to === user.email)).toHaveLength(1);
    const state = await query("SELECT value FROM app_state WHERE key = 'digest_last_full_run'");
    expect(state.rows[0].value.at).toBeTruthy();
  });

  it("limits digest-now to 3 an hour", async () => {
    const { auth } = await createUser();
    for (let i = 0; i < 3; i++) await api().post("/api/follows/digest-now").set(auth).expect(200);
    await api().post("/api/follows/digest-now").set(auth).expect(429);
  });

  it("unsubscribes with the emailed token, without signing in", async () => {
    const { user, auth } = await createUser({ preferences: { digestEnabled: true } });

    // A login token is not an unsubscribe token.
    await api().get(`/api/follows/unsubscribe?token=${signAccessToken(user)}`).expect(400);
    await api().get("/api/follows/unsubscribe?token=garbage").expect(400);

    const res = await api().get(`/api/follows/unsubscribe?token=${signUnsubscribeToken(user.id)}`).expect(200);
    expect(res.headers["content-type"]).toMatch(/html/);
    expect(res.text).toContain("unsubscribed");
    expect((await api().get("/api/auth/me").set(auth)).body.user.preferences.digestEnabled).toBe(false);
  });
});
