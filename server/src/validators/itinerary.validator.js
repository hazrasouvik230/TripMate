import { z } from "zod";
import mongoose from "mongoose";

/* ---------- Request body ---------- */
export const generateItinerarySchema = z
  .object({
    tripId: z
      .string({ required_error: "tripId is required" })
      .refine((v) => mongoose.isValidObjectId(v), "Invalid tripId"),
    // Optional free-text guidance to steer (re)generation, e.g. "more food
    // spots, cheaper stays". Trimmed; empty is treated as absent.
    instructions: z
      .string()
      .trim()
      .max(1000, "Instructions must be 1000 characters or fewer")
      .optional(),
  })
  .strict();

/* ---------- LLM output validation ---------- */
// Structured output constrains shape; Zod enforces values (non-negative costs,
// sane durations, required names) and gives us a clean failure if the model
// strays. Dates and day numbers are assigned authoritatively in JS, so the LLM
// is not asked for them.

const activitySchema = z.object({
  name: z.string().trim().min(1, "Activity name is required"),
  description: z.string().trim().default(""),
  durationMinutes: z
    .number()
    .int()
    .min(0, "Duration cannot be negative")
    .max(1440, "Duration cannot exceed 24h")
    .catch(0),
  estimatedCost: z.number().min(0, "Cost cannot be negative"),
});

const foodSchema = z.object({
  name: z.string().trim().min(1, "Food name is required"),
  type: z.enum(["breakfast", "lunch", "dinner", "snack"]).catch("lunch"),
  description: z.string().trim().default(""),
  estimatedCost: z.number().min(0, "Cost cannot be negative"),
});

// A suggested place to stay for the night. Display-only — its price is NOT
// added to the day/trip cost totals (which track activities + food). Several
// options are offered per night; the list is empty on days without an
// overnight stay (e.g. a final departure day).
const accommodationSchema = z.object({
  name: z.string().trim().min(1, "Accommodation name is required"),
  area: z.string().trim().default(""),
  type: z.string().trim().default(""),
  pricePerNight: z.number().min(0, "Price cannot be negative").catch(0),
});

const daySchema = z.object({
  summary: z.string().trim().default(""),
  morning: activitySchema,
  afternoon: activitySchema,
  evening: activitySchema,
  food: z.array(foodSchema).default([]),
  transportation: z.string().trim().default(""),
  accommodation: z.array(accommodationSchema).default([]),
  tips: z.array(z.string().trim().min(1)).default([]),
});

// A single day (used for single-day regeneration).
export const llmDaySchema = daySchema;

export const llmItinerarySchema = z.object({
  days: z.array(daySchema).min(1, "Itinerary must contain at least one day"),
});

/* ---------- User edits (PATCH) ---------- */
// Activities may be null (a deleted time slot). Costs still validated >= 0.
const nullableActivity = activitySchema.nullable();

const editDaySchema = z.object({
  dayNumber: z.number().int().min(1),
  summary: z.string().trim().default(""),
  morning: nullableActivity.default(null),
  afternoon: nullableActivity.default(null),
  evening: nullableActivity.default(null),
  food: z.array(foodSchema).default([]),
  transportation: z.string().trim().default(""),
  accommodation: z.array(accommodationSchema).default([]),
  tips: z.array(z.string().trim().min(1)).default([]),
});

// The client sends the desired day states; the server preserves dates/day
// numbers and recomputes all costs, so no totals/dates are accepted here.
export const updateItinerarySchema = z
  .object({
    days: z.array(editDaySchema).min(1, "At least one day is required"),
  })
  .strict();
