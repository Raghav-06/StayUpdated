export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export async function fetchText(url, { timeoutMs = 10000, headers = {}, ...init } = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { "User-Agent": USER_AGENT, ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export async function fetchJson(url, options) {
  return JSON.parse(await fetchText(url, options));
}

export function toDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(text) {
  return String(text ?? "").replace(/&(#x?[0-9a-f]+|\w+);/gi, (match, code) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isNaN(n) ? match : String.fromCodePoint(n);
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

export function stripHtml(text) {
  return decodeEntities(String(text ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}
