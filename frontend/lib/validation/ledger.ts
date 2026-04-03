import { z } from "zod";

import {
  BET_RESULTS,
  BET_SOURCES,
  BET_TYPES,
  FILTER_WINDOWS,
  LEDGER_MARKET_TYPES,
  LEAGUE_KEYS,
  SORT_DIRECTIONS,
  SORT_OPTIONS,
  SPORT_CODES
} from "@/lib/types/ledger";

const nullableNumber = z
  .union([z.number(), z.nan(), z.null(), z.undefined()])
  .transform((value) => (typeof value === "number" && !Number.isNaN(value) ? value : null));

const betContextSchema = z
  .object({
    sourcePage: z.enum(["board", "props", "matchup", "top_plays"]),
    sourceLabel: z.string(),
    sourcePath: z.string(),
    sourceItemId: z.string().optional().nullable(),
    eventLabel: z.string(),
    matchupHref: z.string().optional().nullable(),
    externalEventId: z.string().optional().nullable(),
    sportsbookKey: z.string().optional().nullable(),
    sportsbookName: z.string().optional().nullable(),
    supportStatus: z.enum(["LIVE", "PARTIAL", "COMING_SOON"]).optional().nullable(),
    supportNote: z.string().optional().nullable(),
    marketDeltaAmerican: nullableNumber,
    expectedValuePct: nullableNumber,
    edgeScore: nullableNumber,
    edgeLabel: z.enum(["Elite", "Strong", "Watchlist", "Pass"]).optional().nullable(),
    confidenceTier: z.enum(["A", "B", "C"]).optional().nullable(),
    valueFlag: z.enum(["BEST_PRICE", "MARKET_PLUS", "STEAM", "NONE"]).optional().nullable(),
    capturedAt: z.string()
  })
  .strict();

export const ledgerFiltersSchema = z.object({
  status: z
    .enum(["ALL", "SETTLED", ...BET_RESULTS])
    .default("ALL"),
  sport: z.enum(["ALL", ...SPORT_CODES]).default("ALL"),
  league: z.enum(["ALL", ...LEAGUE_KEYS]).default("ALL"),
  market: z.enum(["ALL", ...LEDGER_MARKET_TYPES]).default("ALL"),
  sportsbook: z.string().default("all"),
  window: z.enum(FILTER_WINDOWS).default("all"),
  sort: z.enum(SORT_OPTIONS).default("placedAt"),
  direction: z.enum(SORT_DIRECTIONS).default("desc")
});

export const ledgerBetLegSchema = z.object({
  id: z.string().optional(),
  eventId: z.string().optional().nullable(),
  sportsbookId: z.string().optional().nullable(),
  marketType: z.enum(LEDGER_MARKET_TYPES),
  marketLabel: z.string().trim().min(1, "Market label is required."),
  selection: z.string().trim().min(1, "Selection is required."),
  side: z.string().trim().optional().nullable(),
  line: nullableNumber,
  oddsAmerican: z
    .number()
    .int()
    .refine((value) => value >= -5000 && value <= 5000 && value !== 0, "Odds must be a valid American price."),
  closingLine: nullableNumber,
  closingOddsAmerican: z
    .union([z.number(), z.nan(), z.null(), z.undefined()])
    .transform((value) =>
      typeof value === "number" && !Number.isNaN(value) ? Math.trunc(value) : null
    ),
  notes: z.string().max(240).optional().default(""),
  context: betContextSchema.optional().nullable()
});

export const ledgerBetFormSchema = z.object({
  id: z.string().optional(),
  placedAt: z.string().min(1, "Placed time is required."),
  settledAt: z.string().optional().nullable(),
  source: z.enum(BET_SOURCES).default("MANUAL"),
  externalSourceKey: z.string().optional().nullable(),
  externalSourceId: z.string().optional().nullable(),
  externalSourceFingerprint: z.string().optional().nullable(),
  betType: z.enum(BET_TYPES),
  sport: z.enum(SPORT_CODES),
  league: z.enum(LEAGUE_KEYS),
  eventId: z.string().optional().nullable(),
  sportsbookId: z.string().optional().nullable(),
  status: z.enum(BET_RESULTS).default("OPEN"),
  stake: z.number().positive("Stake must be greater than zero."),
  notes: z.string().max(500).optional().default(""),
  tags: z.string().optional().default(""),
  isLive: z.boolean().default(false),
  context: betContextSchema.optional().nullable(),
  legs: z.array(ledgerBetLegSchema).min(1, "At least one leg is required.").max(8)
}).superRefine((value, context) => {
  if (value.betType === "STRAIGHT" && value.legs.length !== 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["legs"],
      message: "Straight bets must contain exactly one leg."
    });
  }

  if (value.betType === "PARLAY" && value.legs.length < 2) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["legs"],
      message: "Parlays need at least two legs."
    });
  }
});

export type LedgerFiltersSchema = z.infer<typeof ledgerFiltersSchema>;
export type LedgerBetFormSchema = z.infer<typeof ledgerBetFormSchema>;
