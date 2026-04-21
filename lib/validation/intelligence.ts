import { z } from "zod";

const ingestMarketTypeSchema = z.enum([
  "spread",
  "moneyline",
  "total",
  "team_total",
  "player_points",
  "player_rebounds",
  "player_assists",
  "player_threes",
  "player_pitcher_outs",
  "player_pitcher_strikeouts",
  "fight_winner",
  "method_of_victory",
  "round_total",
  "round_winner",
  "other"
]);

const advancedOddsMarketSchema = z.object({
  marketType: ingestMarketTypeSchema,
  period: z.string().min(1).optional(),
  marketLabel: z.string().min(1).optional(),
  selection: z.string().min(1),
  side: z.string().min(1),
  line: z.number().nullable().optional(),
  oddsAmerican: z.number().nullable(),
  teamSide: z.enum(["home", "away"]).optional(),
  playerId: z.string().min(1).optional(),
  playerName: z.string().min(1).optional(),
  teamId: z.string().min(1).optional()
});

export const oddsLineSchema = z.object({
  book: z.string().min(1),
  fetchedAt: z.string().datetime(),
  odds: z
    .object({
      homeMoneyline: z.number().nullable().optional(),
      awayMoneyline: z.number().nullable().optional(),
      homeSpread: z.number().nullable().optional(),
      homeSpreadOdds: z.number().nullable().optional(),
      awaySpreadOdds: z.number().nullable().optional(),
      total: z.number().nullable().optional(),
      overOdds: z.number().nullable().optional(),
      underOdds: z.number().nullable().optional()
    })
    .optional(),
  markets: z.array(advancedOddsMarketSchema).optional()
});

export const ingestPayloadSchema = z.object({
  sport: z.string().min(1),
  eventKey: z.string().min(1),
  homeTeam: z.string().min(1),
  awayTeam: z.string().min(1),
  commenceTime: z.string().datetime(),
  source: z.enum([
    "theoddsapi",
    "scraper",
    "therundown",
    "oddsharvester",
    "draftkings",
    "fanduel"
  ]),
  lines: z.array(oddsLineSchema).min(1),
  sourceMeta: z.record(z.string(), z.unknown()).optional()
});

export const eventProjectionIngestSchema = z.object({
  modelKey: z.string().min(1),
  modelVersion: z.string().optional(),
  eventId: z.string().min(1),
  projectedHomeScore: z.number().optional(),
  projectedAwayScore: z.number().optional(),
  projectedTotal: z.number().optional(),
  projectedSpreadHome: z.number().optional(),
  winProbHome: z.number().min(0).max(1).optional(),
  winProbAway: z.number().min(0).max(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export const playerProjectionIngestSchema = z.object({
  modelKey: z.string().min(1),
  modelVersion: z.string().optional(),
  eventId: z.string().min(1),
  playerId: z.string().min(1),
  statKey: z.string().min(1),
  meanValue: z.number(),
  medianValue: z.number().optional(),
  stdDev: z.number().optional(),
  hitProbOver: z.record(z.string(), z.number()).optional(),
  hitProbUnder: z.record(z.string(), z.number()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export const injuryIngestSchema = z.object({
  leagueId: z.string().optional(),
  teamId: z.string().optional(),
  playerId: z.string().optional(),
  gameId: z.string().optional(),
  status: z.enum(["ACTIVE", "QUESTIONABLE", "DOUBTFUL", "OUT"]),
  source: z.string().min(1),
  description: z.string().optional(),
  effectiveAt: z.string().datetime().optional(),
  reportedAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export const recomputeRequestSchema = z.object({
  eventId: z.string().optional(),
  sportKey: z.string().optional(),
  leagueKey: z.string().optional(),
  liveOnly: z.boolean().optional().default(false)
});

export const trendRefreshRequestSchema = z.object({
  leagues: z.array(z.string()).optional(),
  days: z.number().int().positive().max(365).optional()
});
