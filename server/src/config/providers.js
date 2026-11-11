/**
 * External provider configuration (places, routing, weather).
 *
 * Keys and base URLs live here, server-side only. Providers are selectable via
 * env so a keyed provider can replace a keyless default without code changes.
 * Defaults are keyless, terms-friendly services so the app works out of the box.
 */
const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export const providerConfig = {
  // Identifiable User-Agent required by Nominatim's usage policy. Set a real
  // contact in production via GEO_USER_AGENT. (Nominatim rejects placeholder
  // agents such as any containing "example.com" with HTTP 403.)
  userAgent: process.env.GEO_USER_AGENT || "TripMateAI/1.0 (tripmate-ai app)",

  places: {
    provider: process.env.PLACES_PROVIDER || "nominatim",
    baseUrl: process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org",
    apiKey: process.env.PLACES_API_KEY || "", // unused by nominatim; for keyed providers
    // Nominatim asks for <= 1 request/second.
    minIntervalMs: num(process.env.PLACES_MIN_INTERVAL_MS, 1100),
  },

  routing: {
    provider: process.env.ROUTE_PROVIDER || "osrm",
    baseUrl: process.env.OSRM_URL || "https://router.project-osrm.org",
    apiKey: process.env.ROUTE_API_KEY || "",
  },

  weather: {
    provider: process.env.WEATHER_PROVIDER || "open-meteo",
    baseUrl: process.env.OPEN_METEO_URL || "https://api.open-meteo.com",
    apiKey: process.env.WEATHER_API_KEY || "",
  },

  // Currency exchange rates (optional display conversion). Default: Frankfurter
  // (European Central Bank reference rates, keyless). Covers major currencies;
  // unsupported ones are handled gracefully (conversion omitted).
  fx: {
    provider: process.env.FX_PROVIDER || "frankfurter",
    baseUrl: process.env.FX_URL || "https://api.frankfurter.app",
    apiKey: process.env.FX_API_KEY || "",
    cacheTtlMs: num(process.env.FX_CACHE_TTL_MS, 60 * 60 * 1000), // 1 hour
  },

  // Shared transport + cache settings.
  timeoutMs: num(process.env.GEO_TIMEOUT_MS, 12_000),
  // Ephemeral in-memory cache only — provider data is NOT persisted to the DB,
  // respecting OSM/Nominatim data-storage restrictions.
  cacheTtlMs: num(process.env.GEO_CACHE_TTL_MS, 10 * 60 * 1000), // 10 min
  // Per-user request frequency for the geo endpoints.
  rateLimit: {
    windowMs: num(process.env.GEO_RATE_WINDOW_MS, 60_000),
    max: num(process.env.GEO_RATE_MAX, 30),
  },
};

export default providerConfig;
