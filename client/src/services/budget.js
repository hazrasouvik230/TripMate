import api from "./api";

/**
 * Budget service — all amounts are computed server-side (deterministic JS).
 */
export const getBudget = (tripId, display) =>
  api.get(`/trips/${tripId}/budget`, { params: display ? { display } : {} });

export const addBudgetItem = (tripId, item) =>
  api.post(`/trips/${tripId}/budget/items`, item);

export const updateBudgetItem = (tripId, itemId, patch) =>
  api.patch(`/trips/${tripId}/budget/items/${itemId}`, patch);

export const deleteBudgetItem = (tripId, itemId) =>
  api.delete(`/trips/${tripId}/budget/items/${itemId}`);

export const BUDGET_CATEGORIES = [
  { key: "accommodation", label: "Accommodation" },
  { key: "food", label: "Food" },
  { key: "transportation", label: "Transportation" },
  { key: "activities", label: "Attractions & Activities" },
  { key: "shopping", label: "Shopping" },
  { key: "misc", label: "Miscellaneous" },
];
