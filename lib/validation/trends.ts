import { z } from "zod";

import { trendFiltersSchema } from "@/lib/validation/filters";

export const trendModeSchema = z.enum(["simple", "power"]).default("simple");

export const savedTrendMutationSchema = z.object({
  name: z.string().trim().min(2).max(80),
  filters: trendFiltersSchema,
  aiQuery: z.string().trim().max(240).optional().nullable(),
  mode: trendModeSchema
});

export const savedTrendUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  filters: trendFiltersSchema.optional(),
  aiQuery: z.string().trim().max(240).optional().nullable(),
  mode: trendModeSchema.optional(),
  archived: z.boolean().optional()
});

export const trendAiQuerySchema = z.object({
  q: z.string().trim().min(2).max(240)
});
