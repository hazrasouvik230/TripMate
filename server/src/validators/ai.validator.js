import { z } from "zod";
import mongoose from "mongoose";

/**
 * Validation for the AI test endpoint. `message` is the traveller's question;
 * the optional knobs let callers tune generation (clamped server-side).
 */
export const aiTestSchema = z
  .object({
    message: z
      .string({ required_error: "A message is required" })
      .trim()
      .min(1, "Message cannot be empty")
      .max(8000, "Message is too long"),

    // Optional generation overrides.
    model: z.string().trim().min(1).optional(),
    maxTokens: z.number().int().min(1).max(4096).optional(),
    temperature: z.number().min(0).max(2).optional(),
  })
  .strict();

/* ---------- Conversational chat ---------- */
export const chatSchema = z
  .object({
    tripId: z
      .string({ required_error: "tripId is required" })
      .refine((v) => mongoose.isValidObjectId(v), "Invalid tripId"),
    message: z
      .string({ required_error: "A message is required" })
      .trim()
      .min(1, "Message cannot be empty")
      .max(2000, "Message is too long"),
  })
  .strict();

/* ---------- RAG: ask a grounded question ---------- */
export const askSchema = z
  .object({
    question: z
      .string({ required_error: "A question is required" })
      .trim()
      .min(1, "Question cannot be empty")
      .max(1000, "Question is too long"),
    tripId: z
      .string()
      .refine((v) => mongoose.isValidObjectId(v), "Invalid tripId")
      .optional(),
    destination: z.string().trim().min(1).max(120).optional(),
    category: z.string().trim().min(1).max(60).optional(),
    limit: z.number().int().min(1).max(20).optional(),
  })
  .strict();

/* ---------- Destination-aware interest suggestions ---------- */
export const suggestInterestsSchema = z
  .object({
    destination: z
      .string({ required_error: "A destination is required" })
      .trim()
      .min(1, "Destination cannot be empty")
      .max(120, "Destination is too long"),
    stopover: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

/* ---------- Semantic knowledge search ---------- */
export const searchKnowledgeSchema = z
  .object({
    query: z
      .string({ required_error: "A query is required" })
      .trim()
      .min(1, "Query cannot be empty")
      .max(1000, "Query is too long"),
    destination: z.string().trim().min(1).max(120).optional(),
    category: z.string().trim().min(1).max(60).optional(),
    limit: z.number().int().min(1).max(20).optional(),
  })
  .strict();
