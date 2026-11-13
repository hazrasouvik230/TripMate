import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import apiRoutes from "./routes/index.js";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";

const app = express();

// --------------- Global Middleware ---------------
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// --------------- Health Check ---------------
// Lightweight liveness endpoints (used by Render's health check, uptime
// pings, and bots hitting the root). Returning 200 here keeps these out of
// the error logs instead of falling through to the 404 handler.
const health = (_req, res) =>
  res.status(200).json({ status: "ok", service: "tripmate-ai-server" });
app.get("/", health);
app.get("/health", health);

// --------------- API Routes ---------------
app.use("/api/v1", apiRoutes);

// --------------- Error Handling ---------------
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
