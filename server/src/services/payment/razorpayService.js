/**
 * Minimal Razorpay integration using the REST API + Node's crypto, so no extra
 * npm dependency is needed. Two responsibilities:
 *   • createOrder — open a server-side order the browser checkout attaches to.
 *   • verifySignature — confirm a completed payment really came from Razorpay
 *     (HMAC-SHA256 of "order_id|payment_id" with the key secret).
 *
 * The key SECRET never leaves the server. All amounts are in the smallest
 * currency unit (paise for INR), per Razorpay's API.
 */
import crypto from "crypto";
import { paymentConfig } from "../../config/payment.js";

const RAZORPAY_API = "https://api.razorpay.com/v1";

export class PaymentError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = "PaymentError";
    this.statusCode = statusCode;
  }
}

/**
 * Create a Razorpay order.
 * @param {object} p
 * @param {number} p.amount - amount in the smallest currency unit (e.g. paise)
 * @param {string} p.currency - ISO currency code (e.g. "INR")
 * @param {string} [p.receipt] - your own reference id (<= 40 chars)
 * @param {object} [p.notes] - arbitrary key/value metadata echoed back by Razorpay
 * @returns {Promise<object>} the created order (contains `id`, `amount`, …)
 */
export const createOrder = async ({ amount, currency, receipt, notes }) => {
  const { keyId, keySecret } = paymentConfig.razorpay;
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  let res;
  try {
    res = await fetch(`${RAZORPAY_API}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        amount,
        currency,
        receipt,
        notes,
        payment_capture: 1, // auto-capture on success
      }),
    });
  } catch {
    throw new PaymentError("Could not reach the payment gateway. Please try again.", 502);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new PaymentError(
      data?.error?.description || "Failed to create a payment order.",
      502
    );
  }
  return data;
};

/**
 * Verify a Razorpay payment signature.
 * @returns {boolean} true iff the signature is authentic.
 */
export const verifySignature = ({ orderId, paymentId, signature }) => {
  const { keySecret } = paymentConfig.razorpay;
  if (!keySecret || !orderId || !paymentId || !signature) return false;

  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(signature), "utf8");
  // Length check guards timingSafeEqual (which throws on length mismatch).
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
