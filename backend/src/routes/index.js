import { Router } from "express";
import {
  explainTopic,
  explainShortAndDetailed,
  generateAndExplainCode,
} from "../chains/index.js";
import { runToolCalling } from "../agents/toolCalling.js";
import { chatWithAgent, resumeAgent } from "../agents/cityAgent.js";
import { getGreeting } from "../tools/greeting.js";
import accountRouter from "./account.js";
import authRouter from "./auth.js";
import newsRouter from "./news.js";
import publicRouter from "./public.js";
import { requireAuth } from "../middleware/auth.js";
import { aiLimiter } from "../middleware/aiLimiter.js";
import { requireString } from "./validate.js";

const router = Router();

router.use("/auth", authRouter);
router.use("/account", accountRouter);
router.use("/news", newsRouter);
router.use("/public", publicRouter);

// The AI routes spend LLM credits: signed-in users only, and a per-user budget.
router.use(["/chains", "/tools", "/agent"], requireAuth, aiLimiter);

// --- Chains ---
router.post("/chains/explain", async (req, res) => {
  const topic = requireString(req.body, "topic");
  res.json({ topic, explanation: await explainTopic(topic) });
});

router.post("/chains/parallel", async (req, res) => {
  const shortTopic = requireString(req.body, "shortTopic");
  const detailedTopic = requireString(req.body, "detailedTopic");
  res.json(await explainShortAndDetailed({ shortTopic, detailedTopic }));
});

router.post("/chains/code", async (req, res) => {
  const topic = requireString(req.body, "topic");
  res.json(await generateAndExplainCode(topic));
});

// --- Tools ---
router.get("/tools/greeting", async (req, res) => {
  const name = requireString(req.query, "name");
  res.json({
    result: await getGreeting.invoke({ name }),
    tool: { name: getGreeting.name, description: getGreeting.description },
  });
});

router.post("/tools/text-length", async (req, res) => {
  const prompt = requireString(req.body, "prompt");
  res.json(await runToolCalling(prompt));
});

// --- City agent (weather + news, with human approval) ---
router.post("/agent/chat", async (req, res) => {
  const message = requireString(req.body, "message");
  const { sessionId, autoApprove } = req.body;
  res.json(
    await chatWithAgent({ message, sessionId, userId: req.user.id, autoApprove: autoApprove === true })
  );
});

router.post("/agent/:sessionId/approve", async (req, res) => {
  if (typeof req.body?.approved !== "boolean") {
    throw Object.assign(new Error("'approved' must be a boolean"), { status: 400 });
  }
  res.json(
    await resumeAgent({
      sessionId: req.params.sessionId,
      userId: req.user.id,
      approved: req.body.approved,
      autoApprove: req.body.autoApprove === true,
    })
  );
});

export default router;
