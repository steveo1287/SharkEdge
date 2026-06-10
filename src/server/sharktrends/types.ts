import { z } from "zod";

export const HISTORICAL_SOURCE_KEYS = [
  "oddsharvester_historical",
  "sportsbookreview_historical",
  "arnavsaraogi_mlb_scraper"
] as const;

export type SharkTrendMarketType = "moneyline" | "spread" | "total";
export type SharkTrendSide = "TEAM" | "OPPONENT" | "OVER" | "UNDER" | "HOME" | "AWAY" | "FAVORITE" | "UNDERDOG";
export type SharkTrendHomeAway = "HOME" | "AWAY" | "ALL";

export type SharkTrendFilter = {
  league?: "MLB";
  seasons?: number[];
  team?: string;
  opponent?: string;
  marketType?: SharkTrendMarketType;
  side?: SharkTrendSide;
  homeAway?: SharkTrendHomeAway;
  oddsMin?: number;
  oddsMax?: number;
  favoriteMinAbsPrice?: number;
  favoriteMaxAbsPrice?: number;
  totalMin?: number;
  totalMax?: number;
  spreadMin?: number;
  spreadMax?: number;
  divisionGame?: boolean;
  interleagueGame?: boolean;
  gameNumber?: number;
  dayGame?: boolean;
  nightGame?: boolean;
  daysRestMin?: number;
  daysRestMax?: number;
  opponentDaysRestMin?: number;
  opponentDaysRestMax?: number;
  travelSpot?: "home_stand" | "road_trip" | "home_to_road" | "road_to_home";
  previousRunsScoredMax?: number;
  previousRunsAllowedMin?: number;
  lastTwoRunsScoredMax?: number;
  lastThreeRunsScoredMax?: number;
  windOut?: boolean;
  windIn?: boolean;
  windMphMin?: number;
  windMphMax?: number;
  venue?: string;
  parkId?: string;
  starterRollingGameScoreMin?: number;
  starterRollingGameScoreMax?: number;
  eloDiffMin?: number;
  eloDiffMax?: number;
  sportsbookKey?: string;
  sourceKeys?: string[];
  minDataQualityScore?: number;
};

export type SharkTrendParsedQuery = {
  input: string;
  confidence: "high" | "medium" | "low";
  filters: SharkTrendFilter;
  unresolved: string[];
  explanation: string;
};

export type SharkTrendContextRow = {
  id?: string;
  eventId: string;
  eventMarketId?: string | null;
  sourceKey: string;
  sportsbookKey?: string | null;
  sportsbookName?: string | null;
  season: number;
  gameDate: string | Date;
  startTime: string | Date;
  teamCompetitorId: string;
  opponentCompetitorId?: string | null;
  teamName: string;
  opponentName?: string | null;
  teamAbbr?: string | null;
  opponentAbbr?: string | null;
  isHome: boolean;
  side: string;
  marketType: SharkTrendMarketType | string;
  line?: number | null;
  openingLine?: number | null;
  closingLine?: number | null;
  oddsAmerican?: number | null;
  openingOddsAmerican?: number | null;
  closingOddsAmerican?: number | null;
  impliedProbability?: number | null;
  isFavorite?: boolean | null;
  isUnderdog?: boolean | null;
  favoritePriceBucket?: string | null;
  moneylineBucket?: string | null;
  spreadBucket?: string | null;
  totalBucket?: string | null;
  teamScore?: number | null;
  opponentScore?: number | null;
  wonGame?: boolean | null;
  coverResult?: string | null;
  ouResult?: string | null;
  totalRuns?: number | null;
  margin?: number | null;
  venue?: string | null;
  parkId?: string | null;
  divisionGame?: boolean | null;
  interleagueGame?: boolean | null;
  gameNumber?: number | null;
  isDayGame?: boolean | null;
  isNightGame?: boolean | null;
  previousGameDate?: string | Date | null;
  daysRest?: number | null;
  opponentDaysRest?: number | null;
  isBackToBack?: boolean | null;
  travelSpot?: string | null;
  lastGameRunsScored?: number | null;
  lastGameRunsAllowed?: number | null;
  lastTwoRunsScored?: number | null;
  lastThreeRunsScored?: number | null;
  starterPitcherId?: string | null;
  starterPitcherName?: string | null;
  starterRollingGameScore?: number | null;
  teamPregameElo?: number | null;
  opponentPregameElo?: number | null;
  eloDiff?: number | null;
  weatherTempF?: number | null;
  windMph?: number | null;
  windDirection?: string | null;
  windOut?: boolean | null;
  windIn?: boolean | null;
  dataQualityScore: number;
  dataWarnings?: unknown;
  rawContextJson?: unknown;
};

export const sharkTrendFilterZodSchema = z.object({
  league: z.literal("MLB").default("MLB"),
  seasons: z.array(z.number().int().min(1876).max(2200)).optional(),
  team: z.string().trim().min(1).optional(),
  opponent: z.string().trim().min(1).optional(),
  marketType: z.enum(["moneyline", "spread", "total"]).optional(),
  side: z.enum(["TEAM", "OPPONENT", "OVER", "UNDER", "HOME", "AWAY", "FAVORITE", "UNDERDOG"]).optional(),
  homeAway: z.enum(["HOME", "AWAY", "ALL"]).optional(),
  oddsMin: z.number().optional(),
  oddsMax: z.number().optional(),
  favoriteMinAbsPrice: z.number().positive().optional(),
  favoriteMaxAbsPrice: z.number().positive().optional(),
  totalMin: z.number().optional(),
  totalMax: z.number().optional(),
  spreadMin: z.number().optional(),
  spreadMax: z.number().optional(),
  divisionGame: z.boolean().optional(),
  interleagueGame: z.boolean().optional(),
  gameNumber: z.number().int().min(1).max(10).optional(),
  dayGame: z.boolean().optional(),
  nightGame: z.boolean().optional(),
  daysRestMin: z.number().optional(),
  daysRestMax: z.number().optional(),
  opponentDaysRestMin: z.number().optional(),
  opponentDaysRestMax: z.number().optional(),
  travelSpot: z.enum(["home_stand", "road_trip", "home_to_road", "road_to_home"]).optional(),
  previousRunsScoredMax: z.number().optional(),
  previousRunsAllowedMin: z.number().optional(),
  lastTwoRunsScoredMax: z.number().optional(),
  lastThreeRunsScoredMax: z.number().optional(),
  windOut: z.boolean().optional(),
  windIn: z.boolean().optional(),
  windMphMin: z.number().optional(),
  windMphMax: z.number().optional(),
  venue: z.string().trim().min(1).optional(),
  parkId: z.string().trim().min(1).optional(),
  starterRollingGameScoreMin: z.number().optional(),
  starterRollingGameScoreMax: z.number().optional(),
  eloDiffMin: z.number().optional(),
  eloDiffMax: z.number().optional(),
  sportsbookKey: z.string().trim().min(1).optional(),
  sourceKeys: z.array(z.string().trim().min(1)).optional(),
  minDataQualityScore: z.number().int().min(0).max(100).optional()
});
