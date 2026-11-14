/**
 * Payment configuration, read from environment variables.
 *
 * Provider: Razorpay. Credentials stay SERVER-SIDE only — the client never
 * sees the key secret. The publishable Key ID is handed to the browser at
 * checkout time via the order response (not via a client env var), so there is
 * a single source of truth.
 *
 * Pricing: AI itineraries are free for the first `ITINERARY_MAX_DAYS` days of a
 * trip (shared with the generator's free limit). Every day beyond that must be
 * unlocked at `ITINERARY_EXTRA_DAY_PRICE` (major currency units, e.g. INR).
 */

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const paymentConfig = {
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || "",
    keySecret: process.env.RAZORPAY_KEY_SECRET || "",
  },

  // Per-extra-day pricing for AI itinerary generation beyond the free limit.
  itinerary: {
    // Price per extra day in MAJOR currency units (e.g. 5 = ₹5).
    pricePerDay: num(process.env.ITINERARY_EXTRA_DAY_PRICE, 5),
    currency: (process.env.ITINERARY_EXTRA_DAY_CURRENCY || "INR").toUpperCase(),
  },
};

/** Whether Razorpay is configured enough to create/verify payments. */
export const isPaymentConfigured = () =>
  Boolean(paymentConfig.razorpay.keyId && paymentConfig.razorpay.keySecret);
