import api from "./api";

/**
 * Trip API service — thin wrappers over the authenticated /trips endpoints.
 * The axios response interceptor already unwraps `response.data`, so each
 * call resolves to the backend's JSON body (e.g. { success, trip } / { trips }).
 */

export const getTrips = (params = {}) => api.get("/trips", { params });

export const getTrip = (tripId) => api.get(`/trips/${tripId}`);

export const createTrip = (payload) => api.post("/trips", payload);

export const updateTrip = (tripId, payload) =>
  api.patch(`/trips/${tripId}`, payload);

export const deleteTrip = (tripId) => api.delete(`/trips/${tripId}`);
