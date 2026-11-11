import { Router } from "express";
import {
  createTrip,
  listTrips,
  getTrip,
  updateTrip,
  deleteTrip,
} from "../controllers/trip.controller.js";
import { protect } from "../middleware/auth.js";
import {
  validate,
  validateQuery,
  validateObjectId,
} from "../middleware/validate.js";
import {
  createTripSchema,
  updateTripSchema,
  listTripsQuerySchema,
} from "../validators/trip.validator.js";

const router = Router();

// Every trip route requires authentication.
router.use(protect);

router
  .route("/")
  .post(validate(createTripSchema), createTrip)
  .get(validateQuery(listTripsQuerySchema), listTrips);

router
  .route("/:tripId")
  .get(validateObjectId("tripId"), getTrip)
  .patch(validateObjectId("tripId"), validate(updateTripSchema), updateTrip)
  .delete(validateObjectId("tripId"), deleteTrip);

export default router;
