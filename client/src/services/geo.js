import api from "./api";

/**
 * Geo service — places, routes, weather. All calls hit our backend, which
 * holds any provider keys; the browser never talks to providers directly.
 */
export const searchPlaces = (q, near, limit = 8) =>
  api.get("/places/search", { params: { q, near, limit } });

export const placeDetails = (placeId) =>
  api.get("/places/details", { params: { placeId } });

export const estimateRoute = (waypoints, profile = "walking", geometry = true) =>
  api.post("/routes/estimate", { waypoints, profile, geometry });

export const weatherForecast = (lat, lon, startDate, endDate) =>
  api.get("/weather/forecast", { params: { lat, lon, startDate, endDate } });
