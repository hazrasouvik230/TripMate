import api, { getAuthToken } from "./api";

/**
 * AI service — talks to the authenticated backend AI routes.
 * The API key lives only on the server; the client never sees it.
 */
export const askAi = (message, options = {}) =>
  api.post("/ai/test", { message, ...options });

/**
 * Streaming variant of askAi: receives the reply token-by-token over SSE.
 *
 * @param {string} message
 * @param {object} handlers
 * @param {(delta:string, full:string)=>void} [handlers.onToken]
 * @param {(meta:object)=>void} [handlers.onDone]
 * @param {AbortSignal} [handlers.signal]
 * @returns {Promise<{reply:string, meta:object}>}
 */
export const streamAskAi = async (message, { onToken, onDone, signal } = {}) => {
  let full = "";
  let meta = null;

  await postSse("/ai/test/stream", { message }, {
    signal,
    onEvent: (payload) => {
      if (payload.type === "token") {
        full += payload.value;
        onToken?.(payload.value, full);
      } else if (payload.type === "done") {
        meta = payload.meta || null;
        onDone?.(meta);
      } else if (payload.type === "error") {
        throw new Error(payload.message || "Something went wrong talking to the AI.");
      }
    },
  });

  return { reply: full, meta };
};

/** Suggest destination-aware interest tags for the trip form. */
export const suggestInterests = (destination, stopover) =>
  api.post("/ai/suggest-interests", {
    destination,
    ...(stopover ? { stopover } : {}),
  });

/** Generate (and save) a new itinerary for a trip. */
export const generateItinerary = (tripId) =>
  api.post("/ai/generate-itinerary", { tripId });

/** Fetch the latest saved itinerary for a trip (404 if none yet). */
export const getItinerary = (tripId) => api.get(`/ai/itinerary/${tripId}`);

/** Persist edits (edit / reorder / delete activities). `days` is the full set. */
export const updateItinerary = (itineraryId, days) =>
  api.patch(`/ai/itinerary/${itineraryId}`, { days });

/** Regenerate a single day via the LLM. */
export const regenerateItineraryDay = (itineraryId, dayNumber) =>
  api.post(`/ai/itinerary/${itineraryId}/day/${dayNumber}/regenerate`);

/** Conversational assistant: send a message about a trip. */
export const sendChatMessage = (tripId, message) =>
  api.post("/ai/chat", { tripId, message });

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api/v1";

/**
 * POST to an SSE endpoint and dispatch each `data: {json}` event to `onEvent`.
 *
 * axios can't expose a readable body stream in the browser, so this uses
 * `fetch` directly (with credentials, to match the cookie-based auth used by
 * the axios client). Errors raised before the stream opens come back as
 * regular JSON and are thrown; `onEvent` may throw to abort (e.g. on an
 * in-stream `error` event).
 *
 * @param {string} path - endpoint path relative to the API base
 * @param {object} body - JSON request body
 * @param {object} opts
 * @param {(payload:object)=>void} opts.onEvent
 * @param {AbortSignal} [opts.signal]
 */
const postSse = async (path, body, { onEvent, signal } = {}) => {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: "include",
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    let msg = "Something went wrong. Please try again.";
    try {
      const data = await res.json();
      msg = data?.message || msg;
    } catch {
      /* non-JSON error body */
    }
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const drain = () => {
    let sepIdx;
    while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);

      const dataLine = rawEvent.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) continue;

      let payload;
      try {
        payload = JSON.parse(dataLine.slice(5).trim());
      } catch {
        continue; // ignore malformed event
      }
      onEvent(payload);
    }
  };

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    drain();
  }
  buffer += decoder.decode();
  drain();
};

/**
 * Streaming conversational assistant: sends a message and receives the reply
 * token-by-token over Server-Sent Events.
 *
 * @param {string} tripId
 * @param {string} message
 * @param {object} handlers
 * @param {(delta:string, full:string)=>void} [handlers.onToken] - per chunk
 * @param {(meta:{grounded, sources, conversationId})=>void} [handlers.onDone]
 * @param {AbortSignal} [handlers.signal] - to cancel the stream
 * @returns {Promise<{reply:string, grounded:boolean, sources:Array, conversationId:string}>}
 */
export const streamChatMessage = async (
  tripId,
  message,
  { onToken, onDone, signal } = {}
) => {
  let full = "";
  let meta = { grounded: false, sources: [], conversationId: null };

  await postSse("/ai/chat/stream", { tripId, message }, {
    signal,
    onEvent: (payload) => {
      if (payload.type === "token") {
        full += payload.value;
        onToken?.(payload.value, full);
      } else if (payload.type === "done") {
        meta = {
          grounded: payload.grounded,
          sources: payload.sources || [],
          conversationId: payload.conversationId,
        };
        onDone?.(meta);
      } else if (payload.type === "error") {
        throw new Error(payload.message || "The assistant couldn't respond.");
      }
    },
  });

  return { reply: full, ...meta };
};

/**
 * Streaming itinerary generation: each day is delivered the moment the model
 * finishes it, then the saved, validated itinerary arrives on completion.
 *
 * @param {string} tripId
 * @param {object} handlers
 * @param {string} [handlers.instructions] - free-text guidance to steer the plan
 * @param {(meta:{currency, numDays, disclaimer})=>void} [handlers.onMeta]
 * @param {(day:object, index:number, complete:boolean)=>void} [handlers.onDay]
 * @param {(itinerary:object, meta:object)=>void} [handlers.onDone]
 * @param {AbortSignal} [handlers.signal]
 * @returns {Promise<object>} the final saved itinerary
 */
export const streamGenerateItinerary = async (
  tripId,
  { instructions, onMeta, onDay, onDone, signal } = {}
) => {
  let itinerary = null;

  const body = { tripId };
  if (instructions?.trim()) body.instructions = instructions.trim();

  await postSse("/ai/generate-itinerary/stream", body, {
    signal,
    onEvent: (payload) => {
      if (payload.type === "meta") {
        onMeta?.({
          currency: payload.currency,
          numDays: payload.numDays,
          disclaimer: payload.disclaimer,
        });
      } else if (payload.type === "day") {
        onDay?.(payload.day, payload.index, payload.complete);
      } else if (payload.type === "done") {
        itinerary = payload.itinerary;
        onDone?.(payload.itinerary, payload.meta);
      } else if (payload.type === "error") {
        throw new Error(payload.message || "Failed to generate itinerary.");
      }
    },
  });

  return itinerary;
};

/**
 * Extend the latest itinerary with newly-unlocked days — the existing days are
 * kept as-is and only the remaining days are generated (and streamed). The
 * `index` in onDay is the absolute day index (0-based), so day 8 arrives at
 * index 7, letting the caller append without touching earlier days.
 *
 * @param {string} tripId
 * @param {object} handlers
 * @param {(meta:{currency, numDays, fromDay})=>void} [handlers.onMeta]
 * @param {(day:object, index:number, complete:boolean)=>void} [handlers.onDay]
 * @param {(itinerary:object, meta:object)=>void} [handlers.onDone]
 * @param {AbortSignal} [handlers.signal]
 * @returns {Promise<object>} the final saved (combined) itinerary
 */
export const streamExtendItinerary = async (
  tripId,
  { onMeta, onDay, onDone, signal } = {}
) => {
  let itinerary = null;

  await postSse("/ai/generate-itinerary/extend/stream", { tripId }, {
    signal,
    onEvent: (payload) => {
      if (payload.type === "meta") {
        onMeta?.({
          currency: payload.currency,
          numDays: payload.numDays,
          fromDay: payload.fromDay,
        });
      } else if (payload.type === "day") {
        onDay?.(payload.day, payload.index, payload.complete);
      } else if (payload.type === "done") {
        itinerary = payload.itinerary;
        onDone?.(payload.itinerary, payload.meta);
      } else if (payload.type === "error") {
        throw new Error(payload.message || "Failed to generate the remaining days.");
      }
    },
  });

  return itinerary;
};

/** Load the saved chat history for a trip. */
export const getChatHistory = (tripId) => api.get(`/ai/chat/${tripId}`);
