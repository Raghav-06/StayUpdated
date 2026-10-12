import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { query } from "../db/index.js";
import { httpError } from "../utils/httpError.js";

const router = Router();

// No sign-in here, so limit how fast one IP can walk through share links.
router.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false }));

const SHARE_ID_RE = /^[A-Za-z0-9_-]{22}$/;

// The source fields a shared page shows; nothing about the user's own history.
function publicSource({ id, kind, title, url, source, publishedAt, relevance, excerpt, contentFrom }) {
  return { id, kind, title, url, source, publishedAt, relevance, excerpt, contentFrom };
}

// A shared search: only what the read-only page needs. No user info, rejected list or provider status.
router.get("/searches/:shareId", async (req, res) => {
  const { shareId } = req.params;
  if (!SHARE_ID_RE.test(shareId)) throw httpError(404, "This shared search doesn't exist or is no longer shared");
  const { rows } = await query(
    `SELECT topic, summary, sources, created_at, params->>'region' AS region
       FROM news_searches WHERE share_id = $1`,
    [shareId]
  );
  if (!rows[0]) throw httpError(404, "This shared search doesn't exist or is no longer shared");
  const { topic, summary, sources, created_at, region } = rows[0];
  res.json({ topic, summary, sources: sources.map(publicSource), created_at, region });
});

export default router;
