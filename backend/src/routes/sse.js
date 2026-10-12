import { toAIError } from "../config/llm.js";

const HEARTBEAT_MS = 15000;

/**
 * Answers with a text/event-stream and runs `work(send, signal)`, which reports events with
 * send(type, data). If the client disconnects, `signal` aborts so the work can stop early.
 * A thrown error is sent as an `error` event, since the 200 status has already gone out.
 */
export async function streamEvents(res, work) {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // stop Nginx-style proxies from buffering the stream
  });
  res.flushHeaders();

  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });

  const send = (type, data) => {
    if (!res.writableEnded && !res.destroyed) res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  // Comment lines keep idle connections from being closed by proxies during slow steps.
  const heartbeat = setInterval(() => !res.destroyed && res.write(": ping\n\n"), HEARTBEAT_MS);

  try {
    await work(send, controller.signal);
  } catch (error) {
    if (!controller.signal.aborted) {
      const err = toAIError(error);
      if (!err.status || err.status >= 500) console.error(err);
      send("error", { message: err.message || "Internal server error", status: err.status ?? 500 });
    }
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
}
