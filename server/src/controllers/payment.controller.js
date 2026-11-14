import Trip from "../models/Trip.js";
import Payment from "../models/Payment.js";
import { paymentConfig, isPaymentConfigured } from "../config/payment.js";
import { llmConfig } from "../config/llm.js";
import { tripDayCount } from "../services/llm/itineraryGenerator.js";
import { createOrder, verifySignature } from "../services/payment/razorpayService.js";

/**
 * Work out how many itinerary days a trip has, how many are free/unlocked, and
 * how many still need paying for. Single source of truth for the quote + order
 * endpoints so the browser can never dictate the price.
 */
const computeDayBreakdown = (trip) => {
  const totalDays = tripDayCount(trip);
  const freeDays = llmConfig.itinerary.maxDays;
  const unlockedDays = Math.max(0, Math.floor(trip.unlockedItineraryDays || 0));
  const coveredDays = Math.min(totalDays, freeDays + unlockedDays);
  const lockedDays = Math.max(0, totalDays - coveredDays);
  const { pricePerDay, currency } = paymentConfig.itinerary;
  return {
    totalDays,
    freeDays,
    unlockedDays,
    coveredDays,
    lockedDays,
    pricePerDay,
    currency,
    amount: lockedDays * pricePerDay, // major units (e.g. ₹)
  };
};

/* ------------------------------------------------------------------ */
/*  GET  /api/v1/payments/itinerary/:tripId/quote                     */
/* ------------------------------------------------------------------ */
/**
 * Returns the unlock quote for a trip's AI itinerary: how many days are
 * covered for free / already unlocked, how many are still locked, and what it
 * would cost to unlock them. Drives the "unlock extra days" prompt in the UI.
 */
export const getItineraryQuote = async (req, res, next) => {
  try {
    const trip = await Trip.findOne({
      _id: req.params.tripId,
      userId: req.user._id,
    });
    if (!trip) {
      return res.status(404).json({ success: false, message: "Trip not found" });
    }

    res.status(200).json({
      success: true,
      quote: {
        ...computeDayBreakdown(trip),
        paymentConfigured: isPaymentConfigured(),
      },
    });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/*  POST  /api/v1/payments/itinerary/order                            */
/* ------------------------------------------------------------------ */
/**
 * Create a Razorpay order to unlock all remaining (locked) itinerary days for
 * a trip. Amount is computed server-side from the trip length and the
 * per-day price; the client only supplies the trip id.
 */
export const createItineraryOrder = async (req, res, next) => {
  try {
    if (!isPaymentConfigured()) {
      return res.status(503).json({
        success: false,
        message:
          "Payments are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the server.",
      });
    }

    const trip = await Trip.findOne({
      _id: req.body.tripId,
      userId: req.user._id,
    });
    if (!trip) {
      return res.status(404).json({ success: false, message: "Trip not found" });
    }

    const breakdown = computeDayBreakdown(trip);
    if (breakdown.lockedDays < 1) {
      return res.status(400).json({
        success: false,
        message: "All itinerary days for this trip are already available.",
      });
    }

    // Razorpay works in the smallest currency unit (paise for INR).
    const amountMinor = Math.round(breakdown.amount * 100);
    const receipt = `itin_${Date.now()}`; // <= 40 chars, per Razorpay

    const order = await createOrder({
      amount: amountMinor,
      currency: breakdown.currency,
      receipt,
      notes: {
        tripId: String(trip._id),
        userId: String(req.user._id),
        extraDays: String(breakdown.lockedDays),
      },
    });

    await Payment.create({
      userId: req.user._id,
      tripId: trip._id,
      orderId: order.id,
      receipt,
      amount: amountMinor,
      currency: breakdown.currency,
      extraDays: breakdown.lockedDays,
      status: "created",
    });

    res.status(201).json({
      success: true,
      order: {
        orderId: order.id,
        amount: amountMinor,
        currency: breakdown.currency,
        keyId: paymentConfig.razorpay.keyId, // publishable — safe for the browser
        extraDays: breakdown.lockedDays,
        pricePerDay: breakdown.pricePerDay,
      },
    });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/*  POST  /api/v1/payments/itinerary/verify                           */
/* ------------------------------------------------------------------ */
/**
 * Verify a completed Razorpay payment and, on success, unlock the paid-for
 * extra days on the trip. The signature is checked against our key secret, so
 * a client cannot unlock days without a genuine payment.
 */
export const verifyItineraryPayment = async (req, res, next) => {
  try {
    if (!isPaymentConfigured()) {
      return res.status(503).json({
        success: false,
        message: "Payments are not configured on the server.",
      });
    }

    const { orderId, paymentId, signature } = req.body;

    // Match the pending order to this user; an order they don't own is 404.
    const payment = await Payment.findOne({
      orderId,
      userId: req.user._id,
    });
    if (!payment) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Already processed — treat as success (idempotent re-verify).
    if (payment.status === "paid") {
      const trip = await Trip.findOne({ _id: payment.tripId, userId: req.user._id });
      return res.status(200).json({
        success: true,
        message: "Payment already verified",
        extraDays: payment.extraDays,
        unlockedItineraryDays: trip?.unlockedItineraryDays ?? null,
      });
    }

    if (!verifySignature({ orderId, paymentId, signature })) {
      payment.status = "failed";
      payment.paymentId = paymentId;
      await payment.save();
      return res
        .status(400)
        .json({ success: false, message: "Payment verification failed" });
    }

    const trip = await Trip.findOne({
      _id: payment.tripId,
      userId: req.user._id,
    });
    if (!trip) {
      return res.status(404).json({ success: false, message: "Trip not found" });
    }

    // Record the payment, then unlock the days it bought.
    payment.paymentId = paymentId;
    payment.signature = signature;
    payment.status = "paid";
    await payment.save();

    trip.unlockedItineraryDays =
      (trip.unlockedItineraryDays || 0) + payment.extraDays;
    await trip.save();

    res.status(200).json({
      success: true,
      message: `Unlocked ${payment.extraDays} extra itinerary day${
        payment.extraDays === 1 ? "" : "s"
      }`,
      extraDays: payment.extraDays,
      unlockedItineraryDays: trip.unlockedItineraryDays,
    });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ */
/*  POST  /api/v1/payments/itinerary/failed                           */
/* ------------------------------------------------------------------ */
/**
 * Mark a pending order as failed. Called by the client when Razorpay reports a
 * failed payment or the user abandons a started attempt, so the record doesn't
 * stay stuck at `created`. Only a still-pending order the user owns is touched
 * — a `paid` order is never regressed.
 */
export const markItineraryPaymentFailed = async (req, res, next) => {
  try {
    const { orderId, paymentId } = req.body;

    const payment = await Payment.findOne({
      orderId,
      userId: req.user._id,
    });
    if (!payment) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Never regress a verified payment; only pending orders can fail.
    if (payment.status === "created") {
      payment.status = "failed";
      if (paymentId) payment.paymentId = paymentId;
      await payment.save();
    }

    res.status(200).json({ success: true, status: payment.status });
  } catch (error) {
    next(error);
  }
};
