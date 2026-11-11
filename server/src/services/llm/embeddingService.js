import crypto from "crypto";
import { GoogleGenAI, ApiError } from "@google/genai";
import { llmConfig, isLlmConfigured } from "../../config/llm.js";
import { LlmError } from "./llmService.js";

/**
 * embeddingService — generate embedding vectors via the configured provider
 * (Google Gemini, @google/genai). Backend-only; the API key never leaves here.
 *
 *   • embedText(text)          → single vector (number[])
 *   • embedBatch(texts)        → vectors (number[][]), provider batching
 *   • handles empty input and API errors (typed LlmError with statusCode)
 *   • de-dupes identical texts within a batch and across calls (bounded cache)
 *   • L2-normalises truncated-dimension vectors so cosine similarity is valid
 */

/* ---------- Client (lazy singleton) ---------- */
let client = null;
const getClient = () => {
  if (!isLlmConfigured()) {
    throw new LlmError(
      "AI provider is not configured. Set GEMINI_API_KEY on the server.",
      { statusCode: 503, code: "llm_not_configured" }
    );
  }
  if (!client) client = new GoogleGenAI({ apiKey: llmConfig.apiKey });
  return client;
};

/* ---------- Error translation ---------- */
const cleanMessage = (raw) => {
  if (typeof raw !== "string") return "Unknown provider error";
  try {
    return JSON.parse(raw)?.error?.message || raw;
  } catch {
    return raw;
  }
};

const translateError = (error) => {
  if (error instanceof LlmError) return error;
  if (error?.name === "AbortError" || error?.name === "TimeoutError") {
    return new LlmError("The embedding request timed out.", {
      statusCode: 504,
      code: "timeout",
      retryable: true,
    });
  }
  if (error instanceof ApiError) {
    const status = error.status;
    const msg = cleanMessage(error.message);
    if (status === 400 && /api key/i.test(msg))
      return new LlmError("Embedding auth failed (invalid API key).", { statusCode: 502, code: "auth_error" });
    if (status === 401 || status === 403)
      return new LlmError("Embedding auth failed.", { statusCode: 502, code: "auth_error" });
    if (status === 429)
      return new LlmError("Embedding provider is rate limiting.", { statusCode: 429, code: "provider_rate_limited", retryable: true });
    if (status === 400)
      return new LlmError(`Embedding request rejected: ${msg}`, { statusCode: 400, code: "bad_request" });
    return new LlmError(`Embedding provider error: ${msg}`, { statusCode: 502, code: "api_error", retryable: status >= 500 });
  }
  return new LlmError("Unexpected embedding error.", { statusCode: 502, code: "unknown_error" });
};

/* ---------- Helpers ---------- */
const MAX_INPUT_CHARS = 20_000; // per-chunk guard

const assertNonEmpty = (text) => {
  if (typeof text !== "string" || text.trim() === "") {
    throw new LlmError("Cannot embed empty text.", {
      statusCode: 400,
      code: "empty_input",
    });
  }
  if (text.length > MAX_INPUT_CHARS) {
    throw new LlmError(
      `Text too long to embed (${text.length} chars, max ${MAX_INPUT_CHARS}).`,
      { statusCode: 413, code: "input_too_large" }
    );
  }
};

// L2-normalise so cosine similarity works for truncated dimensions.
const normalize = (vec) => {
  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return mag > 0 ? vec.map((v) => v / mag) : vec;
};

const cacheKey = (text, taskType) =>
  crypto
    .createHash("sha256")
    .update(`${llmConfig.embedding.model}:${llmConfig.embedding.dimensions}:${taskType}:${text}`)
    .digest("hex");

/* ---------- Bounded in-memory cache (avoid duplicate requests) ---------- */
const CACHE_MAX = 2_000;
const cache = new Map();
const cacheGet = (key) => {
  if (!cache.has(key)) return undefined;
  const val = cache.get(key); // refresh LRU order
  cache.delete(key);
  cache.set(key, val);
  return val;
};
const cacheSet = (key, val) => {
  cache.set(key, val);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
};

/* ---------- Provider call ---------- */
const callEmbed = async (texts, taskType) => {
  const ai = getClient();
  const res = await ai.models.embedContent({
    model: llmConfig.embedding.model,
    contents: texts,
    config: {
      taskType,
      outputDimensionality: llmConfig.embedding.dimensions,
      abortSignal: AbortSignal.timeout(llmConfig.timeoutMs),
      httpOptions: { timeout: llmConfig.timeoutMs },
    },
  });
  const embeddings = res.embeddings || [];
  if (embeddings.length !== texts.length) {
    throw new LlmError("Embedding provider returned an unexpected count.", {
      statusCode: 502,
      code: "embedding_count_mismatch",
    });
  }
  return embeddings.map((e) => normalize(e.values || []));
};

/* ---------- Public API ---------- */

/** Embed a single text → number[]. */
export const embedText = async (text, { taskType = llmConfig.embedding.taskType } = {}) => {
  assertNonEmpty(text);
  const key = cacheKey(text, taskType);
  const cached = cacheGet(key);
  if (cached) return cached;
  try {
    const [vec] = await callEmbed([text], taskType);
    cacheSet(key, vec);
    return vec;
  } catch (error) {
    throw translateError(error);
  }
};

/**
 * Embed many texts → number[][] (same order as input). Uses provider batching
 * in chunks of `batchSize`, de-dupes identical texts, and serves cache hits
 * without a request. Empty/oversized entries throw before any API call.
 */
export const embedBatch = async (
  texts,
  { taskType = llmConfig.embedding.taskType } = {}
) => {
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new LlmError("embedBatch requires a non-empty array of texts.", {
      statusCode: 400,
      code: "empty_input",
    });
  }
  texts.forEach(assertNonEmpty);

  const results = new Array(texts.length);
  const toFetch = new Map(); // key -> { text, indexes: [] }

  texts.forEach((text, i) => {
    const key = cacheKey(text, taskType);
    const cached = cacheGet(key);
    if (cached) {
      results[i] = cached;
    } else if (toFetch.has(key)) {
      toFetch.get(key).indexes.push(i); // duplicate within this batch
    } else {
      toFetch.set(key, { text, indexes: [i] });
    }
  });

  const unique = [...toFetch.entries()]; // [key, {text, indexes}]
  const { batchSize } = llmConfig.embedding;

  try {
    for (let start = 0; start < unique.length; start += batchSize) {
      const slice = unique.slice(start, start + batchSize);
      const vectors = await callEmbed(slice.map(([, v]) => v.text), taskType);
      slice.forEach(([key, v], j) => {
        const vec = vectors[j];
        cacheSet(key, vec);
        v.indexes.forEach((idx) => {
          results[idx] = vec;
        });
      });
    }
  } catch (error) {
    throw translateError(error);
  }

  return results;
};

/** The embedding dimensionality this service produces. */
export const embeddingDimensions = () => llmConfig.embedding.dimensions;
/** The embedding model id in use. */
export const embeddingModel = () => llmConfig.embedding.model;

export default { embedText, embedBatch, embeddingDimensions, embeddingModel };
