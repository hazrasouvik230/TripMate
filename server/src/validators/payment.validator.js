import { z } from "zod";
import mongoose from "mongoose";

/* ---------- Create an itinerary-days order ---------- */
export const createItineraryOrderSchema = z
  .object({
    tripId: z
      .string({ required_error: "tripId is required" })
      .refine((v) => mongoose.isValidObjectId(v), "Invalid tripId"),
  })
  .strict();

/* ---------- Verify a completed payment ---------- */
// Field names mirror Razorpay's checkout callback (razorpay_order_id, etc.),
// normalised to camelCase by the client before posting.
export const verifyItineraryPaymentSchema = z
  .object({
    orderId: z.string({ required_error: "orderId is required" }).trim().min(1),
    paymentId: z.string({ required_error: "paymentId is required" }).trim().min(1),
    signature: z.string({ required_error: "signature is required" }).trim().min(1),
  })
  .strict();
