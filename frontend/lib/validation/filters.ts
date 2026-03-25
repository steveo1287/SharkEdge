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
