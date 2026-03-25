import { z } from "zod";

export const boardFiltersSchema = z.object({
  league: z
    .enum(["ALL", "NBA", "NCAAB", "MLB", "NHL", "NFL", "NCAAF", "UFC", "BOXING"])
    .default("ALL"),
  date: z.string().default("all"),
  sportsbook: z.string().default("best"),
  market: z.enum(["all", "spread", "moneyline", "total"]).default("all"),
  status: z.enum(["pregame", "live"]).default("pregame")
});

export const propsFiltersSchema = z.object({
  league: z.enum(["ALL", "NBA", "NCAAB"]).default("NBA"),
  marketType: z
    .enum(["ALL", "player_points", "player_rebounds", "player_assists", "player_threes"])
    .default("ALL"),
  team: z.string().default("all"),
  player: z.string().default("all"),
  sportsbook: z.string().default("all"),
  minEdge: z.coerce.number().min(0).max(100).default(0),
  minHitRate: z.coerce.number().min(0).max(100).default(0)
});

export const betFiltersSchema = z.object({
  state: z.enum(["ALL", "OPEN", "SETTLED"]).default("ALL"),
  sport: z.enum(["ALL", "BASKETBALL", "BASEBALL", "HOCKEY", "FOOTBALL", "OTHER"]).default("ALL"),
  market: z
    .enum([
      "ALL",
      "spread",
      "moneyline",
      "total",
      "player_points",
      "player_rebounds",
      "player_assists",
      "player_threes"
    ])
    .default("ALL"),
  sportsbook: z.string().default("all")
});
