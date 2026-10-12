import { rateLimit } from "express-rate-limit";

// The AI routes spend LLM credits: a per-user budget shared by all of them. Use after requireAuth.
export const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  keyGenerator: (req) => req.user.id,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
