import { randomUUID } from "node:crypto";
import { HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { getLLM } from "../config/llm.js";
import { getWeather } from "../tools/weather.js";
import { getNews } from "../tools/news.js";

const SYSTEM_PROMPT = "you are a helpful city assistant.";
const MAX_STEPS = 8;
const SESSION_TTL_MS = 30 * 60 * 1000;

const tools = { [getWeather.name]: getWeather, [getNews.name]: getNews };

// Agents.py asked for approval on the terminal via input(). Over HTTP the agent
// instead pauses with status "awaiting_approval" and the client resumes it via
// resumeAgent(). Sessions live in memory, so they reset when the server restarts.
const sessions = new Map();

setInterval(() => {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, session] of sessions) {
    if (session.updatedAt < cutoff) sessions.delete(id);
  }
}, 5 * 60 * 1000).unref();

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

// Sessions are private to the user who started them; anyone else gets the same 404.
function getOwnSession(sessionId, userId) {
  const session = sessions.get(sessionId);
  if (!session || session.userId !== userId) throw httpError(404, "Session not found or expired");
  return session;
}

async function executeToolCall(call) {
  const selected = tools[call.name];
  const content = selected
    ? String(await selected.invoke(call.args))
    : `Error: unknown tool '${call.name}'`;
  return new ToolMessage({ content, tool_call_id: call.id, name: call.name });
}

async function runLoop(sessionId, session, autoApprove) {
  const llmWithTools = getLLM().bindTools(Object.values(tools));

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await llmWithTools.invoke(session.messages);
    session.messages.push(response);
    session.updatedAt = Date.now();

    const toolCalls = response.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return { status: "completed", sessionId, reply: response.content };
    }

    if (!autoApprove) {
      session.pendingToolCalls = toolCalls;
      return {
        status: "awaiting_approval",
        sessionId,
        toolCalls: toolCalls.map(({ id, name, args }) => ({ id, name, args })),
      };
    }

    for (const call of toolCalls) {
      session.messages.push(await executeToolCall(call));
    }
  }

  throw httpError(500, `Agent did not finish within ${MAX_STEPS} steps`);
}

export async function chatWithAgent({ message, sessionId, userId, autoApprove = false }) {
  let session = sessionId ? getOwnSession(sessionId, userId) : null;

  if (session?.pendingToolCalls) {
    throw httpError(409, "Session is awaiting tool approval; approve or deny first");
  }

  if (!session) {
    sessionId = randomUUID();
    session = { userId, messages: [new SystemMessage(SYSTEM_PROMPT)], pendingToolCalls: null };
    sessions.set(sessionId, session);
  }

  session.messages.push(new HumanMessage(message));
  return runLoop(sessionId, session, autoApprove);
}

export async function resumeAgent({ sessionId, userId, approved, autoApprove = false }) {
  const session = getOwnSession(sessionId, userId);
  if (!session.pendingToolCalls) throw httpError(409, "No tool calls are awaiting approval");

  const pending = session.pendingToolCalls;
  session.pendingToolCalls = null;

  for (const call of pending) {
    session.messages.push(
      approved
        ? await executeToolCall(call)
        : new ToolMessage({
            content: "Tool call denied by user.",
            tool_call_id: call.id,
            name: call.name,
          })
    );
  }

  return runLoop(sessionId, session, autoApprove);
}
