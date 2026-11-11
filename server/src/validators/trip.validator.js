import { z } from "zod";
import {
  TRAVEL_STYLES,
  TRAVEL_PACES,
  TRIP_STATUSES,
  BUDGET_TYPES,
} from "../models/Trip.js";

/* ---------- Reusable field schemas ---------- */

// Accepts an ISO string / timestamp and coerces to a valid Date.
const dateField = (label) =>
  z.coerce.date({
    errorMap: () => ({ message: `${label} must be a valid date` }),
  });

const originField = z
  .string({ required_error: "Origin is required" })
  .trim()
  .min(1, "Origin is required")
  .max(120, "Origin cannot exceed 120 characters");

const stopoverField = z
  .string()
  .trim()
  .max(120, "Stopover cannot exceed 120 characters");

const destinationField = z
  .string({ required_error: "Destination is required" })
  .trim()
  .min(1, "Destination is required")
  .max(120, "Destination cannot exceed 120 characters");

const travellersField = z
  .number({
    required_error: "Number of travellers is required",
    invalid_type_error: "Number of travellers must be a number",
  })
  .int("Number of travellers must be a whole number")
  .min(1, "There must be at least 1 traveller")
  .max(50, "Number of travellers cannot exceed 50");

const countField = z
  .number({ invalid_type_error: "Traveller count must be a number" })
  .int("Traveller count must be a whole number")
  .min(0, "Traveller count cannot be negative")
  .max(50, "Traveller count cannot exceed 50");

const genderCountsSchema = z
  .object({
    male: countField.optional().default(0),
    female: countField.optional().default(0),
    other: countField.optional().default(0),
  })
  .strict();

const compositionField = z
  .object({
    adults: genderCountsSchema.optional().default({}),
    children: genderCountsSchema.optional().default({}),
  })
  .strict();

const budgetField = z
  .number({ invalid_type_error: "Budget must be a number" })
  .min(0, "Budget cannot be negative")
  .max(1_000_000_000, "Budget is unrealistically large");

const budgetTypeField = z.enum(BUDGET_TYPES, {
  errorMap: () => ({
    message: `Budget type must be one of: ${BUDGET_TYPES.join(", ")}`,
  }),
});

const currencyField = z
  .string()
  .trim()
  .toUpperCase()
  .length(3, "Currency must be a 3-letter ISO code")
  .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO code");

const interestsField = z
  .array(z.string().trim().min(1).max(60))
  .max(30, "You can add at most 30 interests");

const travelStyleField = z.enum(TRAVEL_STYLES, {
  errorMap: () => ({
    message: `Travel style must be one of: ${TRAVEL_STYLES.join(", ")}`,
  }),
});

const travelPaceField = z.enum(TRAVEL_PACES, {
  errorMap: () => ({
    message: `Travel pace must be one of: ${TRAVEL_PACES.join(", ")}`,
  }),
});

const statusField = z.enum(TRIP_STATUSES, {
  errorMap: () => ({
    message: `Status must be one of: ${TRIP_STATUSES.join(", ")}`,
  }),
});

/* ---------- Cross-field date check ---------- */

// Only enforced when both dates are present (so PATCH with a single date works).
const endNotBeforeStart = (data, ctx) => {
  if (data.startDate && data.endDate && data.endDate < data.startDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endDate"],
      message: "End date cannot be earlier than start date",
    });
  }
};

// When both a breakdown and a travellers count are present, the six counts must
// add up to the total. (On PATCH without `travellers` we can't check here.)
const compositionSumsToTravellers = (data, ctx) => {
  const c = data.composition;
  if (!c || data.travellers == null) return;
  const total =
    (c.adults?.male || 0) +
    (c.adults?.female || 0) +
    (c.adults?.other || 0) +
    (c.children?.male || 0) +
    (c.children?.female || 0) +
    (c.children?.other || 0);
  if (total > 0 && total !== data.travellers) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["composition"],
      message: `Traveller breakdown must add up to ${data.travellers}`,
    });
  }
};

/* ---------- Create ---------- */

export const createTripSchema = z
  .object({
    origin: originField,
    stopover: stopoverField.optional(),
    destination: destinationField,
    startDate: dateField("Start date"),
    endDate: dateField("End date"),
    travellers: travellersField,
    composition: compositionField.optional(),
    budget: budgetField.optional(),
    budgetType: budgetTypeField.optional(),
    currency: currencyField.optional(),
    interests: interestsField.optional(),
    travelStyle: travelStyleField.optional(),
    travelPace: travelPaceField.optional(),
    status: statusField.optional(),
  })
  .strict()
  .superRefine(endNotBeforeStart)
  .superRefine(compositionSumsToTravellers);

/* ---------- Update (PATCH) ---------- */

export const updateTripSchema = z
  .object({
    origin: originField,
    stopover: stopoverField,
    destination: destinationField,
    startDate: dateField("Start date"),
    endDate: dateField("End date"),
    travellers: travellersField,
    composition: compositionField,
    budget: budgetField,
    budgetType: budgetTypeField,
    currency: currencyField,
    interests: interestsField,
    travelStyle: travelStyleField,
    travelPace: travelPaceField,
    status: statusField,
  })
  .strict()
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided to update",
  })
  .superRefine(endNotBeforeStart)
  .superRefine(compositionSumsToTravellers);

/* ---------- List query params ---------- */

export const listTripsQuerySchema = z
  .object({
    status: statusField.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sort: z
      .enum(["createdAt", "-createdAt", "startDate", "-startDate"])
      .default("-createdAt"),
  })
  .strict();
