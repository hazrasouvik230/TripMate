import { generateStructured, generateStructuredStream, LlmError } from "./llmService.js";
import { llmConfig } from "../../config/llm.js";
import {
  llmItinerarySchema,
  llmDaySchema,
} from "../../validators/itinerary.validator.js";
import { geocode, searchPlaces } from "../geo/placesService.js";
import { getForecast } from "../geo/weatherService.js";

const DISCLAIMER =
  "AI-generated suggestions. Attractions, opening hours, food spots, transport " +
  "and especially prices are estimates and may be inaccurate or out of date — " +
  "verify details and current costs before you book or travel.";

/* ---------- Date helpers (UTC, to avoid TZ drift) ---------- */
const MS_DAY = 86_400_000;

const atUtcMidnight = (d) => {
  const dt = new Date(d);
  return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
};

const addDays = (d, n) => new Date(atUtcMidnight(d).getTime() + n * MS_DAY);

/** Inclusive number of days between start and end. */
export const tripDayCount = (trip) => {
  const start = atUtcMidnight(trip.startDate);
  const end = atUtcMidnight(trip.endDate);
  return Math.round((end.getTime() - start.getTime()) / MS_DAY) + 1;
};

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/* ---------- LLM JSON schema ---------- */
const activityJson = {
  type: "object",
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    durationMinutes: { type: "integer" },
    estimatedCost: { type: "number" },
  },
  required: ["name", "description", "durationMinutes", "estimatedCost"],
};

// Schema for a single day (shared by full-itinerary and single-day generation).
const dayItemJson = {
  type: "object",
  properties: {
    summary: { type: "string" },
    morning: activityJson,
    afternoon: activityJson,
    evening: activityJson,
    food: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          type: {
            type: "string",
            enum: ["breakfast", "lunch", "dinner", "snack"],
          },
          description: { type: "string" },
          estimatedCost: { type: "number" },
        },
        required: ["name", "type", "description", "estimatedCost"],
      },
    },
    transportation: { type: "string" },
    accommodation: {
      type: "array",
      description:
        "2-3 suggested places to stay the night (give the traveller a choice). " +
        "Empty on the final departure day.",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          area: { type: "string" },
          type: { type: "string" }, // e.g. hotel, guesthouse, hostel, resort
          pricePerNight: { type: "number" },
        },
        required: ["name"],
      },
    },
    tips: { type: "array", items: { type: "string" } },
  },
  required: [
    "summary",
    "morning",
    "afternoon",
    "evening",
    "food",
    "transportation",
    "tips",
  ],
};

const buildLlmSchema = () => ({
  type: "object",
  properties: { days: { type: "array", items: dayItemJson } },
  required: ["days"],
});

/* ---------- Budget helpers ---------- */
// `budget` may be stored per traveller; prompts always want the overall total
// for the whole party. Returns null when no budget is set.
const partyTotalBudget = (trip) => {
  if (!trip.budget) return null;
  return trip.budgetType === "per_person"
    ? round2(trip.budget * (trip.travellers || 1))
    : trip.budget;
};

// Round up to a clean increment so recommended figures look sensible.
const roundUpTo = (n, step) => Math.ceil(n / step) * step;

/**
 * If a budget is set and the realistic plan exceeds it, return a structured
 * advisory suggesting a more comfortable budget (realistic total + ~10% buffer,
 * rounded up). Returns null when no budget is set or the plan fits.
 */
export const buildBudgetAdvisory = (trip, estimatedTotalCost) => {
  const budget = partyTotalBudget(trip);
  if (!budget || estimatedTotalCost <= budget) return null;

  // Practical ways to either raise the budget or bring the trip cost down.
  const suggestions = [
    "Opt for budget stays (guesthouses/hostels) and local eateries over restaurants.",
    "Use public or shared transport instead of private cabs.",
    "Prioritise free or low-cost attractions and skip paid activities you can live without.",
    "Travel in the off-peak season for cheaper fares and stays.",
    trip.travellers > 1
      ? "Share rooms and transport across the group to cut per-head costs."
      : "Book transport and stays early to lock in lower fares.",
  ];

  return {
    setBudget: round2(budget),
    estimatedTotalCost: round2(estimatedTotalCost),
    shortfall: round2(estimatedTotalCost - budget),
    recommendedBudget: roundUpTo(estimatedTotalCost * 1.1, 500),
    currency: trip.currency || "INR",
    suggestions,
  };
};

/* ---------- Prompt ---------- */
const buildPrompt = (trip, numDays, instructions = "") => {
  const start = atUtcMidnight(trip.startDate).toISOString().slice(0, 10);
  const end = atUtcMidnight(trip.endDate).toISOString().slice(0, 10);
  const interests = trip.interests?.length ? trip.interests.join(", ") : "general sightseeing";
  const totalBudget = partyTotalBudget(trip);
  const perDayBudget = totalBudget ? round2(totalBudget / numDays) : null;
  const guidance = (instructions || "").trim();

  return [
    `Plan a ${numDays}-day travel itinerary.`,
    ``,
    `Destination: ${trip.destination}`,
    trip.origin ? `Travelling from: ${trip.origin}` : null,
    `Trip dates: ${start} to ${end}`,
    `Travellers: ${trip.travellers}`,
    totalBudget
      ? `Total budget for the whole party: ${totalBudget} ${trip.currency} (about ${perDayBudget} ${trip.currency} per day).`
      : null,
    `Interests: ${interests}`,
    `Travel style: ${trip.travelStyle} · Pace: ${trip.travelPace}`,
    ``,
    `Produce EXACTLY ${numDays} day(s), in order starting from the first day.`,
    `For each day provide: a short summary; a morning, afternoon and evening`,
    `activity (each with an attraction/place name, a short description, a`,
    `suggested visit duration in minutes, and an estimated cost); food`,
    `recommendations; a transportation suggestion; and 1-3 practical tips.`,
    ``,
    `PUBLIC TRANSPORT SPECIFICS (important): Whenever you recommend a public`,
    `transport service, name the exact service the traveller should board, not`,
    `just the mode:`,
    `  - Buses: give the operator plus the route/service number(s) (e.g.`,
    `    "KSRTC bus no. 9/9A" or "BMTC route 335E"). If several numbers serve`,
    `    the route, list the common ones.`,
    `  - Trains: give the train number AND name (e.g. "Train 12627 Karnataka`,
    `    Express"); mention the class if relevant.`,
    `  - Metro/tram/ferry: name the line or route (e.g. "Purple Line").`,
    `Put these identifiers in both the relevant activity description and the`,
    `day's transportation field. If you are not confident a specific number`,
    `currently exists, say so plainly (e.g. "check the latest KSRTC schedule")`,
    `rather than inventing a precise-looking but fake number.`,
    ``,
    `ACCOMMODATION (important): For every night the traveller actually stays at`,
    `the destination, fill the day's "accommodation" with 2-3 DIFFERENT specific,`,
    `real, well-known places to stay so the traveller has a choice — ideally`,
    `spanning a range of price points (e.g. a budget, a mid-range and a premium`,
    `option). For each, give its name, the area/neighbourhood, the type (hotel,`,
    `guesthouse, hostel, resort, homestay) and an approximate per-night price for`,
    `the whole party in ${trip.currency}. Keep the options aligned with the`,
    `travel style and budget. It's fine to reuse the same set of hotels across`,
    `consecutive nights in the same city. Leave accommodation EMPTY only on a`,
    `final day when the traveller departs and does not stay overnight. Prefer`,
    `real, named properties; if unsure one exists, suggest a specific area and`,
    `type rather than inventing a fake hotel name.`,
    trip.origin
      ? [
          ``,
          `JOURNEY (important): The traveller is starting from ${trip.origin}, NOT`,
          `already in ${trip.destination}. Day 1 MUST begin with the inter-city`,
          `journey from ${trip.origin} to ${trip.destination}` +
            (trip.stopover ? ` (via ${trip.stopover})` : "") +
            `: suggest realistic transport options (e.g. flight, train, bus or`,
          `drive) with an approximate travel time and estimated cost. For`,
          `public transport, name the exact service — bus operator + route/service`,
          `number(s), or train number + name (e.g. "Train 16536 Gol Gumbaz`,
          `Express") — so the traveller knows precisely what to board. Set Day`,
          `1's morning activity to this travel/arrival (and check-in) rather than`,
          `local sightseeing. Only schedule ${trip.destination} activities for the`,
          `time realistically left after arrival. On the final day, include the`,
          `return journey back to ${trip.origin} in the evening (or last) slot.`,
          `Reflect these trips in each day's transportation field and costs too.`,
        ].join("\n")
      : null,
    ``,
    `All costs must be in ${trip.currency}, as approximate totals for the whole`,
    `party of ${trip.travellers} traveller(s), and must be >= 0 (use 0 for free`,
    `activities). Use realistic, current-market price estimates for the`,
    `destination — do NOT guess numbers that are implausibly cheap or expensive.`,
    `Keep suggestions realistic for the destination, style and pace.`,
    totalBudget
      ? [
          ``,
          `BUDGET (primary goal): The party's budget is ${totalBudget} ${trip.currency}`,
          `(roughly ${perDayBudget} ${trip.currency} per day). Keep the plan's TOTAL`,
          `cost UNDER this budget, but make good use of it — aim to land CLOSE TO`,
          `(just under) the budget rather than far below, so the trip is as rich as`,
          `the budget allows. NEVER exceed the budget. Use realistic, current-market`,
          `prices; do NOT fabricate unrealistically low costs to force a fit, and do`,
          `NOT pad costs to reach the budget. ONLY if the destination genuinely`,
          `cannot be visited realistically for this many travellers/days even with`,
          `the cheapest realistic options should the total exceed the budget — in`,
          `that case use honest prices (the app will then show the user a recommended`,
          `budget).`,
        ].join("\n")
      : null,
    guidance
      ? [
          ``,
          `USER INSTRUCTIONS (high priority — follow these as closely as possible`,
          `without breaking the rules above, especially the budget constraint):`,
          guidance,
        ].join("\n")
      : null,
    `Do not include dates or day numbers in your output.`,
  ]
    .filter(Boolean)
    .join("\n");
};

/* ---------- Normalisation + JS totals ---------- */
// Sum of a day's activity + food costs. Exported so edit/regenerate paths
// recompute totals server-side rather than trusting any client/LLM figure.
export const computeDayCost = (day) => {
  const act =
    (day.morning?.estimatedCost || 0) +
    (day.afternoon?.estimatedCost || 0) +
    (day.evening?.estimatedCost || 0);
  const food = (day.food || []).reduce((s, f) => s + (f.estimatedCost || 0), 0);
  return round2(act + food);
};
const sumDayCost = computeDayCost;

/** Recompute every day's cost and the grand total (in JS). Mutates `days`. */
export const recomputeTotals = (days) => {
  days.forEach((d) => {
    d.estimatedDayCost = computeDayCost(d);
  });
  return round2(days.reduce((s, d) => s + d.estimatedDayCost, 0));
};

/* ---------- Real-data enrichment (best-effort, graceful fallback) ---------- */
/**
 * Fetch verified data (coordinates, candidate attractions, weather) from the
 * geo/weather providers so the LLM grounds on real places and conditions
 * instead of inventing them. Each provider is best-effort: a failure is
 * recorded in `unavailable` and generation continues without it.
 */
const gatherEnrichment = async (trip, numDays) => {
  const startIso = atUtcMidnight(trip.startDate).toISOString().slice(0, 10);
  const endIso = atUtcMidnight(addDays(trip.startDate, numDays - 1)).toISOString().slice(0, 10);

  const enrichment = {
    coordinates: null,
    places: [],
    placesProvider: null,
    placesSource: null,
    weather: [],
    weatherProvider: null,
    weatherInRange: false,
    providersUsed: [],
    unavailable: [],
    fetchedAt: new Date(),
  };

  // 1) Geocode the destination.
  try {
    const geo = await geocode(trip.destination);
    if (geo?.coordinates) {
      enrichment.coordinates = geo.coordinates;
      enrichment.providersUsed.push("places:geocode");
    } else {
      enrichment.unavailable.push("coordinates");
    }
  } catch {
    enrichment.unavailable.push("coordinates");
  }

  // 2) Candidate attractions (real names + coordinates). Nominatim is a
  // geocoder, so generic "attractions" queries fail — we query concrete
  // category terms that reliably return named POIs, then merge unique.
  const categories = ["museums", "monuments"];
  try {
    const seen = new Set();
    for (const cat of categories) {
      const { results, provider } = await searchPlaces({
        query: cat,
        near: trip.destination,
        limit: 6,
      });
      enrichment.placesProvider = provider;
      for (const r of results) {
        if (r.id && Number.isFinite(r.coordinates?.lat) && !seen.has(r.id)) {
          seen.add(r.id);
          enrichment.places.push({
            id: r.id,
            name: r.name,
            category: cat,
            coordinates: r.coordinates,
          });
        }
      }
    }
    enrichment.placesSource = "api";
    if (enrichment.places.length) enrichment.providersUsed.push("places:search");
    else enrichment.unavailable.push("places");
  } catch {
    if (!enrichment.places.length) enrichment.unavailable.push("places");
  }

  // 3) Weather forecast for the trip window (only if within provider horizon).
  if (enrichment.coordinates) {
    try {
      const wx = await getForecast({
        lat: enrichment.coordinates.lat,
        lon: enrichment.coordinates.lon,
        startDate: startIso,
        endDate: endIso,
      });
      enrichment.weatherProvider = wx.provider;
      enrichment.weatherInRange = wx.inForecastRange && wx.days.length > 0;
      enrichment.weather = enrichment.weatherInRange
        ? wx.days.map((d) => ({
            date: d.date,
            condition: d.condition,
            tempMaxC: d.tempMaxC,
            tempMinC: d.tempMinC,
            precipitationProbPct: d.precipitationProbPct,
          }))
        : [];
      if (enrichment.weatherInRange) enrichment.providersUsed.push("weather:forecast");
      else enrichment.unavailable.push("weather");
    } catch {
      enrichment.unavailable.push("weather");
    }
  } else {
    enrichment.unavailable.push("weather");
  }

  return enrichment;
};

// Append a clearly-labelled verified-data block to the base prompt.
const buildEnrichmentBlock = (enrichment) => {
  if (!enrichment.places.length && !enrichment.weather.length) return "";
  const lines = [
    ``,
    `VERIFIED REAL DATA (from live APIs — treat as factual; do NOT invent landmarks that contradict it):`,
  ];
  if (enrichment.places.length) {
    lines.push(
      `Real attractions near the destination (prefer these actual names; it's fine to also suggest well-known places not listed):`,
      ...enrichment.places.slice(0, 12).map((p) => `  - ${p.name}`)
    );
  }
  if (enrichment.weather.length) {
    lines.push(
      `Weather forecast for the trip dates (plan around it — e.g. indoor options on wet days):`,
      ...enrichment.weather.map(
        (d) => `  - ${d.date}: ${d.condition}, ${d.tempMinC}-${d.tempMaxC}°C, rain chance ${d.precipitationProbPct ?? "?"}%`
      )
    );
  }
  lines.push(
    ``,
    `Still write your own descriptions and cost estimates for each activity — those remain your estimates, not verified facts. Do not claim prices, opening hours, or availability are current or verified.`
  );
  return lines.join("\n");
};

const ITINERARY_SYSTEM_PROMPT =
  "You are TripMate AI, an expert travel planner. You produce realistic, " +
  "practical day-by-day itineraries as structured JSON. Use real, well-known " +
  "places that actually exist at the destination and genuine, realistic price " +
  "estimates based on typical current market rates for that region — never " +
  "invent fictional attractions or unrealistically low/high costs. Prices are " +
  "rough estimates, not quotes. When VERIFIED REAL DATA is provided, ground " +
  "your plan on it rather than inventing attractions or weather.";

/**
 * Tolerant JSON parser: parses as much valid JSON as possible from a possibly
 * truncated string and returns the partial value. This lets us surface a day
 * that is still being streamed (so its text fills in live). Trailing
 * incomplete tokens are handled by type:
 *   • unterminated string  → the partial text streamed so far is kept
 *   • partial object/array → kept with whatever members completed
 *   • truncated number / literal (true/false/null) → dropped (avoids showing a
 *     misleading half-number like ₹3 before it finishes as ₹360)
 *   • a key with no value yet → that pair is dropped
 *
 * Returns `{ value, usable }`; `usable` is false when nothing meaningful could
 * be parsed (so callers can skip emitting an empty partial).
 */
const parsePartialJson = (text) => {
  let i = 0;
  const n = text.length;
  const isWs = (c) => c === " " || c === "\t" || c === "\n" || c === "\r";
  const skipWs = () => {
    while (i < n && isWs(text[i])) i++;
  };

  // Each parser returns { value, complete, usable }.
  const parseString = () => {
    i++; // opening quote
    let out = "";
    while (i < n) {
      const ch = text[i++];
      if (ch === "\\") {
        if (i >= n) return { value: out, complete: false, usable: true };
        const esc = text[i++];
        const map = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
        if (esc === "u") {
          if (i + 4 > n) return { value: out, complete: false, usable: true };
          out += String.fromCharCode(parseInt(text.slice(i, i + 4), 16));
          i += 4;
        } else {
          out += map[esc] ?? esc;
        }
      } else if (ch === '"') {
        return { value: out, complete: true, usable: true };
      } else {
        out += ch;
      }
    }
    return { value: out, complete: false, usable: true };
  };

  const parseNumber = () => {
    const start = i;
    while (i < n && /[-+0-9.eE]/.test(text[i])) i++;
    // If we consumed to the very end, the number may still be growing → drop it.
    if (i >= n) return { value: undefined, complete: false, usable: false };
    const num = Number(text.slice(start, i));
    return Number.isFinite(num)
      ? { value: num, complete: true, usable: true }
      : { value: undefined, complete: false, usable: false };
  };

  const parseLiteral = () => {
    for (const [word, val] of [["true", true], ["false", false], ["null", null]]) {
      if (text.startsWith(word, i)) {
        i += word.length;
        return { value: val, complete: true, usable: true };
      }
    }
    // Partial literal at end of stream → drop.
    i = n;
    return { value: undefined, complete: false, usable: false };
  };

  const parseValue = () => {
    skipWs();
    if (i >= n) return { value: undefined, complete: false, usable: false };
    const ch = text[i];
    if (ch === '"') return parseString();
    if (ch === "{") return parseObject();
    if (ch === "[") return parseArray();
    if (ch === "-" || (ch >= "0" && ch <= "9")) return parseNumber();
    return parseLiteral();
  };

  function parseObject() {
    i++; // '{'
    const obj = {};
    while (true) {
      skipWs();
      if (i >= n) return { value: obj, complete: false, usable: true };
      if (text[i] === "}") {
        i++;
        return { value: obj, complete: true, usable: true };
      }
      if (text[i] !== '"') return { value: obj, complete: false, usable: true };
      const key = parseString();
      if (!key.complete) return { value: obj, complete: false, usable: true }; // key cut off
      skipWs();
      if (i >= n || text[i] !== ":") return { value: obj, complete: false, usable: true };
      i++; // ':'
      const val = parseValue();
      if (val.usable) obj[key.value] = val.value;
      if (!val.complete) return { value: obj, complete: false, usable: true };
      skipWs();
      if (i < n && text[i] === ",") {
        i++;
        continue;
      }
      if (i < n && text[i] === "}") {
        i++;
        return { value: obj, complete: true, usable: true };
      }
      return { value: obj, complete: false, usable: true };
    }
  }

  function parseArray() {
    i++; // '['
    const arr = [];
    while (true) {
      skipWs();
      if (i >= n) return { value: arr, complete: false, usable: true };
      if (text[i] === "]") {
        i++;
        return { value: arr, complete: true, usable: true };
      }
      const val = parseValue();
      if (val.usable) arr.push(val.value);
      if (!val.complete) return { value: arr, complete: false, usable: true };
      skipWs();
      if (i < n && text[i] === ",") {
        i++;
        continue;
      }
      if (i < n && text[i] === "]") {
        i++;
        return { value: arr, complete: true, usable: true };
      }
      return { value: arr, complete: false, usable: true };
    }
  }

  const result = parseValue();
  return { value: result.value, usable: result.usable };
};

/**
 * Scan a partial JSON stream of shape `{"days":[ {...}, {...}, ... ]}`,
 * returning the fully-completed day objects plus the start offset of the day
 * still being written (if any).
 *
 * @param {string} text
 * @returns {{ completed: object[], partialStart: number|null }}
 */
const scanDays = (text) => {
  const daysKey = text.indexOf('"days"');
  if (daysKey === -1) return { completed: [], partialStart: null };
  const arrStart = text.indexOf("[", daysKey);
  if (arrStart === -1) return { completed: [], partialStart: null };

  const completed = [];
  let depth = 0;
  let objStart = -1;
  let inStr = false;
  let esc = false;

  for (let i = arrStart + 1; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
    } else if (ch === "{") {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && objStart !== -1) {
        try {
          completed.push(JSON.parse(text.slice(objStart, i + 1)));
        } catch {
          /* ignore */
        }
        objStart = -1;
      }
    } else if (ch === "]" && depth === 0) {
      return { completed, partialStart: null }; // array closed, nothing pending
    }
  }
  // If an object is still open, its start marks the in-progress day.
  return { completed, partialStart: depth > 0 ? objStart : null };
};

// Shape a raw LLM day (summary/morning/…) into a renderable day with an
// assigned number, date, and JS-computed cost. Used for both streamed
// previews and the final (validated) result.
const shapeDay = (d, index, trip) => ({
  dayNumber: index + 1,
  date: addDays(trip.startDate, index),
  summary: d.summary,
  morning: d.morning,
  afternoon: d.afternoon,
  evening: d.evening,
  food: d.food || [],
  transportation: d.transportation || "",
  accommodation: Array.isArray(d.accommodation) ? d.accommodation : [],
  tips: d.tips || [],
  estimatedDayCost: sumDayCost(d),
});

// Validate the raw LLM output and assemble the final persistable object.
// Totals and dates are computed/assigned in JS — the model's arithmetic and
// calendar are never trusted.
const finalizeItinerary = (trip, numDays, totalTripDays, { data, model, usage, enrichment }) => {
  const parsed = llmItinerarySchema.safeParse(data);
  if (!parsed.success) {
    throw new LlmError("The AI returned an itinerary that failed validation.", {
      statusCode: 502,
      code: "itinerary_validation_failed",
    });
  }

  const srcDays = parsed.data.days.slice(0, numDays);
  if (srcDays.length === 0) {
    throw new LlmError("The AI returned an empty itinerary.", {
      statusCode: 502,
      code: "empty_itinerary",
    });
  }

  const days = srcDays.map((d, i) => shapeDay(d, i, trip));

  const estimatedTotalCost = round2(
    days.reduce((s, d) => s + d.estimatedDayCost, 0)
  );

  // Defensive date check: dates must fall within the trip window.
  const firstDate = days[0].date;
  const lastDate = days[days.length - 1].date;
  if (
    firstDate.getTime() !== atUtcMidnight(trip.startDate).getTime() ||
    lastDate.getTime() > atUtcMidnight(trip.endDate).getTime()
  ) {
    throw new LlmError("Generated itinerary dates do not match the trip.", {
      statusCode: 500,
      code: "date_mismatch",
    });
  }

  const notes =
    numDays < totalTripDays
      ? `This plan covers the first ${numDays} of ${totalTripDays} days of your trip.`
      : "";

  return {
    days,
    estimatedTotalCost,
    currency: trip.currency || "INR",
    model,
    disclaimer: DISCLAIMER,
    notes,
    // Non-null when the realistic plan exceeds the user's set budget.
    budgetAdvisory: buildBudgetAdvisory(trip, estimatedTotalCost),
    enrichment, // verified API data (coordinates/places/weather) — persisted
    usage, // returned for the API meta; not persisted
  };
};

// Resolve the day count for a trip, throwing on invalid dates. Shared by the
// blocking and streaming generators.
const resolveNumDays = (trip) => {
  const totalTripDays = tripDayCount(trip);
  if (totalTripDays < 1) {
    throw new LlmError("Trip dates are invalid.", {
      statusCode: 400,
      code: "invalid_trip_dates",
    });
  }
  return { totalTripDays, numDays: Math.min(totalTripDays, llmConfig.itinerary.maxDays) };
};

/**
 * Generate and validate an itinerary for a trip. Returns a plain object ready
 * to persist (not yet saved). Totals and dates are computed/assigned in JS —
 * the LLM's arithmetic and calendar are never trusted. Grounds generation on
 * verified API data (places + weather) when available.
 */
export const generateItineraryForTrip = async (trip, { instructions } = {}) => {
  const { totalTripDays, numDays } = resolveNumDays(trip);

  // Fetch verified data first (best-effort); feed it into the prompt.
  const enrichment = await gatherEnrichment(trip, numDays);

  const { data, model, usage } = await generateStructured({
    system: ITINERARY_SYSTEM_PROMPT,
    userMessage:
      buildPrompt(trip, numDays, instructions) + buildEnrichmentBlock(enrichment),
    schema: buildLlmSchema(),
  });

  return finalizeItinerary(trip, numDays, totalTripDays, { data, model, usage, enrichment });
};

/**
 * Streaming itinerary generation. Behaves like generateItineraryForTrip but
 * emits progress as the model produces it:
 *   • onMeta({ currency, numDays, disclaimer }) once, before any days
 *   • onDay(day, index, complete) repeatedly — fired both while a day's text is
 *     still filling in (complete=false) and once it's fully parsed
 *     (complete=true), keyed by day index so the client can update in place.
 * The fully-validated, persistable object is returned on completion. Streamed
 * days are best-effort (unvalidated); the returned result is authoritative.
 *
 * @param {object} trip
 * @param {object} handlers
 * @param {(meta:object)=>void} [handlers.onMeta]
 * @param {(day:object, index:number, complete:boolean)=>void} [handlers.onDay]
 */
export const generateItineraryForTripStream = async (
  trip,
  { instructions, onMeta, onDay } = {}
) => {
  const { totalTripDays, numDays } = resolveNumDays(trip);

  const enrichment = await gatherEnrichment(trip, numDays);

  onMeta?.({
    currency: trip.currency || "INR",
    numDays,
    disclaimer: DISCLAIMER,
  });

  let completedEmitted = 0;
  const emit = (rawDay, index, complete) => {
    try {
      onDay(shapeDay(rawDay, index, trip), index, complete);
    } catch {
      /* skip a malformed preview day; the final result is validated */
    }
  };

  const { data, model, usage } = await generateStructuredStream({
    system: ITINERARY_SYSTEM_PROMPT,
    userMessage:
      buildPrompt(trip, numDays, instructions) + buildEnrichmentBlock(enrichment),
    schema: buildLlmSchema(),
    onDelta: (_delta, accumulated) => {
      if (!onDay) return;
      const { completed, partialStart } = scanDays(accumulated);

      // Emit newly-finished days as final updates.
      for (let i = completedEmitted; i < completed.length && i < numDays; i++) {
        emit(completed[i], i, true);
      }
      completedEmitted = Math.min(completed.length, numDays);

      // Emit the day still being written so its text fills in live.
      if (partialStart != null && completed.length < numDays) {
        const { value, usable } = parsePartialJson(accumulated.slice(partialStart));
        if (usable && value && typeof value === "object") {
          emit(value, completed.length, false);
        }
      }
    },
  });

  return finalizeItinerary(trip, numDays, totalTripDays, { data, model, usage, enrichment });
};

/* ---------- Single-day regeneration ---------- */
const buildDayPrompt = (trip, dayNumber, date, avoidNames) => {
  const interests = trip.interests?.length
    ? trip.interests.join(", ")
    : "general sightseeing";
  const totalBudget = partyTotalBudget(trip);
  const perDayBudget = totalBudget
    ? round2(totalBudget / Math.max(1, tripDayCount(trip)))
    : null;
  const totalDays = tripDayCount(trip);
  const isFirstDay = dayNumber === 1;
  const isLastDay = dayNumber === totalDays;
  return [
    `Plan a single day (day ${dayNumber}, ${date}) of a trip to ${trip.destination}.`,
    `Travellers: ${trip.travellers}. Interests: ${interests}.`,
    `Travel style: ${trip.travelStyle} · Pace: ${trip.travelPace}.`,
    trip.origin && isFirstDay
      ? `This is Day 1: the traveller starts from ${trip.origin}, so begin with ` +
        `the journey from ${trip.origin} to ${trip.destination}` +
        (trip.stopover ? ` (via ${trip.stopover})` : "") +
        ` (suggest transport, approx. travel time and cost, and check-in) and ` +
        `only schedule local activities for the time left after arrival.`
      : null,
    `PUBLIC TRANSPORT SPECIFICS: When recommending a public transport service, ` +
      `name the exact service — bus operator + route/service number(s) (e.g. ` +
      `"KSRTC bus no. 9/9A"), or train number + name (e.g. "Train 12627 ` +
      `Karnataka Express") — in both the activity description and the ` +
      `transportation field. Do not invent precise-looking but fake numbers; ` +
      `if unsure, say to check the latest operator schedule.`,
    isLastDay && !isFirstDay
      ? null
      : `ACCOMMODATION: Fill "accommodation" with 2-3 DIFFERENT specific, real ` +
        `places to stay that night (give a choice across price points) — each ` +
        `with name, area/neighbourhood, type (hotel/guesthouse/hostel/resort/` +
        `homestay) and an approximate per-night price for the party in ` +
        `${trip.currency}, matching the travel style and budget. If unsure a ` +
        `named property exists, suggest a specific area and type instead of a ` +
        `fake name.`,
    trip.origin && isLastDay && !isFirstDay
      ? `This is the final day: include the return journey back to ${trip.origin} ` +
        `(transport, approx. time and cost) in the evening/last slot.`
      : null,
    avoidNames?.length
      ? `Suggest DIFFERENT places from these already planned: ${avoidNames.join(", ")}.`
      : null,
    ``,
    `Provide: a short summary; a morning, afternoon and evening activity (each`,
    `with a place name, short description, suggested duration in minutes, and an`,
    `estimated cost); food recommendations; a transportation suggestion; and 1-3`,
    `tips. All costs in ${trip.currency}, approximate totals for the party of`,
    `${trip.travellers}, and >= 0 (0 for free).`,
    perDayBudget
      ? `BUDGET CONSTRAINT (strict): the sum of this day's estimatedCost values ` +
        `(all three activities plus all food) MUST NOT exceed ${perDayBudget} ${trip.currency} ` +
        `for the whole party — prefer free/low-cost options to stay within it.`
      : null,
    `Do not include a date or day number.`,
  ]
    .filter(Boolean)
    .join("\n");
};

/**
 * Regenerate a single day's content for a trip. Returns a normalised day object
 * (summary/morning/afternoon/evening/food/transportation/tips) — the caller is
 * responsible for keeping the existing dayNumber/date and recomputing totals.
 *
 * @param {object} trip
 * @param {number} dayNumber
 * @param {Date|string} date
 * @param {string[]} [avoidNames] - attraction names already used on other days
 */
export const generateDayForTrip = async (trip, dayNumber, date, avoidNames = []) => {
  const isoDate = atUtcMidnight(date).toISOString().slice(0, 10);

  const { data } = await generateStructured({
    system:
      "You are TripMate AI, an expert travel planner producing one realistic " +
      "day of a trip as structured JSON. Prices are rough estimates.",
    userMessage: buildDayPrompt(trip, dayNumber, isoDate, avoidNames),
    schema: dayItemJson,
    maxTokens: Math.min(2048, llmConfig.itinerary.maxOutputTokens),
  });

  const parsed = llmDaySchema.safeParse(data);
  if (!parsed.success) {
    throw new LlmError("The AI returned a day that failed validation.", {
      statusCode: 502,
      code: "day_validation_failed",
    });
  }

  const d = parsed.data;
  return {
    summary: d.summary,
    morning: d.morning,
    afternoon: d.afternoon,
    evening: d.evening,
    food: d.food,
    transportation: d.transportation,
    accommodation: Array.isArray(d.accommodation) ? d.accommodation : [],
    tips: d.tips,
  };
};
