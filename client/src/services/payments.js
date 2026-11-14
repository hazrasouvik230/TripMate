import api from "./api";

/**
 * Payments service — unlock extra AI-itinerary days via Razorpay.
 *
 * The free plan covers the first N days of a trip; beyond that, each extra day
 * costs a small fee. The server owns all pricing and verifies every payment —
 * the browser only drives the Razorpay checkout popup.
 */

/** Quote: how many days are free/unlocked/locked and what unlocking costs. */
export const getItineraryQuote = (tripId) =>
  api.get(`/payments/itinerary/${tripId}/quote`);

/** Create a Razorpay order for all remaining locked days of a trip. */
export const createItineraryOrder = (tripId) =>
  api.post(`/payments/itinerary/order`, { tripId });

/** Verify a completed payment so the server unlocks the paid-for days. */
export const verifyItineraryPayment = (payload) =>
  api.post(`/payments/itinerary/verify`, payload);

/** Mark a pending order as failed (payment failed or abandoned). */
export const markItineraryPaymentFailed = (payload) =>
  api.post(`/payments/itinerary/failed`, payload);

/* ---------- Razorpay checkout script loader ---------- */
let scriptPromise = null;

/** Inject Razorpay's checkout.js once; resolves true when it's available. */
export const loadRazorpay = () => {
  if (typeof window !== "undefined" && window.Razorpay) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      scriptPromise = null; // allow a retry on the next attempt
      resolve(false);
    };
    document.body.appendChild(script);
  });
  return scriptPromise;
};

/**
 * Full unlock flow: create an order, open Razorpay checkout, then verify the
 * payment. Resolves with the verify result ({ extraDays, unlockedItineraryDays })
 * on success, or rejects (including when the user dismisses the popup).
 *
 * @param {string} tripId
 * @param {object} [opts]
 * @param {string} [opts.name]  - prefill the payer's name
 * @param {string} [opts.email] - prefill the payer's email
 */
export const unlockItineraryDays = async (tripId, { name, email } = {}) => {
  const loaded = await loadRazorpay();
  if (!loaded) {
    throw new Error(
      "Couldn't load the payment gateway. Check your connection and try again."
    );
  }

  const { order } = await createItineraryOrder(tripId);

  return new Promise((resolve, reject) => {
    // Razorpay fires `ondismiss` whenever the modal closes — including right
    // after a SUCCESSFUL payment, once the handler has run. This flag makes
    // sure a success (or failure) that's already being processed is never
    // mistaken for a user cancellation, which would otherwise reject the
    // promise mid-verify and skip the post-payment refresh.
    let settled = false;

    const rzp = new window.Razorpay({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      name: "TripMate AI",
      description: `Unlock ${order.extraDays} extra itinerary day${
        order.extraDays === 1 ? "" : "s"
      }`,
      order_id: order.orderId,
      prefill: {
        ...(name ? { name } : {}),
        ...(email ? { email } : {}),
      },
      theme: { color: "#4f46e5" },
      handler: async (response) => {
        settled = true;
        try {
          const result = await verifyItineraryPayment({
            orderId: response.razorpay_order_id,
            paymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          });
          resolve(result);
        } catch (err) {
          reject(err);
        }
      },
      modal: {
        ondismiss: () => {
          // Only a genuine cancellation (no payment underway) rejects here.
          if (!settled) reject(new Error("Payment cancelled"));
        },
      },
    });

    rzp.on("payment.failed", (response) => {
      settled = true;
      // Tell the server so the order record moves from `created` → `failed`
      // instead of staying stuck as a pending order. Fire-and-forget: the
      // user-facing outcome is the rejection below regardless.
      const meta = response?.error?.metadata || {};
      markItineraryPaymentFailed({
        orderId: meta.order_id || order.orderId,
        ...(meta.payment_id ? { paymentId: meta.payment_id } : {}),
      }).catch(() => {});
      reject(new Error(response?.error?.description || "Payment failed. Please try again."));
    });

    rzp.open();
  });
};
