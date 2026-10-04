import { lookup } from "node:dns/promises";
import { BlockList, isIPv6 } from "node:net";

const MAX_REDIRECTS = 5;
const ALLOWED_PORTS = new Set(["", "80", "443"]);

// Addresses a server-side fetch must never reach (loopback, private, link-local, metadata, ...).
const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
]) blocked.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
  ["::", 128], // unspecified
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8], // multicast
]) blocked.addSubnet(net, prefix, "ipv6");

// Expands an IPv6 address into its 8 groups as numbers.
function ipv6Groups(address) {
  let ip = address.split("%")[0];
  const dotted = ip.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const [a, b, c, d] = dotted[1].split(".").map(Number);
    ip = ip.slice(0, -dotted[1].length) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = ip.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const fill = tail === undefined ? [] : new Array(8 - left.length - right.length).fill("0");
  return [...left, ...fill, ...right].map((g) => parseInt(g, 16));
}

// ::ffff:a.b.c.d (in any spelling) -> "a.b.c.d", else null.
function unmapIPv4(address) {
  const g = ipv6Groups(address);
  const mapped = g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff;
  return mapped ? [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255].join(".") : null;
}

function isBlockedAddress(address) {
  if (!isIPv6(address)) return blocked.check(address, "ipv4");
  const v4 = unmapIPv4(address);
  return v4 ? blocked.check(v4, "ipv4") : blocked.check(address.split("%")[0], "ipv6");
}

function isLocalHostname(host) {
  return host === "localhost" || [".localhost", ".local", ".internal"].some((s) => host.endsWith(s));
}

/** Throws a readable "blocked: ..." error unless the URL points at a public http(s) host. */
export async function assertPublicUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("blocked: invalid URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("blocked: only http and https URLs are allowed");
  if (!ALLOWED_PORTS.has(parsed.port)) throw new Error(`blocked: port ${parsed.port} is not allowed`);

  const host = parsed.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (isLocalHostname(host)) throw new Error("blocked: local hostname");

  let addresses;
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new Error(`could not resolve host ${host}`);
  }
  if (!addresses.length || addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new Error("blocked: private address");
  }
  return parsed;
}

/** fetch() that only talks to public hosts and re-checks every redirect hop. */
export async function safeFetch(url, init = {}) {
  let current = (await assertPublicUrl(url)).href;
  let options = { ...init, redirect: "manual" };

  for (let hop = 0; ; hop++) {
    const res = await fetch(current, options);
    const location = res.headers.get("location");
    if (res.status < 300 || res.status >= 400 || !location) return res;

    await res.body?.cancel();
    if (hop >= MAX_REDIRECTS) throw new Error("too many redirects");
    current = (await assertPublicUrl(new URL(location, current).href)).href;
    if (res.status === 303) options = { ...options, method: "GET", body: undefined };
  }
}
