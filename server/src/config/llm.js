/**
 * Centralised LLM configuration, read from environment variables.
 *
 * Provider: Google Gemini (official @google/genai SDK).
 * Nothing here is ever sent to the frontend — the API key stays server-side.
 * All knobs have sensible defaults so the service boots even if only
 * GEMINI_API_KEY is set.
 */

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const llmConfig = {
  // Credentials / provider
  apiKey: process.env.GEMINI_API_KEY || "",

  // Model + generation parameters
  // gemini-flash-lite-latest: fast, cheap, always-current alias (won't get the
  // "model retired for new users" error, and less throttled on the free tier).
  model: process.env.GEMINI_MODEL || "gemini-flash-lite-latest",
  maxOutputTokens: num(process.env.GEMINI_MAX_OUTPUT_TOKENS, 1024),
  // Sampling temperature (0–2). Lower = more focused/deterministic.
  temperature: num(process.env.GEMINI_TEMPERATURE, 0.7),
  // Thinking level for Gemini 3.x models: MINIMAL | LOW | MEDIUM | HIGH.
  // Lower = faster/cheaper. Set NONE (or blank) to omit it entirely — needed
  // for models that don't accept thinkingLevel. (Gemini 3 uses thinkingLevel,
  // not a numeric budget.)
  thinkingLevel: (process.env.GEMINI_THINKING_LEVEL ?? "LOW").toUpperCase(),

  // Transport resilience
  timeoutMs: num(process.env.GEMINI_TIMEOUT_MS, 60_000),
  maxRetries: num(process.env.GEMINI_MAX_RETRIES, 2),

  // Request limits (defence against oversized / runaway prompts). This is an
  // upper safety guard on the summed message content; per-endpoint validators
  // enforce tighter caps (e.g. /ai/test caps a single message at 8000 chars).
  maxInputChars: num(process.env.LLM_MAX_INPUT_CHARS, 24_000),
  maxOutputTokensCap: num(process.env.LLM_MAX_OUTPUT_TOKENS_CAP, 4_096),

  // Itinerary generation (structured output needs more room than chat)
  itinerary: {
    maxDays: num(process.env.ITINERARY_MAX_DAYS, 7),
    maxOutputTokens: num(process.env.ITINERARY_MAX_OUTPUT_TOKENS, 8_192),
  },

  // Embeddings (configurable model + dimensions)
  embedding: {
    model: process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001",
    dimensions: num(process.env.GEMINI_EMBED_DIM, 768),
    batchSize: num(process.env.GEMINI_EMBED_BATCH, 100),
    // Gemini task types optimise the vector for its use (document vs query).
    taskType: process.env.GEMINI_EMBED_TASK || "RETRIEVAL_DOCUMENT",
  },

  // Document chunking defaults (characters)
  chunking: {
    size: num(process.env.CHUNK_SIZE, 900),
    overlap: num(process.env.CHUNK_OVERLAP, 150),
  },

  // Atlas Vector Search
  search: {
    indexName: process.env.ATLAS_VECTOR_INDEX || "travel_vector_index",
    defaultLimit: num(process.env.SEARCH_LIMIT, 5),
    maxLimit: num(process.env.SEARCH_MAX_LIMIT, 20),
    // numCandidates = clamp(limit * factor) — more candidates = better recall,
    // higher cost. Atlas suggests ~10-20x the limit.
    candidatesFactor: num(process.env.SEARCH_CANDIDATES_FACTOR, 15),
  },

  // Conversational assistant
  chat: {
    historyLimit: num(process.env.CHAT_HISTORY_LIMIT, 12), // messages kept in LLM context
    maxStored: num(process.env.CHAT_MAX_STORED, 200), // messages retained per conversation
    maxMessageChars: num(process.env.CHAT_MAX_MESSAGE_CHARS, 2_000),
    ragMinScore: num(process.env.CHAT_RAG_MIN_SCORE, 0.78),
    retrievalLimit: num(process.env.CHAT_RETRIEVAL_LIMIT, 4),
  },

  // Retrieval-Augmented Generation
  rag: {
    limit: num(process.env.RAG_LIMIT, 5),
    // Drop retrieved chunks below this cosine score; if none clear it, treat as
    // insufficient evidence rather than answering from weak matches. Calibrated
    // for gemini-embedding-001, whose similarity floor is ~0.74 even for
    // unrelated text (relevant travel queries score ~0.82-0.87 here).
    minScore: num(process.env.RAG_MIN_SCORE, 0.78),
    // Cap assembled context so the prompt stays bounded.
    maxContextChars: num(process.env.RAG_MAX_CONTEXT_CHARS, 6_000),
  },

  // Simple per-user rate limit for AI routes
  rateLimit: {
    windowMs: num(process.env.LLM_RATE_WINDOW_MS, 60_000),
    max: num(process.env.LLM_RATE_MAX, 10),
  },
};

/** Whether the provider is configured enough to make calls. */
export const isLlmConfigured = () => Boolean(llmConfig.apiKey);

/**
 * Clamp/validate user-overridable generation params against configured limits.
 * Returns a safe { model, maxOutputTokens, temperature } object.
 */
export const resolveGenerationParams = (overrides = {}) => {
  const maxOutputTokens = Math.min(
    Math.max(1, num(overrides.maxTokens, llmConfig.maxOutputTokens)),
    llmConfig.maxOutputTokensCap
  );
  const temperature = Math.min(
    Math.max(0, num(overrides.temperature, llmConfig.temperature)),
    2
  );
  const model = overrides.model || llmConfig.model;
  return { model, maxOutputTokens, temperature };
};
