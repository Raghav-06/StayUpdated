// A tiny OpenAI-compatible server for tests and local smoke runs: chat completions
// (plain, tool calls and streaming) and embeddings. Never calls a real AI service.
//
// Special API keys trigger failures: "mock-bad-key" -> 401, "mock-rate-limit" -> 429.
// Run standalone with: node test/helpers/mockOpenAI.js [port]
import { createServer } from "node:http";

const DIMS = 256;
const STOPWORDS = new Set("a an and are as at be by for from has have in is it of on or that the to was were will with".split(" "));

// Deterministic bag-of-words vector, so similar texts get similar embeddings.
function embed(text) {
  const vector = new Array(DIMS).fill(0);
  for (const w of String(text).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    if (w.length < 2 || STOPWORDS.has(w)) continue;
    let h = 0;
    for (const ch of w) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    vector[h % DIMS]++;
  }
  if (vector.every((x) => x === 0)) vector[0] = 1;
  return vector;
}

function contentOf(message) {
  const c = message?.content;
  return Array.isArray(c) ? c.map((p) => p.text ?? "").join("") : String(c ?? "");
}

// Picks a reply that looks like what the app's prompts ask for.
function replyFor(messages) {
  const system = contentOf(messages.find((m) => m.role === "system"));
  const user = contentOf(messages.filter((m) => m.role === "user").at(-1));
  const cited = [...new Set([...user.matchAll(/^\[(\d+)\]/gm)].map((m) => Number(m[1])))];
  const n = (i) => cited[i % Math.max(cited.length, 1)] ?? 1;

  if (/news analyst/i.test(system)) {
    return (
      `The latest coverage shows steady developments on this topic [${n(0)}]. Several outlets report new details [${n(1)}].\n\n` +
      `Key points:\n- First development reported by the sources [${n(0)}]\n- A second notable update [${n(1)}]\n` +
      `- Analysts expect more news soon [${n(2)}][${n(0)}]\n- Out-of-range citations are ignored [99]`
    );
  }
  if (/answer only from the provided sources/i.test(system)) {
    return `According to the sources, the main development is covered in detail [${n(0)}]. The sources do not say more than that.`;
  }
  return "pong";
}

function toolCallFor(tool) {
  const props = tool.function?.parameters?.properties ?? {};
  const args = Object.fromEntries(Object.entries(props).map(([k, v]) => [k, v.type === "number" ? 1 : "StayUpdated"]));
  return { id: `call_${Date.now()}`, type: "function", function: { name: tool.function.name, arguments: JSON.stringify(args) } };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Starts the mock on a random (or given) port. `tokenDelayMs` slows streaming so it is visible. */
export async function startMockOpenAI({ port = 0, tokenDelayMs = 0 } = {}) {
  const calls = [];
  const server = createServer(async (req, res) => {
    const key = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    if (key === "mock-bad-key") return sendJson(res, 401, { error: { message: "Incorrect API key provided", type: "invalid_request_error" } });
    if (key === "mock-rate-limit") return sendJson(res, 429, { error: { message: "Rate limit reached", type: "rate_limit" } });

    let body;
    try {
      body = await readBody(req);
    } catch {
      return sendJson(res, 400, { error: { message: "invalid JSON" } });
    }
    const path = req.url.replace(/^\/v1/, "");
    calls.push({ path, body });

    if (req.method === "POST" && path === "/embeddings") {
      const inputs = [body.input].flat();
      const data = inputs.map((text, index) => {
        const vector = embed(text);
        const embedding = body.encoding_format === "base64"
          ? Buffer.from(new Float32Array(vector).buffer).toString("base64")
          : vector;
        return { object: "embedding", index, embedding };
      });
      return sendJson(res, 200, { object: "list", data, model: body.model, usage: { prompt_tokens: 0, total_tokens: 0 } });
    }

    if (req.method === "POST" && path === "/chat/completions") {
      const messages = body.messages ?? [];
      const id = `chatcmpl-${Date.now()}`;
      const base = { id, created: Math.floor(Date.now() / 1000), model: body.model };
      const wantsTool = body.tools?.length && !messages.some((m) => m.role === "tool");

      if (wantsTool && !body.stream) {
        return sendJson(res, 200, {
          ...base,
          object: "chat.completion",
          choices: [{ index: 0, message: { role: "assistant", content: null, tool_calls: [toolCallFor(body.tools[0])] }, finish_reason: "tool_calls" }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        });
      }

      const text = replyFor(messages);
      if (!body.stream) {
        return sendJson(res, 200, {
          ...base,
          object: "chat.completion",
          choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        });
      }

      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      const chunk = (delta, finish = null) =>
        res.write(`data: ${JSON.stringify({ ...base, object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
      chunk({ role: "assistant", content: "" });
      for (const token of text.match(/\S+\s*/g) ?? []) {
        if (res.destroyed) return;
        chunk({ content: token });
        if (tokenDelayMs) await sleep(tokenDelayMs);
      }
      chunk({}, "stop");
      res.end("data: [DONE]\n\n");
      return;
    }

    sendJson(res, 404, { error: { message: `mock: no route ${req.method} ${req.url}` } });
  });

  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/v1`;
  return {
    url,
    calls,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mock = await startMockOpenAI({ port: Number(process.argv[2] ?? 5055), tokenDelayMs: Number(process.env.MOCK_TOKEN_DELAY_MS ?? 40) });
  console.log(`Mock OpenAI API listening at ${mock.url}`);
}
