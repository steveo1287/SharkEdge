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
  league: z
    .enum(["ALL", "NBA", "NCAAB", "MLB", "NHL", "NFL", "NCAAF", "UFC", "BOXING"])
    .default("ALL"),
  marketType: z
    .enum([
      "ALL",
      "player_points",
      "player_rebounds",
      "player_assists",
      "player_threes",
      "fight_winner",
      "method_of_victory",
      "round_total",
      "round_winner"
    ])
    .default("ALL"),
  team: z.string().default("all"),
  player: z.string().default("all"),
  sportsbook: z.string().default("all"),
  valueFlag: z.enum(["all", "BEST_PRICE", "MARKET_PLUS", "STEAM"]).default("all"),
  sortBy: z
    .enum(["best_price", "line_movement", "market_ev", "edge_score", "league", "start_time"])
    .default("best_price")
});

export const trendFiltersSchema = z.object({
  sport: z
    .enum(["ALL", "BASKETBALL", "BASEBALL", "HOCKEY", "FOOTBALL", "MMA", "BOXING", "OTHER"])
    .default("ALL"),
  league: z
    .enum(["ALL", "NBA", "NCAAB", "MLB", "NHL", "NFL", "NCAAF", "UFC", "BOXING"])
    .default("ALL"),
  market: z
    .enum([
      "ALL",
      "spread",
      "moneyline",
      "total",
      "team_total",
      "player_points",
      "player_rebounds",
      "player_assists",
      "player_threes",
      "fight_winner",
      "method_of_victory",
      "round_total",
      "round_winner",
      "other"
    ])
    .default("ALL"),
  sportsbook: z.string().trim().max(80).default("all"),
  side: z
    .enum([
      "ALL",
      "HOME",
      "AWAY",
      "OVER",
      "UNDER",
      "FAVORITE",
      "UNDERDOG",
      "COMPETITOR_A",
      "COMPETITOR_B"
    ])
    .default("ALL"),
  subject: z.string().trim().max(80).default(""),
  team: z.string().trim().max(80).default(""),
  player: z.string().trim().max(80).default(""),
  fighter: z.string().trim().max(80).default(""),
  opponent: z.string().trim().max(80).default(""),
  window: z.enum(["all", "30d", "90d", "365d"]).default("90d"),
  sample: z.coerce.number().int().min(5).max(100).default(5)
});

export const betFiltersSchema = z.object({
  state: z.enum(["ALL", "OPEN", "SETTLED"]).default("ALL"),
  sport: z
    .enum(["ALL", "BASKETBALL", "BASEBALL", "HOCKEY", "FOOTBALL", "MMA", "BOXING", "OTHER"])
    .default("ALL"),
  market: z
    .enum([
      "ALL",
      "spread",
      "moneyline",
      "total",
      "team_total",
      "player_points",
      "player_rebounds",
      "player_assists",
      "player_threes",
      "fight_winner",
      "method_of_victory",
      "round_total",
      "round_winner",
      "other"
    ])
    .default("ALL"),
  sportsbook: z.string().default("all")
});
