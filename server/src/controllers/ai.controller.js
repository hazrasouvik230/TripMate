import { generateResponse, generateResponseStream } from "../services/llm/llmService.js";
import {
  generateItineraryForTrip,
  generateItineraryForTripStream,
  generateDayForTrip,
  recomputeTotals,
  buildBudgetAdvisory,
} from "../services/llm/itineraryGenerator.js";
import { searchKnowledge as runVectorSearch } from "../services/search/vectorSearchService.js";
import { suggestInterests as runSuggestInterests } from "../services/llm/interestSuggester.js";
import { answerQuestion } from "../services/rag/ragService.js";
import { chat as runChat, chatStream as runChatStream } from "../services/chat/chatService.js";
import { getConversation } from "../services/chat/conversationService.js";
import { isLlmConfigured } from "../config/llm.js";
import Trip from "../models/Trip.js";
import Itinerary from "../models/Itinerary.js";

// Editable fields a user may change on a day (date/dayNumber stay server-owned).
const applyDayEdits = (existing, incoming) => ({
  dayNumber: existing.dayNumber, // preserved
  date: existing.date, // preserved
  summary: incoming.summary ?? existing.summary,
  morning: incoming.morning ?? null,
  afternoon: incoming.afternoon ?? null,
  evening: incoming.evening ?? null,
  food: incoming.food ?? [],
  transportation: incoming.transportation ?? "",
  accommodation: incoming.accommodation ?? [],
  tips: incoming.tips ?? [],
});

/* ------------------------------------------------------------------ */
/*  POST  /api/v1/ai/test                                             */
/* ------------------------------------------------------------------ */
/**
 * A protected smoke-test endpoint for the LLM integration. Takes a travel
 * question and returns the model's answer plus token usage. No persistence,
 * no RAG — just a round-trip through llmService.
 */
const SYSTEM_PROMPT =
  "You are TripMate AI, a concise and friendly travel assistant. " +
  "Answer travel-planning questions with practical, specific suggestions. " +
  "Keep responses focused and under ~200 words unless more detail is clearly needed.";

export const aiTest = async (req, res, next) => {
  try {
    if (!isLlmConfigured()) {
      return res.status(503).json({
        success: false,
        message:
          "AI provider is not configured. Set GEMINI_API_KEY on the server.",
      });
    }

    const { message, model, maxTokens, temperature } = req.body;

    const result = await generateResponse({
      system: SYSTEM_PROMPT,
      userMessage: message,
      model,
      maxTokens,
      temperature,
    });

    res.status(200).json({
      success: true,
      reply: result.text,
      meta: {
        model: result.model,
        finishReason: result.finishReason,
        usage: result.usage,
      },
    });
  } catch (error) {
    // LlmError carries an appropriate statusCode for the error handler.
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/*  POST  /api/v1/ai/test/stream                                      */
/* ------------------------------------------------------------------ */
/**
 * Streaming variant of aiTest. Emits the answer token-by-token over SSE.
 *
 * Event protocol (each `data:` line is a JSON object with a `type`):
 *   {type:"token", value}            - an incremental chunk of the reply
 *   {type:"done", meta}              - final metadata (model, usage, …)
 *   {type:"error", message}          - failure (pre- or mid-stream)
 *
 * Config errors raised before streaming starts are returned as normal JSON;
 * once the SSE stream is open they are sent as an `error` event.
 */
export const aiTestStream = async (req, res, next) => {
  if (!isLlmConfigured()) {
    return res.status(503).json({
      success: false,
      message: "AI provider is not configured. Set GEMINI_API_KEY on the server.",
    });
  }

  const { message, model, maxTokens, temperature } = req.body;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  const send = (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`);

  let aborted = false;
  req.on("close", () => {
    aborted = true;
  });

  try {
    const result = await generateResponseStream({
      system: SYSTEM_PROMPT,
      userMessage: message,
      model,
      maxTokens,
      temperature,
      onToken: (delta) => {
        if (!aborted) send({ type: "token", value: delta });
      },
    });

    if (!aborted) {
      send({
        type: "done",
        meta: {
          model: result.model,
          finishReason: result.finishReason,
          usage: result.usage,
        },
      });
    }
    res.end();
  } catch (error) {
    if (!aborted) {
      send({
        type: "error",
        message: error?.message || "Something went wrong talking to the AI.",
      });
    }
    res.end();
  }
};

/* ------------------------------------------------------------------ */
/*  POST  /api/v1/ai/generate-itinerary                               */
/* ------------------------------------------------------------------ */
/**
 * Generate a structured, day-by-day itinerary for one of the user's trips.
 * Ownership is enforced; totals and dates are computed server-side; each
 * generation is saved as a new version.
 */
export const generateItinerary = async (req, res, next) => {
  try {
    if (!isLlmConfigured()) {
      return res.status(503).json({
        success: false,
        message:
          "AI provider is not configured. Set GEMINI_API_KEY on the server.",
      });
    }

    const { tripId, instructions } = req.body;

    // Ownership check — a trip the user doesn't own is indistinguishable from missing.
    const trip = await Trip.findOne({ _id: tripId, userId: req.user._id });
    if (!trip) {
      return res
        .status(404)
        .json({ success: false, message: "Trip not found" });
    }

    const generated = await generateItineraryForTrip(trip, { instructions });

    // Next version number for this trip/user.
    const latest = await Itinerary.findOne({
      tripId: trip._id,
      userId: req.user._id,
    })
      .sort({ version: -1 })
      .select("version");
    const version = (latest?.version || 0) + 1;

    const { usage, ...toSave } = generated;
    const itinerary = await Itinerary.create({
      ...toSave,
      tripId: trip._id,
      userId: req.user._id,
      version,
    });

    res.status(201).json({
      success: true,
      message: "Itinerary generated successfully",
      itinerary,
      meta: { model: generated.model, usage },
    });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/*  POST  /api/v1/ai/generate-itinerary/stream                        */
/* ------------------------------------------------------------------ */
/**
 * Streaming variant of generateItinerary. Emits each day over SSE the moment
 * the model finishes it, then persists the validated itinerary and sends it.
 *
 * Event protocol (each `data:` line is a JSON object with a `type`):
 *   {type:"meta", currency, numDays, disclaimer}  - once, before any days
 *   {type:"day",  index, day, complete}           - a day update (fills in live)
 *   {type:"done", itinerary, meta}                - the saved, validated result
 *   {type:"error", message}                       - failure (pre- or mid-stream)
 *
 * Ownership + config errors raised before streaming starts are returned as
 * normal JSON; once the SSE stream is open they are sent as an `error` event.
 */
export const generateItineraryStream = async (req, res, next) => {
  if (!isLlmConfigured()) {
    return res.status(503).json({
      success: false,
      message: "AI provider is not configured. Set GEMINI_API_KEY on the server.",
    });
  }

  const { tripId, instructions } = req.body;

  // Ownership — a trip the user doesn't own is indistinguishable from missing.
  const trip = await Trip.findOne({ _id: tripId, userId: req.user._id });
  if (!trip) {
    return res.status(404).json({ success: false, message: "Trip not found" });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  const send = (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`);

  let aborted = false;
  req.on("close", () => {
    aborted = true;
  });

  try {
    const generated = await generateItineraryForTripStream(trip, {
      instructions,
      onMeta: (meta) => {
        if (!aborted) send({ type: "meta", ...meta });
      },
      onDay: (day, index, complete) => {
        if (!aborted) send({ type: "day", index, day, complete });
      },
    });

    // Next version number for this trip/user, then persist.
    const latest = await Itinerary.findOne({ tripId: trip._id, userId: req.user._id })
      .sort({ version: -1 })
      .select("version");
    const version = (latest?.version || 0) + 1;

    const { usage, ...toSave } = generated;
    const itinerary = await Itinerary.create({
      ...toSave,
      tripId: trip._id,
      userId: req.user._id,
      version,
    });

    if (!aborted) {
      send({ type: "done", itinerary, meta: { model: generated.model, usage } });
    }
    res.end();
  } catch (error) {
    if (!aborted) {
      send({
        type: "error",
        message: error?.message || "Failed to generate itinerary. Please try again.",
      });
    }
    res.end();
  }
};

/* ------------------------------------------------------------------ */
/*  GET  /api/v1/ai/itinerary/:tripId                                 */
/* ------------------------------------------------------------------ */
/**
 * Return the latest saved itinerary for one of the user's trips (or 404).
 */
export const getLatestItinerary = async (req, res, next) => {
  try {
    const { tripId } = req.params;

    // Confirm ownership of the trip before returning any itinerary.
    const trip = await Trip.findOne({ _id: tripId, userId: req.user._id }).select("_id");
    if (!trip) {
      return res
        .status(404)
        .json({ success: false, message: "Trip not found" });
    }

    const itinerary = await Itinerary.findOne({
      tripId,
      userId: req.user._id,
    }).sort({ version: -1 });

    if (!itinerary) {
      return res
        .status(404)
        .json({ success: false, message: "No itinerary generated yet" });
    }

    res.status(200).json({ success: true, itinerary });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/*  PATCH  /api/v1/ai/itinerary/:itineraryId                          */
/* ------------------------------------------------------------------ */
/**
 * Persist user edits (edit / reorder / delete activities) to an itinerary.
 * Ownership is enforced by scoping the query to the authenticated user.
 * Dates and day numbers are preserved server-side; all costs are recomputed
 * in JS — client-sent totals and dates are ignored.
 */
export const updateItinerary = async (req, res, next) => {
  try {
    const itinerary = await Itinerary.findOne({
      _id: req.params.itineraryId,
      userId: req.user._id,
    });
    if (!itinerary) {
      return res
        .status(404)
        .json({ success: false, message: "Itinerary not found" });
    }

    // Match incoming day edits to existing days by dayNumber; ignore unknowns.
    const incomingByDay = new Map(req.body.days.map((d) => [d.dayNumber, d]));
    const newDays = itinerary.days.map((existing) => {
      const incoming = incomingByDay.get(existing.dayNumber);
      return incoming ? applyDayEdits(existing, incoming) : existing.toObject();
    });

    const estimatedTotalCost = recomputeTotals(newDays); // sets estimatedDayCost too
    itinerary.days = newDays;
    itinerary.estimatedTotalCost = estimatedTotalCost;

    // Keep the budget advisory in sync with the edited total.
    const trip = await Trip.findOne({
      _id: itinerary.tripId,
      userId: req.user._id,
    });
    if (trip) {
      itinerary.budgetAdvisory = buildBudgetAdvisory(trip, estimatedTotalCost);
    }
    await itinerary.save();

    res.status(200).json({
      success: true,
      message: "Itinerary updated",
      itinerary,
    });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/*  POST  /api/v1/ai/itinerary/:itineraryId/day/:dayNumber/regenerate */
/* ------------------------------------------------------------------ */
/**
 * Regenerate a single day of an itinerary via the LLM, keeping the day's date
 * and number, then recompute totals in JS. Ownership enforced throughout.
 */
export const regenerateDay = async (req, res, next) => {
  try {
    if (!isLlmConfigured()) {
      return res.status(503).json({
        success: false,
        message:
          "AI provider is not configured. Set GEMINI_API_KEY on the server.",
      });
    }

    const dayNumber = Number(req.params.dayNumber);
    if (!Number.isInteger(dayNumber) || dayNumber < 1) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid day number" });
    }

    const itinerary = await Itinerary.findOne({
      _id: req.params.itineraryId,
      userId: req.user._id,
    });
    if (!itinerary) {
      return res
        .status(404)
        .json({ success: false, message: "Itinerary not found" });
    }

    const dayIdx = itinerary.days.findIndex((d) => d.dayNumber === dayNumber);
    if (dayIdx === -1) {
      return res
        .status(404)
        .json({ success: false, message: "Day not found in itinerary" });
    }

    // Trip is needed for context; re-check ownership here too.
    const trip = await Trip.findOne({
      _id: itinerary.tripId,
      userId: req.user._id,
    });
    if (!trip) {
      return res
        .status(404)
        .json({ success: false, message: "Trip not found" });
    }

    // Encourage variety: avoid repeating other days' attractions.
    const avoidNames = itinerary.days
      .filter((_, i) => i !== dayIdx)
      .flatMap((d) => [d.morning?.name, d.afternoon?.name, d.evening?.name])
      .filter(Boolean);

    const existing = itinerary.days[dayIdx];
    const fresh = await generateDayForTrip(trip, dayNumber, existing.date, avoidNames);

    const newDays = itinerary.days.map((d, i) =>
      i === dayIdx
        ? {
            dayNumber: existing.dayNumber, // preserved
            date: existing.date, // preserved
            ...fresh,
          }
        : d.toObject()
    );

    itinerary.estimatedTotalCost = recomputeTotals(newDays);
    itinerary.days = newDays;
    itinerary.budgetAdvisory = buildBudgetAdvisory(trip, itinerary.estimatedTotalCost);
    await itinerary.save();

    res.status(200).json({
      success: true,
      message: `Day ${dayNumber} regenerated`,
      itinerary,
    });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/*  POST  /api/v1/ai/search-knowledge                                 */
/* ------------------------------------------------------------------ */
/**
 * Semantic search over the curated travel knowledge base (Atlas Vector Search).
 * Embeds the query and returns the most relevant chunks with titles, metadata,
 * sources, and similarity scores. Optional destination/category filters.
 */
export const searchKnowledge = async (req, res, next) => {
  try {
    if (!isLlmConfigured()) {
      return res.status(503).json({
        success: false,
        message:
          "AI provider is not configured. Set GEMINI_API_KEY on the server.",
      });
    }

    const { query, destination, category, limit } = req.body;

    const { results, count } = await runVectorSearch({
      query,
      destination,
      category,
      limit,
    });

    res.status(200).json({
      success: true,
      query: query.trim(),
      count,
      filters: {
        ...(destination ? { destination } : {}),
        ...(category ? { category } : {}),
      },
      results,
    });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/*  POST  /api/v1/ai/suggest-interests                                */
/* ------------------------------------------------------------------ */
/**
 * Suggest interest tags tailored to a trip's destination (and optional
 * stopover), so the form can offer contextual options instead of a static
 * list. Best-effort: the client falls back to its own list on any failure.
 */
export const suggestInterests = async (req, res, next) => {
  try {
    if (!isLlmConfigured()) {
      return res.status(503).json({
        success: false,
        message:
          "AI provider is not configured. Set GEMINI_API_KEY on the server.",
      });
    }

    const { destination, stopover } = req.body;
    const { interests, model } = await runSuggestInterests({ destination, stopover });

    res.status(200).json({
      success: true,
      interests,
      meta: { model },
    });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/*  POST  /api/v1/ai/ask                                              */
/* ------------------------------------------------------------------ */
/**
 * Retrieval-Augmented Generation: answer a travel question grounded in the
 * curated knowledge base, returning the answer plus supporting sources.
 */
export const ask = async (req, res, next) => {
  try {
    if (!isLlmConfigured()) {
      return res.status(503).json({
        success: false,
        message:
          "AI provider is not configured. Set GEMINI_API_KEY on the server.",
      });
    }

    const { question, tripId, destination, category, limit } = req.body;

    const result = await answerQuestion({
      question,
      userId: req.user._id,
      tripId,
      destination,
      category,
      limit,
    });

    res.status(200).json({
      success: true,
      question: question.trim(),
      answer: result.answer,
      grounded: result.grounded,
      sources: result.sources,
      meta: {
        retrievedCount: result.retrievedCount,
        usedCount: result.usedCount,
        ...(result.model ? { model: result.model } : {}),
        ...(result.usage ? { usage: result.usage } : {}),
      },
    });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/*  POST  /api/v1/ai/chat                                             */
/* ------------------------------------------------------------------ */
/**
 * Conversational assistant turn for a trip. Trip ownership is enforced in the
 * chat service; the model cannot modify any data (no tools).
 */
export const chat = async (req, res, next) => {
  try {
    if (!isLlmConfigured()) {
      return res.status(503).json({
        success: false,
        message:
          "AI provider is not configured. Set GEMINI_API_KEY on the server.",
      });
    }

    const { tripId, message } = req.body;
    const result = await runChat({ userId: req.user._id, tripId, message });

    res.status(200).json({
      success: true,
      reply: result.reply,
      grounded: result.grounded,
      sources: result.sources,
      conversationId: result.conversationId,
    });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/*  POST  /api/v1/ai/chat/stream                                      */
/* ------------------------------------------------------------------ */
/**
 * Streaming variant of `chat`. Emits the reply token-by-token over
 * Server-Sent Events (SSE) so the client can render it word-by-word.
 *
 * Event protocol (each `data:` line is a JSON object with a `type`):
 *   {type:"token", value:"…"}                       - a streamed text delta
 *   {type:"done",  grounded, sources, conversationId} - completion metadata
 *   {type:"error", message}                          - mid-stream failure
 *
 * Errors before streaming starts are returned as normal JSON (with a proper
 * status code); once the SSE stream is open the status is already 200, so
 * failures are reported via an `error` event instead.
 */
export const chatStream = async (req, res, next) => {
  if (!isLlmConfigured()) {
    return res.status(503).json({
      success: false,
      message: "AI provider is not configured. Set GEMINI_API_KEY on the server.",
    });
  }

  const { tripId, message } = req.body;

  // Open the SSE stream. Headers must be flushed before the first event.
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // disable proxy buffering (e.g. nginx)
  });
  res.flushHeaders?.();

  const send = (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`);

  // Stop generating if the client disconnects mid-stream.
  let aborted = false;
  req.on("close", () => {
    aborted = true;
  });

  try {
    const result = await runChatStream({
      userId: req.user._id,
      tripId,
      message,
      onToken: (delta) => {
        if (!aborted) send({ type: "token", value: delta });
      },
    });

    if (!aborted) {
      send({
        type: "done",
        grounded: result.grounded,
        sources: result.sources,
        conversationId: result.conversationId,
      });
    }
    res.end();
  } catch (error) {
    // The stream is already open (status 200), so surface the error as an
    // event rather than letting the JSON error handler try to set a status.
    if (!aborted) {
      send({
        type: "error",
        message: error?.message || "The assistant couldn't respond. Please try again.",
      });
    }
    res.end();
  }
};

/* ------------------------------------------------------------------ */
/*  GET  /api/v1/ai/chat/:tripId                                      */
/* ------------------------------------------------------------------ */
/**
 * Return the conversation history for one of the user's trips (ownership
 * enforced). Empty array if no conversation yet.
 */
export const getChatHistory = async (req, res, next) => {
  try {
    const { tripId } = req.params;

    const trip = await Trip.findOne({ _id: tripId, userId: req.user._id }).select("_id");
    if (!trip) {
      return res.status(404).json({ success: false, message: "Trip not found" });
    }

    const conversation = await getConversation(req.user._id, tripId);
    res.status(200).json({
      success: true,
      messages: conversation?.messages || [],
    });
  } catch (error) {
    next(error);
  }
};
