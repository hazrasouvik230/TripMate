import { Router } from "express";
import {
  aiTest,
  aiTestStream,
  generateItinerary,
  generateItineraryStream,
  getLatestItinerary,
  updateItinerary,
  regenerateDay,
  searchKnowledge,
  suggestInterests,
  ask,
  chat,
  chatStream,
  getChatHistory,
} from "../controllers/ai.controller.js";
import { protect } from "../middleware/auth.js";
import { validate, validateObjectId } from "../middleware/validate.js";
import { rateLimit } from "../middleware/rateLimit.js";
import {
  aiTestSchema,
  searchKnowledgeSchema,
  suggestInterestsSchema,
  askSchema,
  chatSchema,
} from "../validators/ai.validator.js";
import {
  generateItinerarySchema,
  updateItinerarySchema,
} from "../validators/itinerary.validator.js";
import { llmConfig } from "../config/llm.js";

const router = Router();

// All AI routes require authentication and are rate-limited per user.
router.use(protect);
router.use(rateLimit(llmConfig.rateLimit));

router.post("/test", validate(aiTestSchema), aiTest);
router.post("/test/stream", validate(aiTestSchema), aiTestStream);
router.post(
  "/generate-itinerary",
  validate(generateItinerarySchema),
  generateItinerary
);
router.post(
  "/generate-itinerary/stream",
  validate(generateItinerarySchema),
  generateItineraryStream
);
router.post("/search-knowledge", validate(searchKnowledgeSchema), searchKnowledge);
router.post("/suggest-interests", validate(suggestInterestsSchema), suggestInterests);
router.post("/ask", validate(askSchema), ask);
router.post("/chat", validate(chatSchema), chat);
router.post("/chat/stream", validate(chatSchema), chatStream);
router.get("/chat/:tripId", validateObjectId("tripId"), getChatHistory);
router.get("/itinerary/:tripId", validateObjectId("tripId"), getLatestItinerary);
router.patch(
  "/itinerary/:itineraryId",
  validateObjectId("itineraryId"),
  validate(updateItinerarySchema),
  updateItinerary
);
router.post(
  "/itinerary/:itineraryId/day/:dayNumber/regenerate",
  validateObjectId("itineraryId"),
  regenerateDay
);

export default router;
