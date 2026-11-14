import { z } from "zod";
import { PAYMENT_STATUSES } from "../models/Payment.js";

/* ---------- Transactions list query params ---------- */

/**
 * Query schema for GET /api/v1/admin/transactions. Supports status filtering,
 * a free-text search (matched against order / payment ids on the server),
 * pagination and sort order.
 */
export const listTransactionsQuerySchema = z
  .object({
    status: z
      .enum(PAYMENT_STATUSES, {
        errorMap: () => ({
          message: `Status must be one of: ${PAYMENT_STATUSES.join(", ")}`,
        }),
      })
      .optional(),
    search: z.string().trim().max(120).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sort: z
      .enum(["createdAt", "-createdAt", "amount", "-amount"])
      .default("-createdAt"),
  })
  .strict();
