/**
 * TripMate AI — MCP server (official @modelcontextprotocol/sdk).
 *
 * Exposes validated, read-only MCP tools that REUSE the existing backend
 * services (places, weather, vector search, trip/itinerary models, budget and
 * packing services). It is completely separate from the Express app and is not
 * required for normal frontend functionality.
 *
 * Transport: stdio (default). Auth: a single user is resolved at startup from
 * env (a JWT, or email+password) and ALL private-trip tools are scoped to that
 * user's id, so one user can never read another user's trips.
 *
 * Run (from server/):  npm run mcp
 */

// stdio transport uses stdout for the JSON-RPC protocol — route ALL logging to
// stderr so service console.log calls (e.g. the DB connect banner) can't corrupt it.
// eslint-disable-next-line no-console
console.log = (...args: unknown[]) => console.error(...args);

import "dotenv/config";
import mongoose from "mongoose";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import connectDB from "../src/config/db.js";
import { verifyToken } from "../src/utils/token.js";
import User from "../src/models/User.js";
import Trip from "../src/models/Trip.js";
import Itinerary from "../src/models/Itinerary.js";
import { searchPlaces, getPlaceDetails, geocode } from "../src/services/geo/placesService.js";
import { getForecast } from "../src/services/geo/weatherService.js";
import { searchKnowledge } from "../src/services/search/vectorSearchService.js";
import { calculateBudget } from "../src/services/trip/budgetService.js";
import { generatePackingList } from "../src/services/trip/packingService.js";

/* ---------- Result helpers (predictable, structured) ---------- */
const ok = (data: Record<string, unknown>) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  structuredContent: data,
});
const fail = (message: string, extra: Record<string, unknown> = {}) => ({
  content: [{ type: "text" as const, text: message }],
  structuredContent: { error: message, ...extra },
  isError: true,
});

/* ---------- Auth: resolve the acting user once at startup ---------- */
let authedUser: any = null;

async function resolveAuthUser() {
  const jwt = process.env.TRIPMATE_JWT;
  const email = process.env.TRIPMATE_EMAIL;
  const password = process.env.TRIPMATE_PASSWORD;
  try {
    if (jwt) {
      const decoded: any = verifyToken(jwt);
      return await User.findById(decoded.id);
    }
    if (email && password) {
      const u: any = await User.findOne({ email: email.toLowerCase() }).select("+passwordHash");
      if (u && (await u.comparePassword(password))) return u;
    }
  } catch {
    /* fall through to null */
  }
  return null;
}

// Returns the acting user, or a fail-result for tools that need private data.
const requireUser = () =>
  authedUser ||
  (() => {
    throw new Error(
      "Authentication required: this tool accesses private trip data. Configure TRIPMATE_JWT (or TRIPMATE_EMAIL + TRIPMATE_PASSWORD) for the MCP server."
    );
  })();

const errorMessage = (e: any) => (e?.message ? String(e.message) : "Unknown error");

/* ---------- Build the MCP server ---------- */
const server = new McpServer({ name: "tripmate-ai", version: "1.0.0" });

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");
const objectId = z.string().refine((v) => mongoose.isValidObjectId(v), "Invalid id");

/* ===== Public tools (no private data) ===== */

server.registerTool(
  "search_attractions",
  {
    title: "Search attractions",
    description:
      "Search for attractions / places by name or keyword, optionally near a destination. Returns names, coordinates, and categories from a live places provider.",
    inputSchema: {
      query: z.string().min(1).max(200).describe("What to search for, e.g. 'museums'"),
      near: z.string().min(1).max(120).optional().describe("Destination to search near, e.g. 'Rome'"),
      limit: z.number().int().min(1).max(20).optional(),
    },
  },
  async ({ query, near, limit }) => {
    try {
      const { source, provider, results } = await searchPlaces({ query, near, limit });
      return ok({ source, provider, count: results.length, results });
    } catch (e) {
      return fail(errorMessage(e));
    }
  }
);

server.registerTool(
  "get_place_details",
  {
    title: "Get place details",
    description: "Retrieve details for a place by its id ('<N|W|R>:<osmId>', from search_attractions).",
    inputSchema: { placeId: z.string().regex(/^[NWR]:\d+$/i, "placeId must be '<N|W|R>:<osmId>'") },
  },
  async ({ placeId }) => {
    try {
      const { source, provider, place } = await getPlaceDetails(placeId);
      return ok({ source, provider, place });
    } catch (e) {
      return fail(errorMessage(e));
    }
  }
);

server.registerTool(
  "search_travel_knowledge",
  {
    title: "Search travel knowledge",
    description:
      "Semantic search over TripMate's curated travel knowledge base (public). Returns the most relevant document chunks with sources and similarity scores.",
    inputSchema: {
      query: z.string().min(1).max(1000),
      destination: z.string().min(1).max(120).optional(),
      category: z.string().min(1).max(60).optional(),
      limit: z.number().int().min(1).max(20).optional(),
    },
  },
  async ({ query, destination, category, limit }) => {
    try {
      const { count, results } = await searchKnowledge({ query, destination, category, limit });
      return ok({ count, results });
    } catch (e) {
      return fail(errorMessage(e));
    }
  }
);

server.registerTool(
  "get_weather_forecast",
  {
    title: "Get weather forecast",
    description:
      "Daily weather forecast by coordinates or a place name. Only returns data within the provider's ~16-day horizon; beyond that it reports no forecast rather than guessing.",
    inputSchema: {
      location: z.string().min(1).max(120).optional().describe("Place name (geocoded) if lat/lon not given"),
      lat: z.number().min(-90).max(90).optional(),
      lon: z.number().min(-180).max(180).optional(),
      startDate: dateStr.optional(),
      endDate: dateStr.optional(),
    },
  },
  async ({ location, lat, lon, startDate, endDate }) => {
    try {
      let coords = Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
      if (!coords) {
        if (!location) return fail("Provide either lat & lon, or a location name.");
        const geo = await geocode(location);
        if (!geo) return fail(`Could not locate "${location}".`);
        coords = geo.coordinates;
      }
      const wx = await getForecast({ lat: coords.lat, lon: coords.lon, startDate, endDate });
      return ok(wx as unknown as Record<string, unknown>);
    } catch (e) {
      return fail(errorMessage(e));
    }
  }
);

/* ===== Private tools (require the authenticated user; ownership enforced) ===== */

async function loadOwnedTrip(tripId: string) {
  const user = requireUser();
  const trip = await Trip.findOne({ _id: tripId, userId: user._id });
  return { user, trip };
}

server.registerTool(
  "get_trip_details",
  {
    title: "Get trip details",
    description: "Get one of the authenticated user's own trips by id. Cannot access other users' trips.",
    inputSchema: { tripId: objectId },
  },
  async ({ tripId }) => {
    try {
      const { trip } = await loadOwnedTrip(tripId);
      if (!trip) return fail("Trip not found.", { code: "not_found" });
      return ok({ trip: trip.toJSON() });
    } catch (e) {
      return fail(errorMessage(e), { code: "auth_required" });
    }
  }
);

server.registerTool(
  "get_itinerary",
  {
    title: "Get itinerary",
    description: "Get the latest saved itinerary for one of the authenticated user's own trips.",
    inputSchema: { tripId: objectId },
  },
  async ({ tripId }) => {
    try {
      const { user, trip } = await loadOwnedTrip(tripId);
      if (!trip) return fail("Trip not found.", { code: "not_found" });
      const itinerary = await Itinerary.findOne({ tripId, userId: user._id }).sort({ version: -1 });
      if (!itinerary) return fail("No itinerary generated for this trip yet.", { code: "no_itinerary" });
      return ok({ itinerary: itinerary.toJSON() });
    } catch (e) {
      return fail(errorMessage(e), { code: "auth_required" });
    }
  }
);

server.registerTool(
  "calculate_trip_budget",
  {
    title: "Calculate trip budget",
    description:
      "Compute a deterministic budget breakdown for the user's own trip (per-day, per-person, user budget vs. the itinerary's AI-estimated cost, and a generic allocation guideline).",
    inputSchema: { tripId: objectId },
  },
  async ({ tripId }) => {
    try {
      const { user, trip } = await loadOwnedTrip(tripId);
      if (!trip) return fail("Trip not found.", { code: "not_found" });
      const itinerary = await Itinerary.findOne({ tripId, userId: user._id }).sort({ version: -1 });
      return ok({ budget: calculateBudget(trip, itinerary) });
    } catch (e) {
      return fail(errorMessage(e), { code: "auth_required" });
    }
  }
);

server.registerTool(
  "create_packing_list",
  {
    title: "Create packing list",
    description:
      "Generate a deterministic packing list for the user's own trip, using the real weather forecast when the dates are within range. Does not modify the trip.",
    inputSchema: { tripId: objectId },
  },
  async ({ tripId }) => {
    try {
      const { trip } = await loadOwnedTrip(tripId);
      if (!trip) return fail("Trip not found.", { code: "not_found" });

      // Best-effort real weather (graceful fallback to no-weather list).
      let weatherDays: any = null;
      try {
        const geo = await geocode(trip.destination);
        if (geo) {
          const wx = await getForecast({
            lat: geo.coordinates.lat,
            lon: geo.coordinates.lon,
            startDate: new Date(trip.startDate).toISOString().slice(0, 10),
            endDate: new Date(trip.endDate).toISOString().slice(0, 10),
          });
          if (wx.inForecastRange) weatherDays = wx.days;
        }
      } catch {
        /* no weather — list falls back gracefully */
      }
      return ok({ packingList: generatePackingList(trip, weatherDays) });
    } catch (e) {
      return fail(errorMessage(e), { code: "auth_required" });
    }
  }
);

/* ---------- Startup ---------- */
async function main() {
  await connectDB();
  if (mongoose.connection.readyState !== 1) {
    console.error("❌ MongoDB not connected — trip tools will be unavailable.");
  }

  authedUser = await resolveAuthUser();
  if (authedUser) {
    console.error(`🔐 MCP authenticated as: ${authedUser.email}`);
  } else {
    console.error(
      "⚠️  No MCP user configured (set TRIPMATE_JWT or TRIPMATE_EMAIL + TRIPMATE_PASSWORD). " +
        "Public tools work; private-trip tools will return an auth error."
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🧭 TripMate MCP server ready on stdio.");
}

main().catch((err) => {
  console.error("Fatal MCP error:", err);
  process.exit(1);
});
