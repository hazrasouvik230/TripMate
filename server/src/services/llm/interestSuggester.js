import { generateStructured } from "./llmService.js";

/**
 * interestSuggester — suggests travel-interest tags tailored to a destination
 * (and optional stopover), replacing a one-size-fits-all static list.
 *
 * The result is free-form (interests are stored as plain strings), so output
 * is cleaned and de-duplicated but not constrained to a fixed enum. Callers
 * should fall back to their own static list if this throws.
 */

const SYSTEM_PROMPT =
  "You suggest travel-interest tags for a trip-planning form. Given a " +
  "destination (and optionally a stopover/halt city), return concise interest " +
  "tags a traveller might pick to shape their itinerary. Rules: 10-14 tags; " +
  "each 1-3 words in Title Case; mix broadly-useful tags (e.g. Food & Dining, " +
  "Nature, Shopping) with ones specific to these places (e.g. Temples, Ski " +
  "Resorts, Desert Safari, Beaches); no duplicates; no numbering, emojis, or " +
  "explanations — tags only.";

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    interests: { type: "array", items: { type: "string" } },
  },
  required: ["interests"],
};

// Normalise one tag: collapse whitespace, trim, cap length.
const cleanTag = (s) =>
  typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, 60) : "";

/**
 * Suggest interest tags for a destination (+ optional stopover).
 *
 * @param {object} opts
 * @param {string} opts.destination
 * @param {string} [opts.stopover]
 * @returns {Promise<{interests: string[], model: string}>}
 */
export const suggestInterests = async ({ destination, stopover } = {}) => {
  const userMessage = [
    `Destination: ${destination}`,
    stopover ? `Stopover / halt city: ${stopover}` : null,
    "",
    "Suggest interest tags relevant to the above.",
  ]
    .filter(Boolean)
    .join("\n");

  const { data, model } = await generateStructured({
    system: SYSTEM_PROMPT,
    userMessage,
    schema: RESPONSE_SCHEMA,
    maxTokens: 256,
    temperature: 0.7,
  });

  // De-duplicate case-insensitively, drop empties, keep a sane cap.
  const seen = new Set();
  const interests = [];
  for (const raw of Array.isArray(data?.interests) ? data.interests : []) {
    const tag = cleanTag(raw);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    interests.push(tag);
    if (interests.length >= 14) break;
  }

  return { interests, model };
};

export default { suggestInterests };
