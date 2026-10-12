import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { httpError } from "../utils/httpError.js";

// Any provider with an OpenAI-compatible API works (OpenAI, Mistral, Groq, OpenRouter,
// Together, Gemini, Anthropic, Hugging Face router, Ollama, ...): set its base URL, key and model.
export const LLM_CONFIG = {
  apiKey: process.env.LLM_API_KEY,
  baseURL: process.env.LLM_BASE_URL || undefined,
  model: process.env.LLM_MODEL,
};

// Embeddings default to the chat provider's key and URL. Leave EMBEDDING_MODEL empty for
// providers without an embeddings endpoint; the news pipeline then scores relevance locally.
export const EMBEDDING_CONFIG = {
  apiKey: process.env.EMBEDDING_API_KEY || LLM_CONFIG.apiKey,
  baseURL: process.env.EMBEDDING_BASE_URL || LLM_CONFIG.baseURL,
  model: process.env.EMBEDDING_MODEL,
  provider: process.env.EMBEDDING_PROVIDER,
};

// One slow or dead AI service must not hang a request for minutes.
const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS) || 60000;
const LLM_MAX_RETRIES = 1;

const HF_BATCH_SIZE = 32;
const HF_TIMEOUT_MS = 30000;
const HF_MAX_RETRIES = 3;

function configError(message) {
  return Object.assign(new Error(message), { status: 500 });
}

export function assertLLMConfigured() {
  if (!LLM_CONFIG.apiKey) throw configError("LLM_API_KEY is not set");
  if (!LLM_CONFIG.model) throw configError("LLM_MODEL is not set");
}

const chatModels = new Map();

// Created lazily so the server can boot (and serve non-LLM routes) without an API key.
export function getLLM({ temperature, maxTokens } = {}) {
  const key = `${temperature}:${maxTokens}`;
  if (!chatModels.has(key)) {
    assertLLMConfigured();
    chatModels.set(
      key,
      new ChatOpenAI({
        model: LLM_CONFIG.model,
        apiKey: LLM_CONFIG.apiKey,
        temperature,
        maxTokens,
        timeout: LLM_TIMEOUT_MS,
        maxRetries: LLM_MAX_RETRIES,
        configuration: { baseURL: LLM_CONFIG.baseURL },
      })
    );
  }
  return chatModels.get(key);
}

// Some HF backends return token-level vectors; mean-pool those into one sentence vector.
function toSentenceVector(output) {
  if (typeof output[0] === "number") return output;
  const dims = output[0].length;
  const pooled = new Array(dims).fill(0);
  for (const token of output) for (let d = 0; d < dims; d++) pooled[d] += token[d] / output.length;
  return pooled;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// One feature-extraction call; retries while HF is still loading the model (503).
async function hfFeatureExtraction(texts) {
  const url = `https://router.huggingface.co/hf-inference/models/${EMBEDDING_CONFIG.model}/pipeline/feature-extraction`;
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${EMBEDDING_CONFIG.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: texts }),
        signal: AbortSignal.timeout(HF_TIMEOUT_MS),
      });
    } catch {
      throw Object.assign(new Error("Hugging Face embeddings are unreachable"), { aiStatus: 503 });
    }
    if (res.status === 503 && attempt < HF_MAX_RETRIES) {
      await sleep(3000 + Math.random() * 2000);
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw Object.assign(new Error(`Hugging Face embeddings failed: HTTP ${res.status}`), { aiStatus: res.status });
    }
    return (await res.json()).map(toSentenceVector);
  }
}

// Native Hugging Face Inference embeddings (the router's /v1 endpoint only serves chat).
function huggingFaceEmbeddings() {
  return {
    async embedDocuments(texts) {
      const vectors = [];
      for (let i = 0; i < texts.length; i += HF_BATCH_SIZE) {
        vectors.push(...(await hfFeatureExtraction(texts.slice(i, i + HF_BATCH_SIZE))));
      }
      return vectors;
    },
    async embedQuery(text) {
      return (await hfFeatureExtraction([text]))[0];
    },
  };
}

let embeddings;

// Returns null when no embedding model is configured.
export function getEmbeddings() {
  if (!EMBEDDING_CONFIG.model) return null;
  if (!embeddings) {
    if (!EMBEDDING_CONFIG.apiKey) throw configError("EMBEDDING_API_KEY (or LLM_API_KEY) is not set");
    if (EMBEDDING_CONFIG.provider === "huggingface") return (embeddings = huggingFaceEmbeddings());
    embeddings = new OpenAIEmbeddings({
      model: EMBEDDING_CONFIG.model,
      apiKey: EMBEDDING_CONFIG.apiKey,
      timeout: LLM_TIMEOUT_MS,
      maxRetries: LLM_MAX_RETRIES,
      configuration: { baseURL: EMBEDDING_CONFIG.baseURL },
    });
  }
  return embeddings;
}

export const AI_MESSAGES = {
  unavailable: "The AI service is unavailable right now",
  rejected: "The AI API key was rejected",
  limited: "AI usage limit reached, try again later",
};

// Error classes of the OpenAI SDK (used by @langchain/openai) and LangChain's own error codes.
const SDK_ERRORS = {
  AuthenticationError: "rejected",
  PermissionDeniedError: "rejected",
  RateLimitError: "limited",
  APIConnectionError: "unavailable",
  APIConnectionTimeoutError: "unavailable",
  InternalServerError: "unavailable",
};
const LC_ERROR_CODES = { MODEL_AUTHENTICATION: "rejected", MODEL_RATE_LIMIT: "limited" };

// Which AI_MESSAGES entry an error from the chat or embeddings client maps to, or null if it isn't one.
function classifyAIError(err) {
  if (!err) return null;
  if (LC_ERROR_CODES[err.lc_error_code]) return LC_ERROR_CODES[err.lc_error_code];
  if (SDK_ERRORS[err.constructor?.name]) return SDK_ERRORS[err.constructor.name];
  if (err.aiStatus) {
    if ([401, 403].includes(err.aiStatus)) return "rejected";
    if (err.aiStatus === 429) return "limited";
    if (err.aiStatus >= 500) return "unavailable";
  }
  if (err.name === "TimeoutError" && /request timed out/i.test(err.message)) return "unavailable";
  return null;
}

/**
 * Turns an AI provider failure (unreachable, timed out, key rejected, rate limited) into a 503
 * with a readable message; any other error is returned unchanged. Never includes the
 * provider's own message, which can echo part of the API key.
 * `assumeConnection`: the error came from inside an AI call, so a bare network failure
 * ("fetch failed", a timeout abort) also means the AI service is unreachable.
 */
export function toAIError(err, { assumeConnection = false } = {}) {
  let kind = classifyAIError(err);
  if (!kind && assumeConnection && !err?.status && (err instanceof TypeError || err?.name === "TimeoutError")) kind = "unavailable";
  if (!kind) return err;
  console.error(`AI service error (${kind}): ${err.constructor?.name ?? err.name}${err.status ? ` HTTP ${err.status}` : ""}`);
  return httpError(503, AI_MESSAGES[kind]);
}
