import { Router } from "express";
import {
  getItineraryQuote,
  createItineraryOrder,
  verifyItineraryPayment,
  markItineraryPaymentFailed,
} from "../controllers/payment.controller.js";
import { protect } from "../middleware/auth.js";
import { validate, validateObjectId } from "../middleware/validate.js";
import {
  createItineraryOrderSchema,
  verifyItineraryPaymentSchema,
  markItineraryPaymentFailedSchema,
} from "../validators/payment.validator.js";

const router = Router();

// All payment routes require authentication.
router.use(protect);

router.get(
  "/itinerary/:tripId/quote",
  validateObjectId("tripId"),
  getItineraryQuote
);
router.post(
  "/itinerary/order",
  validate(createItineraryOrderSchema),
  createItineraryOrder
);
router.post(
  "/itinerary/verify",
  validate(verifyItineraryPaymentSchema),
  verifyItineraryPayment
);
router.post(
  "/itinerary/failed",
  validate(markItineraryPaymentFailedSchema),
  markItineraryPaymentFailed
);

export default router;
