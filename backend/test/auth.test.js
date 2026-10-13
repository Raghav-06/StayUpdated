import { beforeAll, describe, expect, it } from "vitest";
import { query } from "../src/db/index.js";
import { api, createUser, hasDb, resetDb } from "./helpers/db.js";
import { lastCodeFor, lastMailTo } from "./helpers/mail.js";

describe.skipIf(!hasDb)("auth", () => {
  beforeAll(resetDb);

  const email = "new.user@example.com";
  const password = "First-pass-123";

  it("signs up with an emailed code, then logs in", async () => {
    await api().post("/api/auth/register").send({ email }).expect(200);
    const code = lastCodeFor(email);
    expect(code).toMatch(/^\d{6}$/);

    await api().post("/api/auth/verify-email").send({ email, code: code === "000000" ? "111111" : "000000" }).expect(400);
    const verified = await api().post("/api/auth/verify-email").send({ email, code }).expect(200);

    const created = await api()
      .post("/api/auth/set-password")
      .send({ setupToken: verified.body.setupToken, password, name: "New User" })
      .expect(200);
    expect(created.body.token).toBeTruthy();
    expect(created.body.user).toMatchObject({ email, name: "New User" });

    // A setup token works once.
    await api().post("/api/auth/set-password").send({ setupToken: verified.body.setupToken, password }).expect(401);

    await api().post("/api/auth/login").send({ email, password: "wrong-pass-123" }).expect(401);
    const login = await api().post("/api/auth/login").send({ email: "New.User@Example.com", password }).expect(200);
    const me = await api().get("/api/auth/me").set("Authorization", `Bearer ${login.body.token}`).expect(200);
    expect(me.body.user.email).toBe(email);
  });

  it("registering an existing email sends a notice, not a code", async () => {
    await api().post("/api/auth/register").send({ email }).expect(200);
    expect(lastMailTo(email).text).not.toMatch(/\b\d{6}\b/);
  });

  it("resets a forgotten password", async () => {
    // Skip the resend cooldown left by the sign-up code.
    await query("UPDATE email_verifications SET created_at = now() - interval '10 minutes'");
    await api().post("/api/auth/forgot-password").send({ email }).expect(200);
    const code = lastCodeFor(email);
    const verified = await api().post("/api/auth/verify-email").send({ email, code }).expect(200);
    await api().post("/api/auth/set-password").send({ setupToken: verified.body.setupToken, password: "Second-pass-456" }).expect(200);

    await api().post("/api/auth/login").send({ email, password }).expect(401);
    await api().post("/api/auth/login").send({ email, password: "Second-pass-456" }).expect(200);
  });

  it("forgot password for an unknown email sends nothing", async () => {
    await api().post("/api/auth/forgot-password").send({ email: "nobody@example.com" }).expect(200);
    expect(lastMailTo("nobody@example.com")).toBeUndefined();
  });

  it("logout-all retires every existing token", async () => {
    const { auth } = await createUser();
    await api().get("/api/auth/me").set(auth).expect(200);
    await api().post("/api/account/logout-all").set(auth).expect(204);
    const res = await api().get("/api/auth/me").set(auth).expect(401);
    expect(res.body.error).toMatch(/session has ended/i);
  });

  it("changing the password signs out other devices but returns a fresh token", async () => {
    const { auth } = await createUser({ password: "Old-pass-123" });
    await api().post("/api/account/password").set(auth).send({ currentPassword: "nope-nope-1", newPassword: "New-pass-456" }).expect(400);
    const res = await api().post("/api/account/password").set(auth).send({ currentPassword: "Old-pass-123", newPassword: "New-pass-456" }).expect(200);
    await api().get("/api/auth/me").set(auth).expect(401);
    await api().get("/api/auth/me").set("Authorization", `Bearer ${res.body.token}`).expect(200);
  });

  it.each([
    ["post", "/api/news/search"],
    ["post", "/api/news/search/stream"],
    ["post", "/api/news/history/00000000-0000-0000-0000-000000000000/ask"],
    ["post", "/api/chains/explain"],
    ["post", "/api/agent/chat"],
    ["get", "/api/tools/greeting?name=x"],
    ["get", "/api/follows"],
    ["patch", "/api/account"],
  ])("%s %s requires sign-in", async (method, path) => {
    await api()[method](path).send({ topic: "x" }).expect(401);
    await api()[method](path).set("Authorization", "Bearer not-a-token").send({ topic: "x" }).expect(401);
  });
});
