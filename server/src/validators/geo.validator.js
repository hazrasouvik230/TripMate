import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const placesSearchSchema = z
  .object({
    q: z.string().trim().min(1, "q is required").max(200),
    near: z.string().trim().min(1).max(120).optional(),
    limit: z.coerce.number().int().min(1).max(20).default(8),
  })
  .strict();

export const placeDetailsSchema = z
  .object({
    placeId: z
      .string()
      .regex(/^[NWR]:\d+$/i, "placeId must be '<N|W|R>:<osmId>'"),
  })
  .strict();

const coord = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

export const routeEstimateSchema = z
  .object({
    waypoints: z.array(coord).min(2, "At least two waypoints").max(25),
    profile: z.enum(["driving", "walking", "cycling"]).default("driving"),
    geometry: z.boolean().default(false),
  })
  .strict();

export const weatherForecastSchema = z
  .object({
    lat: z.coerce.number().min(-90).max(90),
    lon: z.coerce.number().min(-180).max(180),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
  })
  .strict();
