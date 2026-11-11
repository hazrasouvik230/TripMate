import { GoogleGenAI, ApiError } from "@google/genai";
import {
  llmConfig,
  isLlmConfigured,
  resolveGenerationParams,
} from "../../config/llm.js";

/**
 * llmService — a thin, modular wrapper over the Google Gemini API
 * (official @google/genai SDK).
 *
 * Responsibilities:
 *   • Own the SDK client (API key, timeout, retries) — never leaked outward.
 *   • Send system + user messages and return a normalised response.
 *   • Make model / generation parameters configurable (env + per-call).
 *   • Translate SDK errors and timeouts into typed, HTTP-friendly errors.
 *   • Surface token usage so callers can track spend and enforce limits.
 *
 * It is deliberately provider-aware but feature-light: no RAG, no tools,
 * no streaming — just request/response generation.
 */

/* ------------------------------------------------------------------ */
/*  Error type                                                         */
/* ------------------------------------------------------------------ */
export class LlmError extends Error {
  constructor(message, { statusCode = 502, code = "llm_error", retryable = false } = {}) {
    super(message);
    this.name = "LlmError";
    this.statusCode = statusCode;
    this.code = code;
    this.retryable = retryable;
  }
}

/* ------------------------------------------------------------------ */
/*  Client (lazy singleton)                                            */
/* ------------------------------------------------------------------ */
let client = null;

const getClient = () => {
  if (!isLlmConfigured()) {
    throw new LlmError(
      "AI provider is not configured. Set GEMINI_API_KEY on the server.",
      { statusCode: 503, code: "llm_not_configured" }
    );
  }
  if (!client) {
    client = new GoogleGenAI({
      apiKey: llmConfig.apiKey,
      // Retries + timeout applied per-request via httpOptions below.
    });
  }
  return client;
};

/* ------------------------------------------------------------------ */
/*  Request-limit guard                                                */
/* ------------------------------------------------------------------ */
const enforceInputLimit = (text) => {
  if (typeof text !== "string" || text.trim() === "") {
    throw new LlmError("Message content is required.", {
      statusCode: 400,
      code: "empty_input",
    });
  }
  if (text.length > llmConfig.maxInputChars) {
    throw new LlmError(
      `Message is too long (${text.length} chars). Limit is ${llmConfig.maxInputChars}.`,
      { statusCode: 413, code: "input_too_large" }
    );
  }
};

/* ------------------------------------------------------------------ */
/*  Error translation                                                  */
/* ------------------------------------------------------------------ */
// Gemini's ApiError.message is a JSON string; pull out the human part.
const cleanMessage = (raw) => {
  if (typeof raw !== "string") return "Unknown provider error";
  try {
    const parsed = JSON.parse(raw);
    return parsed?.error?.message || raw;
  } catch {
    return raw;
  }
};

const translateError = (error) => {
  if (error instanceof LlmError) return error;

  // Aborted request → timeout.
  if (error?.name === "AbortError" || error?.name === "TimeoutError") {
    return new LlmError("The AI request timed out. Please try again.", {
      statusCode: 504,
      code: "timeout",
      retryable: true,
    });
  }

  // SDK API errors carry an HTTP .status.
  if (error instanceof ApiError) {
    const status = error.status;
    const msg = cleanMessage(error.message);

    if (status === 400 && /api key/i.test(msg)) {
      return new LlmError("AI provider authentication failed (invalid API key).", {
        statusCode: 502,
        code: "auth_error",
      });
    }
    if (status === 401 || status === 403) {
      return new LlmError("AI provider authentication failed.", {
        statusCode: 502,
        code: "auth_error",
      });
    }
    if (status === 429) {
      return new LlmError("AI provider is rate limiting requests. Try again shortly.", {
        statusCode: 429,
        code: "provider_rate_limited",
        retryable: true,
      });
    }
    if (status === 400) {
      return new LlmError(`AI request was rejected: ${msg}`, {
        statusCode: 400,
        code: "bad_request",
      });
    }
    if (status >= 500) {
      return new LlmError(`AI provider error: ${msg}`, {
        statusCode: 502,
        code: "api_error",
        retryable: true,
      });
    }
    return new LlmError(`AI provider error: ${msg}`, {
      statusCode: 502,
      code: "api_error",
    });
  }

  // Network / connection failures.
  if (error?.name === "FetchError" || error?.code === "ECONNREFUSED") {
    return new LlmError("Could not reach the AI provider.", {
      statusCode: 502,
      code: "connection_error",
      retryable: true,
    });
  }

  return new LlmError("Unexpected error talking to the AI provider.", {
    statusCode: 502,
    code: "unknown_error",
  });
};

/* ------------------------------------------------------------------ */
/*  Message mapping                                                    */
/* ------------------------------------------------------------------ */
// Convert a chat-style messages array to Gemini `contents`. Gemini uses
// roles "user" and "model"; it has no "assistant". System text goes into
// the separate `systemInstruction` field, not `contents`.
const toGeminiContents = (messages) =>
  messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: typeof m.content === "string" ? m.content : "" }],
  }));

/* ------------------------------------------------------------------ */
/*  Core generation                                                    */
/* ------------------------------------------------------------------ */
/**
 * Generate a single response from system + user messages.
 *
 * @param {object}   opts
 * @param {string}   [opts.system]       - System instruction (role/behaviour).
 * @param {string}   [opts.userMessage]  - Convenience single user turn.
 * @param {Array}    [opts.messages]     - Full message array (overrides userMessage).
 * @param {string}   [opts.model]        - Model override.
 * @param {number}   [opts.maxTokens]    - Output cap (clamped to configured max).
 * @param {number}   [opts.temperature]  - Sampling temperature (0–2).
 * @returns {Promise<{text:string, model:string, finishReason:string, usage:object}>}
 */
export const generateResponse = async ({
  system,
  userMessage,
  messages,
  model,
  maxTokens,
  temperature,
} = {}) => {
  const msgs =
    Array.isArray(messages) && messages.length
      ? messages
      : [{ role: "user", content: userMessage }];

  const inputText = msgs
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .join("\n");
  enforceInputLimit(inputText);

  const params = resolveGenerationParams({ model, maxTokens, temperature });

  try {
    const ai = getClient();

    const response = await ai.models.generateContent({
      model: params.model,
      contents: toGeminiContents(msgs),
      config: {
        ...(system ? { systemInstruction: system } : {}),
        maxOutputTokens: params.maxOutputTokens,
        temperature: params.temperature,
        // Only constrain thinking when a valid level is configured; some models
        // (e.g. lite variants) reject thinkingLevel, so NONE/blank omits it.
        ...(["MINIMAL", "LOW", "MEDIUM", "HIGH"].includes(llmConfig.thinkingLevel)
          ? { thinkingConfig: { thinkingLevel: llmConfig.thinkingLevel } }
          : {}),
        abortSignal: AbortSignal.timeout(llmConfig.timeoutMs),
        httpOptions: { timeout: llmConfig.timeoutMs },
      },
    });

    // Safety block on the prompt → no candidates.
    const blockReason = response.promptFeedback?.blockReason;
    if (blockReason) {
      throw new LlmError(`The AI declined to answer this request (${blockReason}).`, {
        statusCode: 422,
        code: "refusal",
      });
    }

    const finishReason = response.candidates?.[0]?.finishReason;
    const text = (response.text || "").trim();

    if (!text) {
      // e.g. hit MAX_TOKENS entirely inside thinking, or SAFETY stop.
      throw new LlmError(
        `The AI returned no text${finishReason ? ` (finish reason: ${finishReason})` : ""}.`,
        { statusCode: 502, code: "empty_response" }
      );
    }

    const usage = response.usageMetadata || {};
    return {
      text,
      model: params.model,
      finishReason: finishReason || "STOP",
      usage: {
        inputTokens: usage.promptTokenCount ?? 0,
        outputTokens: usage.candidatesTokenCount ?? 0,
        thoughtsTokens: usage.thoughtsTokenCount ?? 0,
        totalTokens: usage.totalTokenCount ?? 0,
      },
    };
  } catch (error) {
    throw translateError(error);
  }
};

/* ------------------------------------------------------------------ */
/*  Streaming generation                                               */
/* ------------------------------------------------------------------ */
/**
 * Stream a response token-by-token from system + user messages.
 *
 * Tokens are delivered incrementally via `onToken(deltaText)` as the provider
 * produces them; the full accumulated text and usage are returned once the
 * stream completes. Mirrors generateResponse's validation and error handling.
 *
 * @param {object}   opts
 * @param {string}   [opts.system]      - System instruction.
 * @param {string}   [opts.userMessage] - Convenience single user turn.
 * @param {Array}    [opts.messages]    - Full message array (overrides userMessage).
 * @param {string}   [opts.model]
 * @param {number}   [opts.maxTokens]
 * @param {number}   [opts.temperature]
 * @param {(delta:string)=>void} [opts.onToken] - Called per streamed chunk.
 * @returns {Promise<{text:string, model:string, finishReason:string, usage:object}>}
 */
export const generateResponseStream = async ({
  system,
  userMessage,
  messages,
  model,
  maxTokens,
  temperature,
  onToken,
} = {}) => {
  const msgs =
    Array.isArray(messages) && messages.length
      ? messages
      : [{ role: "user", content: userMessage }];

  const inputText = msgs
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .join("\n");
  enforceInputLimit(inputText);

  const params = resolveGenerationParams({ model, maxTokens, temperature });

  try {
    const ai = getClient();

    const stream = await ai.models.generateContentStream({
      model: params.model,
      contents: toGeminiContents(msgs),
      config: {
        ...(system ? { systemInstruction: system } : {}),
        maxOutputTokens: params.maxOutputTokens,
        temperature: params.temperature,
        ...(["MINIMAL", "LOW", "MEDIUM", "HIGH"].includes(llmConfig.thinkingLevel)
          ? { thinkingConfig: { thinkingLevel: llmConfig.thinkingLevel } }
          : {}),
        abortSignal: AbortSignal.timeout(llmConfig.timeoutMs),
        httpOptions: { timeout: llmConfig.timeoutMs },
      },
    });

    let text = "";
    let finishReason;
    let usage = {};

    for await (const chunk of stream) {
      // A safety block on the prompt surfaces as a blockReason (usually first chunk).
      const blockReason = chunk.promptFeedback?.blockReason;
      if (blockReason) {
        throw new LlmError(`The AI declined to answer this request (${blockReason}).`, {
          statusCode: 422,
          code: "refusal",
        });
      }

      const delta = chunk.text || "";
      if (delta) {
        text += delta;
        if (typeof onToken === "function") onToken(delta);
      }

      // The latest values win; the final chunk carries the authoritative usage.
      finishReason = chunk.candidates?.[0]?.finishReason ?? finishReason;
      if (chunk.usageMetadata) usage = chunk.usageMetadata;
    }

    text = text.trim();
    if (!text) {
      throw new LlmError(
        `The AI returned no text${finishReason ? ` (finish reason: ${finishReason})` : ""}.`,
        { statusCode: 502, code: "empty_response" }
      );
    }

    return {
      text,
      model: params.model,
      finishReason: finishReason || "STOP",
      usage: {
        inputTokens: usage.promptTokenCount ?? 0,
        outputTokens: usage.candidatesTokenCount ?? 0,
        thoughtsTokens: usage.thoughtsTokenCount ?? 0,
        totalTokens: usage.totalTokenCount ?? 0,
      },
    };
  } catch (error) {
    throw translateError(error);
  }
};

/* ------------------------------------------------------------------ */
/*  Structured (JSON) generation                                       */
/* ------------------------------------------------------------------ */
/**
 * Generate a response constrained to a JSON schema (Gemini structured output).
 * Returns the parsed object plus usage. The caller MUST still validate the
 * parsed data (e.g. with Zod) — structured output constrains shape, not values.
 *
 * @param {object} opts
 * @param {string} opts.system       - System instruction.
 * @param {string} opts.userMessage  - User prompt.
 * @param {object} opts.schema       - JSON Schema for the response.
 * @param {string} [opts.model]
 * @param {number} [opts.maxTokens]  - Output cap (clamped to itinerary cap).
 * @param {number} [opts.temperature]
 * @returns {Promise<{data:object, model:string, finishReason:string, usage:object}>}
 */
export const generateStructured = async ({
  system,
  userMessage,
  schema,
  model,
  maxTokens,
  temperature,
} = {}) => {
  enforceInputLimit(userMessage);

  const structuredCap = Math.max(
    llmConfig.itinerary.maxOutputTokens,
    llmConfig.maxOutputTokensCap
  );
  const resolvedMax = Math.min(
    Math.max(1, Number.isFinite(maxTokens) ? maxTokens : llmConfig.itinerary.maxOutputTokens),
    structuredCap
  );
  const resolvedTemp = Math.min(
    Math.max(0, Number.isFinite(temperature) ? temperature : llmConfig.temperature),
    2
  );
  const resolvedModel = model || llmConfig.model;

  try {
    const ai = getClient();

    const response = await ai.models.generateContent({
      model: resolvedModel,
      contents: [{ role: "user", parts: [{ text: userMessage }] }],
      config: {
        ...(system ? { systemInstruction: system } : {}),
        responseMimeType: "application/json",
        responseJsonSchema: schema,
        maxOutputTokens: resolvedMax,
        temperature: resolvedTemp,
        ...(["MINIMAL", "LOW", "MEDIUM", "HIGH"].includes(llmConfig.thinkingLevel)
          ? { thinkingConfig: { thinkingLevel: llmConfig.thinkingLevel } }
          : {}),
        abortSignal: AbortSignal.timeout(llmConfig.timeoutMs),
        httpOptions: { timeout: llmConfig.timeoutMs },
      },
    });

    const blockReason = response.promptFeedback?.blockReason;
    if (blockReason) {
      throw new LlmError(`The AI declined to answer this request (${blockReason}).`, {
        statusCode: 422,
        code: "refusal",
      });
    }

    const finishReason = response.candidates?.[0]?.finishReason;
    const raw = response.text || "";
    if (!raw.trim()) {
      throw new LlmError(
        `The AI returned no content${finishReason ? ` (finish reason: ${finishReason})` : ""}.`,
        { statusCode: 502, code: "empty_response" }
      );
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      // Output hit the token cap mid-JSON, or wasn't valid JSON.
      throw new LlmError(
        `The AI returned malformed JSON${finishReason === "MAX_TOKENS" ? " (output was truncated — raise the token limit)" : ""}.`,
        { statusCode: 502, code: "invalid_json" }
      );
    }

    const usage = response.usageMetadata || {};
    return {
      data,
      model: resolvedModel,
      finishReason: finishReason || "STOP",
      usage: {
        inputTokens: usage.promptTokenCount ?? 0,
        outputTokens: usage.candidatesTokenCount ?? 0,
        thoughtsTokens: usage.thoughtsTokenCount ?? 0,
        totalTokens: usage.totalTokenCount ?? 0,
      },
    };
  } catch (error) {
    throw translateError(error);
  }
};

/* ------------------------------------------------------------------ */
/*  Streaming structured (JSON) generation                             */
/* ------------------------------------------------------------------ */
/**
 * Streaming counterpart to generateStructured. The provider emits the JSON
 * incrementally; `onDelta(delta, accumulated)` fires per chunk so callers can
 * parse completed sub-objects as they arrive (e.g. itinerary days). The full
 * parsed object + usage are returned once the stream completes.
 *
 * @param {object} opts
 * @param {string} opts.system
 * @param {string} opts.userMessage
 * @param {object} opts.schema      - JSON Schema for the response.
 * @param {string} [opts.model]
 * @param {number} [opts.maxTokens]
 * @param {number} [opts.temperature]
 * @param {(delta:string, accumulated:string)=>void} [opts.onDelta]
 * @returns {Promise<{data:object, model:string, finishReason:string, usage:object}>}
 */
export const generateStructuredStream = async ({
  system,
  userMessage,
  schema,
  model,
  maxTokens,
  temperature,
  onDelta,
} = {}) => {
  enforceInputLimit(userMessage);

  const structuredCap = Math.max(
    llmConfig.itinerary.maxOutputTokens,
    llmConfig.maxOutputTokensCap
  );
  const resolvedMax = Math.min(
    Math.max(1, Number.isFinite(maxTokens) ? maxTokens : llmConfig.itinerary.maxOutputTokens),
    structuredCap
  );
  const resolvedTemp = Math.min(
    Math.max(0, Number.isFinite(temperature) ? temperature : llmConfig.temperature),
    2
  );
  const resolvedModel = model || llmConfig.model;

  try {
    const ai = getClient();

    const stream = await ai.models.generateContentStream({
      model: resolvedModel,
      contents: [{ role: "user", parts: [{ text: userMessage }] }],
      config: {
        ...(system ? { systemInstruction: system } : {}),
        responseMimeType: "application/json",
        responseJsonSchema: schema,
        maxOutputTokens: resolvedMax,
        temperature: resolvedTemp,
        ...(["MINIMAL", "LOW", "MEDIUM", "HIGH"].includes(llmConfig.thinkingLevel)
          ? { thinkingConfig: { thinkingLevel: llmConfig.thinkingLevel } }
          : {}),
        abortSignal: AbortSignal.timeout(llmConfig.timeoutMs),
        httpOptions: { timeout: llmConfig.timeoutMs },
      },
    });

    let raw = "";
    let finishReason;
    let usage = {};

    for await (const chunk of stream) {
      const blockReason = chunk.promptFeedback?.blockReason;
      if (blockReason) {
        throw new LlmError(`The AI declined to answer this request (${blockReason}).`, {
          statusCode: 422,
          code: "refusal",
        });
      }

      const delta = chunk.text || "";
      if (delta) {
        raw += delta;
        if (typeof onDelta === "function") onDelta(delta, raw);
      }

      finishReason = chunk.candidates?.[0]?.finishReason ?? finishReason;
      if (chunk.usageMetadata) usage = chunk.usageMetadata;
    }

    if (!raw.trim()) {
      throw new LlmError(
        `The AI returned no content${finishReason ? ` (finish reason: ${finishReason})` : ""}.`,
        { statusCode: 502, code: "empty_response" }
      );
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new LlmError(
        `The AI returned malformed JSON${finishReason === "MAX_TOKENS" ? " (output was truncated — raise the token limit)" : ""}.`,
        { statusCode: 502, code: "invalid_json" }
      );
    }

    const u = usage || {};
    return {
      data,
      model: resolvedModel,
      finishReason: finishReason || "STOP",
      usage: {
        inputTokens: u.promptTokenCount ?? 0,
        outputTokens: u.candidatesTokenCount ?? 0,
        thoughtsTokens: u.thoughtsTokenCount ?? 0,
        totalTokens: u.totalTokenCount ?? 0,
      },
    };
  } catch (error) {
    throw translateError(error);
  }
};

export default {
  generateResponse,
  generateResponseStream,
  generateStructured,
  generateStructuredStream,
  LlmError,
};
