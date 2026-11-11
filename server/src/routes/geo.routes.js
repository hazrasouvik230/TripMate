import { Router } from "express";
import {
  placesSearch,
  placesDetails,
  routesEstimate,
  weatherForecast,
} from "../controllers/geo.controller.js";
import { protect } from "../middleware/auth.js";
import { validate, validateQuery } from "../middleware/validate.js";
import { rateLimit } from "../middleware/rateLimit.js";
import {
  placesSearchSchema,
  placeDetailsSchema,
  routeEstimateSchema,
  weatherForecastSchema,
} from "../validators/geo.validator.js";
import { providerConfig } from "../config/providers.js";

const router = Router();

// All geo routes require auth and are rate-limited per user (protects provider quotas).
router.use(protect);
router.use(rateLimit(providerConfig.rateLimit));

router.get("/places/search", validateQuery(placesSearchSchema), placesSearch);
router.get("/places/details", validateQuery(placeDetailsSchema), placesDetails);
router.post("/routes/estimate", validate(routeEstimateSchema), routesEstimate);
router.get("/weather/forecast", validateQuery(weatherForecastSchema), weatherForecast);

export default router;
