import { Router } from "express";
import {
  getBudget,
  addItem,
  updateItem,
  deleteItem,
} from "../controllers/budget.controller.js";
import { protect } from "../middleware/auth.js";
import { validate, validateQuery, validateObjectId } from "../middleware/validate.js";
import {
  addItemSchema,
  updateItemSchema,
  budgetQuerySchema,
} from "../validators/budget.validator.js";

// mergeParams so :tripId from the parent mount is available here.
const router = Router({ mergeParams: true });

router.use(protect);
router.use(validateObjectId("tripId"));

router.get("/", validateQuery(budgetQuerySchema), getBudget);
router.post("/items", validate(addItemSchema), addItem);
router
  .route("/items/:itemId")
  .patch(validateObjectId("itemId"), validate(updateItemSchema), updateItem)
  .delete(validateObjectId("itemId"), deleteItem);

export default router;
