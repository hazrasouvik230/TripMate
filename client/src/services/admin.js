import api from "./api";

/**
 * Admin API service — platform-wide analytics + transactions, for the admin
 * dashboard. All endpoints require an admin session (enforced server-side);
 * a non-admin gets a 403.
 *
 * The axios response interceptor already unwraps `response.data`, so each call
 * resolves to the backend's JSON body.
 */

/** Dashboard overview: totals, payment status, revenue, top users, trips. */
export const getAnalytics = () => api.get("/admin/analytics");

/**
 * Paginated platform transactions.
 * @param {object} [params] - { status, search, page, limit, sort }
 */
export const getTransactions = (params = {}) =>
  api.get("/admin/transactions", { params });
