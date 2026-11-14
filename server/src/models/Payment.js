import mongoose from "mongoose";

export const PAYMENT_STATUSES = ["created", "paid", "failed"];

/**
 * A Razorpay payment for unlocking extra AI-itinerary days on a trip.
 * An order row is written as soon as a checkout order is created, then updated
 * to `paid` (with the payment id + signature) once verified, or `failed` if
 * verification doesn't pass. Kept for audit / reconciliation.
 */
const paymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tripId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trip",
      required: true,
      index: true,
    },

    provider: { type: String, default: "razorpay" },
    // What this payment buys; lets us add other paid features later.
    purpose: { type: String, default: "itinerary_extra_days" },

    // Razorpay identifiers.
    orderId: { type: String, required: true, unique: true, index: true },
    paymentId: { type: String, default: "" },
    signature: { type: String, default: "" },
    receipt: { type: String, default: "" },

    // Amount in the smallest currency unit (e.g. paise for INR).
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, trim: true },

    // Number of extra itinerary days this payment unlocks.
    extraDays: { type: Number, required: true, min: 1 },

    status: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: "created",
      index: true,
    },
  },
  { timestamps: true }
);

paymentSchema.set("toJSON", {
  transform(_doc, ret) {
    delete ret.__v;
    // Never expose the signature to clients.
    delete ret.signature;
    return ret;
  },
});

export default mongoose.model("Payment", paymentSchema);
