import { z } from "zod";
import { BUDGET_CATEGORIES } from "../models/Budget.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const budgetQuerySchema = z
  .object({
    display: z
      .string()
      .regex(/^[A-Za-z]{3}$/, "display must be a 3-letter currency code")
      .optional(),
  })
  .strict();

export const addItemSchema = z
  .object({
    category: z.enum(BUDGET_CATEGORIES),
    label: z.string().trim().min(1, "Label is required").max(120),
    amount: z
      .number({ required_error: "Amount is required", invalid_type_error: "Amount must be a number" })
      .min(0, "Amount cannot be negative")
      .max(100_000_000, "Amount is unrealistically large"),
    date: isoDate.optional(),
  })
  .strict();

// Partial update (at least one field); same non-negative guard on amount.
export const updateItemSchema = z
  .object({
    category: z.enum(BUDGET_CATEGORIES).optional(),
    label: z.string().trim().min(1).max(120).optional(),
    amount: z.number().min(0, "Amount cannot be negative").max(100_000_000).optional(),
    date: isoDate.nullable().optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, "At least one field must be provided");
