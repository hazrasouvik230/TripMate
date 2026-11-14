import { Router } from "express";
import healthRoutes from "./health.routes.js";
import authRoutes from "./auth.routes.js";
import tripRoutes from "./trip.routes.js";
import aiRoutes from "./ai.routes.js";
import geoRoutes from "./geo.routes.js";
import budgetRoutes from "./budget.routes.js";
import paymentRoutes from "./payment.routes.js";

const router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/trips", tripRoutes);
router.use("/trips/:tripId/budget", budgetRoutes);
router.use("/ai", aiRoutes);
router.use("/payments", paymentRoutes);
router.use("/", geoRoutes); // /places/*, /routes/*, /weather/*

export default router;
