import { z } from "zod";

import type { LeagueKey, MarketType, SportCode } from "@/lib/types/domain";

const numberRangeSchema = z.object({
  min: z.number(),
  max: z.number()
});

const optionalNumberRangeSchema = numberRangeSchema.nullable().optional();

export const trendBetTypeSchema = z.enum(["moneyline", "spread", "total"]);
export const trendHomeAwaySchema = z.enum(["HOME", "AWAY", "EITHER"]);
export const trendBetResultSchema = z.enum(["W", "L", "P", "PENDING"]);
export const trendSampleSizeRatingSchema = z.enum(["SMALL", "MEDIUM", "LARGE", "ELITE"]);

export const filterConditionsSchema = z.object({
  sport: z
    .enum(["ALL", "BASKETBALL", "BASEBALL", "HOCKEY", "FOOTBALL", "MMA", "BOXING", "OTHER"])
    .default("ALL"),
  league: z
    .enum(["ALL", "NBA", "MLB", "NHL", "NFL", "NCAAF", "UFC", "BOXING"])
    .default("ALL"),
  betType: trendBetTypeSchema.default("spread"),
  marketType: z.enum(["moneyline", "spread", "total"]).default("spread"),
  homeAway: trendHomeAwaySchema.default("EITHER"),
  restDays: optionalNumberRangeSchema,
  backToBack: z.boolean().nullable().optional(),
  winStreak: optionalNumberRangeSchema,
  lossStreak: optionalNumberRangeSchema,
  travelMiles: optionalNumberRangeSchema,
  spreadRange: optionalNumberRangeSchema,
  totalRange: optionalNumberRangeSchema,
  moneylineRange: optionalNumberRangeSchema,
  isFavorite: z.boolean().nullable().optional(),
  isUnderdog: z.boolean().nullable().optional(),
  isNeutralSite: z.boolean().nullable().optional(),
  isDivisionalGame: z.boolean().nullable().optional(),
  month: z.array(z.number().int().min(1).max(12)).nullable().optional(),
  dayOfWeek: z.array(z.number().int().min(0).max(6)).nullable().optional(),
  gameTimeRange: z
    .object({
      startHour: z.number().int().min(0).max(23),
      endHour: z.number().int().min(0).max(23)
    })
    .nullable()
    .optional(),
  offensiveRatingRange: optionalNumberRangeSchema,
  defensiveRatingRange: optionalNumberRangeSchema,
  subject: z.string().trim().max(80).optional().default(""),
  team: z.string().trim().max(80).optional().default(""),
  opponentName: z.string().trim().max(80).optional().default(""),
  opponent: z
    .object({
      winStreak: optionalNumberRangeSchema,
      restDays: optionalNumberRangeSchema,
      offensiveRatingRange: optionalNumberRangeSchema,
      defensiveRatingRange: optionalNumberRangeSchema
    })
    .nullable()
    .optional(),
  minGames: z.number().int().min(10).max(1000).default(30)
});

export type FilterConditions = z.infer<typeof filterConditionsSchema>;

export const trendMatchResultSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  eventLabel: z.string(),
  startTime: z.string(),
  sport: z.string(),
  league: z.string(),
  marketType: z.string(),
  selection: z.string(),
  side: z.string().nullable(),
  selectionCompetitorId: z.string().nullable(),
  betResult: trendBetResultSchema,
  unitsWon: z.number(),
  cumulativeProfit: z.number(),
  oddsAmerican: z.number(),
  line: z.number().nullable(),
  closingLine: z.number().nullable(),
  role: z.string(),
  todayEligible: z.boolean(),
  whyMatched: z.array(z.string()),
  metadata: z.record(z.string(), z.unknown()).default({}),
  coverMargin: z.number().nullable().optional()
});

export type TrendMatchResult = z.infer<typeof trendMatchResultSchema>;

export const trendStatsSummarySchema = z.object({
  totalGames: z.number().int(),
  wins: z.number().int(),
  losses: z.number().int(),
  pushes: z.number().int(),
  winPercentage: z.number(),
  roi: z.number(),
  totalProfit: z.number(),
  currentStreak: z.number().int(),
  streakType: z.enum(["W", "L"]).nullable(),
  pValue: z.number(),
  chiSquareStat: z.number(),
  isStatisticallySignificant: z.boolean(),
  confidenceScore: z.number(),
  sampleSizeRating: trendSampleSizeRatingSchema,
  warnings: z.array(z.string()),
  longestWinStreak: z.number().int().default(0),
  longestLossStreak: z.number().int().default(0),
  avgMarginOfVictory: z.number().nullable().default(null)
});

export type TrendStatsSummary = z.infer<typeof trendStatsSummarySchema>;

export const trendBuilderPreviewSchema = z.object({
  stats: trendStatsSummarySchema,
  matches: z.array(trendMatchResultSchema),
  activeMatches: z.array(trendMatchResultSchema),
  title: z.string(),
  shortDescription: z.string(),
  explanation: z.string()
});

export type TrendBuilderPreview = z.infer<typeof trendBuilderPreviewSchema>;

export const trendFeedItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  sport: z.string(),
  league: z.string(),
  category: z.string(),
  betType: z.string(),
  confidenceScore: z.number(),
  sampleSize: z.number(),
  roi: z.number().nullable(),
  winPercentage: z.number().nullable(),
  totalProfit: z.number().nullable(),
  activeGameCount: z.number().int(),
  warnings: z.array(z.string()).default([])
});

export type TrendFeedItem = z.infer<typeof trendFeedItemSchema>;

export const trendSnapshotViewSchema = z.object({
  id: z.string(),
  trendDefinitionId: z.string(),
  calculatedAt: z.string(),
  totalGames: z.number().int(),
  wins: z.number().int(),
  losses: z.number().int(),
  pushes: z.number().int(),
  winPercentage: z.number().nullable(),
  roi: z.number().nullable(),
  totalProfit: z.number().nullable(),
  confidenceScore: z.number().nullable(),
  sampleSizeRating: z.string().nullable(),
  activeGameCount: z.number().int(),
  warnings: z.array(z.string()).default([])
});

export type TrendSnapshotView = z.infer<typeof trendSnapshotViewSchema>;

export type TrendDefinitionRecord = {
  id: string;
  name: string;
  description: string | null;
  sport: SportCode | "ALL";
  league: LeagueKey | "ALL" | null;
  betType: Extract<MarketType, "moneyline" | "spread" | "total">;
  filterConditions: FilterConditions;
  isSystemGenerated: boolean;
  isUserCreated: boolean;
  isPublic: boolean;
  isPremium: boolean;
  lastComputedAt: string | null;
};
