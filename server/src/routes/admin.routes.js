import { Router } from "express";
import {
  getAnalytics,
  listTransactions,
} from "../controllers/admin.controller.js";
import { protect, requireAdmin } from "../middleware/auth.js";
import { validateQuery } from "../middleware/validate.js";
import { listTransactionsQuerySchema } from "../validators/admin.validator.js";

const router = Router();

// Every admin route requires a logged-in admin.
router.use(protect, requireAdmin);

router.get("/analytics", getAnalytics);
router.get(
  "/transactions",
  validateQuery(listTransactionsQuerySchema),
  listTransactions
);

export default router;
