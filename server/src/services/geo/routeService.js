import { providerConfig } from "../../config/providers.js";
import { fetchJson, cacheGet, cacheSet, ProviderError } from "./geoHttp.js";

/**
 * routeService — estimate routes (distance / duration / geometry) between
 * waypoints. Default provider: OSRM. Provider-switchable via env.
 */
const cfg = providerConfig.routing;

const PROFILES = { driving: "driving", walking: "walking", cycling: "cycling" };

const isCoord = (c) =>
  c &&
  Number.isFinite(c.lat) &&
  Number.isFinite(c.lon) &&
  c.lat >= -90 &&
  c.lat <= 90 &&
  c.lon >= -180 &&
  c.lon <= 180;

/**
 * Estimate a route through 2+ waypoints.
 * @param {object} opts
 * @param {Array<{lat,lon}>} opts.waypoints  - ordered coordinates (>= 2)
 * @param {string} [opts.profile]            - driving | walking | cycling
 * @param {boolean} [opts.geometry]          - include route geometry
 * @returns {Promise<{source, provider, profile, distanceMeters, durationSeconds, legs, geometry?}>}
 */
export const estimateRoute = async ({ waypoints, profile = "driving", geometry = false } = {}) => {
  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    throw new ProviderError("At least two waypoints are required.", {
      statusCode: 400,
      code: "invalid_waypoints",
    });
  }
  if (!waypoints.every(isCoord)) {
    throw new ProviderError("Each waypoint needs valid { lat, lon }.", {
      statusCode: 400,
      code: "invalid_waypoints",
    });
  }
  const prof = PROFILES[profile] || "driving";

  if (cfg.provider !== "osrm") {
    throw new ProviderError(`Unsupported routing provider "${cfg.provider}".`, {
      statusCode: 503,
      code: "provider_unconfigured",
    });
  }

  const coordStr = waypoints.map((w) => `${w.lon},${w.lat}`).join(";");
  const cacheKey = `route:${prof}:${geometry ? "g" : "n"}:${coordStr}`;
  const cached = cacheGet(cacheKey);
  if (cached) return { source: "cache", provider: cfg.provider, ...cached };

  const url =
    `${cfg.baseUrl}/route/v1/${prof}/${coordStr}` +
    `?overview=${geometry ? "full" : "false"}&geometries=geojson&annotations=false`;
  const data = await fetchJson(url, { label: "OSRM" });

  if (data.code !== "Ok" || !data.routes?.length) {
    throw new ProviderError(`No route found (${data.code || "unknown"}).`, {
      statusCode: 404,
      code: "no_route",
    });
  }
  const route = data.routes[0];
  const payload = {
    profile: prof,
    distanceMeters: Math.round(route.distance),
    durationSeconds: Math.round(route.duration),
    legs: (route.legs || []).map((l) => ({
      distanceMeters: Math.round(l.distance),
      durationSeconds: Math.round(l.duration),
    })),
    ...(geometry ? { geometry: route.geometry } : {}),
  };
  cacheSet(cacheKey, payload);
  return { source: "api", provider: cfg.provider, ...payload };
};

export default { estimateRoute };
