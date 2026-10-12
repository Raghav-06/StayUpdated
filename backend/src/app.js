import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import apiRouter from "./routes/index.js";
import { toAIError } from "./config/llm.js";

const app = express();

// Behind a reverse proxy (Render, Nginx, ...) set TRUST_PROXY=1 so rate limits see real client IPs.
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

app.use(cors({ origin: process.env.FRONTEND_URL || true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get("/health", (req, res) => res.json({ status: "ok" }));
app.use("/api", apiRouter);

app.use((req, res) => res.status(404).json({ error: "Not found" }));

// Express 5 forwards rejected promises from async handlers here.
app.use((error, req, res, next) => {
  // AI provider failures (unreachable, key rejected, rate limited) become a clear 503.
  const err = toAIError(error);
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || "Internal server error" });
});

export default app;
