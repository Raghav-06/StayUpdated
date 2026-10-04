import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";

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
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${EMBEDDING_CONFIG.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: texts }),
      signal: AbortSignal.timeout(HF_TIMEOUT_MS),
    });
    if (res.status === 503 && attempt < HF_MAX_RETRIES) {
      await sleep(3000 + Math.random() * 2000);
      continue;
    }
    if (!res.ok) throw new Error(`Hugging Face embeddings failed: ${res.status} ${await res.text()}`);
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
      configuration: { baseURL: EMBEDDING_CONFIG.baseURL },
    });
  }
  return embeddings;
}
