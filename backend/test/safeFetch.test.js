import { afterEach, describe, expect, it, vi } from "vitest";
import { assertPublicUrl, safeFetch } from "../src/news/safeFetch.js";

describe("safeFetch", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["http://127.0.0.1/", "private address"],
    ["http://127.1.2.3/admin", "private address"],
    ["http://10.0.0.5/", "private address"],
    ["http://192.168.1.1/", "private address"],
    ["http://172.16.4.4/", "private address"],
    ["http://169.254.169.254/latest/meta-data/", "private address"],
    ["http://[::1]/", "private address"],
    ["http://[::ffff:127.0.0.1]/", "private address"],
    ["http://[::ffff:a00:1]/", "private address"],
    ["http://0.0.0.0/", "private address"],
    ["http://localhost/", "local hostname"],
    ["http://api.localhost/", "local hostname"],
    ["http://printer.local/", "local hostname"],
    ["http://example.com:22/", "port 22 is not allowed"],
    ["http://example.com:8080/", "port 8080 is not allowed"],
    ["file:///etc/passwd", "only http and https"],
    ["not a url", "invalid URL"],
  ])("blocks %s", async (url, reason) => {
    await expect(assertPublicUrl(url)).rejects.toThrow(reason);
  });

  it("allows public hosts on the default ports", async () => {
    await expect(assertPublicUrl("https://example.com/news")).resolves.toBeInstanceOf(URL);
    await expect(assertPublicUrl("http://example.com:80/")).resolves.toBeInstanceOf(URL);
    await expect(assertPublicUrl("https://example.com:443/")).resolves.toBeInstanceOf(URL);
  });

  it("re-checks every redirect hop", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 302, headers: { Location: "http://169.254.169.254/latest/meta-data/" } })
    );
    await expect(safeFetch("https://example.com/redirect")).rejects.toThrow("blocked: private address");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
