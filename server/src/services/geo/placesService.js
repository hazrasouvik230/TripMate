import { providerConfig } from "../../config/providers.js";
import { fetchJson, throttle, cacheGet, cacheSet, ProviderError } from "./geoHttp.js";

/**
 * placesService — search attractions and fetch place details.
 * Default provider: Nominatim (OpenStreetMap). Provider-switchable via env.
 *
 * Every result is tagged with `source: "api" | "cache"` and the provider name
 * so callers can distinguish verified live data from cached data.
 */

const cfg = providerConfig.places;

/* ---------- Normalisation (Nominatim) ---------- */
// jsonv2 returns osm_type as "node"/"way"/"relation"; the lookup API wants the
// single-letter prefix N/W/R. Normalise to a composite "<N|W|R>:<id>" id.
const OSM_LETTER = { node: "N", way: "W", relation: "R" };
const compositeId = (r) => {
  const letter = OSM_LETTER[r.osm_type] || (r.osm_type ? r.osm_type[0].toUpperCase() : null);
  return letter && r.osm_id != null ? `${letter}:${r.osm_id}` : null;
};

const normalizeNominatim = (r) => ({
  id: compositeId(r),
  name: r.name || r.display_name?.split(",")[0] || "Unknown",
  displayName: r.display_name,
  category: r.category || r.class || null,
  type: r.type || null,
  coordinates: { lat: Number(r.lat), lon: Number(r.lon) },
  importance: r.importance ?? null,
  address: r.address || null,
});

/* ---------- Public API ---------- */
/**
 * Search for attractions / places.
 * @param {object} opts { query, near?, limit? }
 * @returns {Promise<{source, provider, results: Array}>}
 */
export const searchPlaces = async ({ query, near, limit = 8 } = {}) => {
  if (!query?.trim()) {
    throw new ProviderError("A search query is required.", { statusCode: 400, code: "empty_query" });
  }
  const q = near?.trim() ? `${query.trim()}, ${near.trim()}` : query.trim();
  const lim = Math.min(Math.max(1, limit), 20);

  if (cfg.provider !== "nominatim") {
    throw new ProviderError(`Unsupported places provider "${cfg.provider}".`, {
      statusCode: 503,
      code: "provider_unconfigured",
    });
  }

  const cacheKey = `places:search:${q}:${lim}`;
  const cached = cacheGet(cacheKey);
  if (cached) return { source: "cache", provider: cfg.provider, results: cached };

  await throttle("nominatim", cfg.minIntervalMs);
  const url =
    `${cfg.baseUrl}/search?format=jsonv2&addressdetails=1&extratags=0&namedetails=1` +
    `&limit=${lim}&q=${encodeURIComponent(q)}`;
  const data = await fetchJson(url, { label: "Nominatim" });
  const results = (Array.isArray(data) ? data : []).map(normalizeNominatim);

  cacheSet(cacheKey, results);
  return { source: "api", provider: cfg.provider, results };
};

/**
 * Fetch details for a place by its composite id ("osm_type:osm_id", e.g. "N:123").
 * @returns {Promise<{source, provider, place}>}
 */
export const getPlaceDetails = async (placeId) => {
  if (!placeId || !/^[NWR]:\d+$/i.test(placeId)) {
    throw new ProviderError("Invalid placeId (expected '<N|W|R>:<osmId>').", {
      statusCode: 400,
      code: "invalid_place_id",
    });
  }
  if (cfg.provider !== "nominatim") {
    throw new ProviderError(`Unsupported places provider "${cfg.provider}".`, {
      statusCode: 503,
      code: "provider_unconfigured",
    });
  }

  const cacheKey = `places:details:${placeId}`;
  const cached = cacheGet(cacheKey);
  if (cached) return { source: "cache", provider: cfg.provider, place: cached };

  const [type, id] = placeId.split(":");
  await throttle("nominatim", cfg.minIntervalMs);
  const url =
    `${cfg.baseUrl}/lookup?format=jsonv2&addressdetails=1&namedetails=1&extratags=1` +
    `&osm_ids=${type.toUpperCase()}${id}`;
  const data = await fetchJson(url, { label: "Nominatim" });
  const first = Array.isArray(data) ? data[0] : null;
  if (!first) {
    throw new ProviderError("Place not found.", { statusCode: 404, code: "place_not_found" });
  }
  const place = {
    ...normalizeNominatim(first),
    extratags: first.extratags || {},
    boundingbox: first.boundingbox || null,
  };
  cacheSet(cacheKey, place);
  return { source: "api", provider: cfg.provider, place };
};

/**
 * Geocode a free-text location to coordinates (first match). Used by itinerary
 * enrichment. Returns null if nothing is found.
 */
export const geocode = async (location) => {
  const { results } = await searchPlaces({ query: location, limit: 1 });
  if (!results.length) return null;
  const r = results[0];
  return { name: r.name, displayName: r.displayName, coordinates: r.coordinates };
};

export default { searchPlaces, getPlaceDetails, geocode };
