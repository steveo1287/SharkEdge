import { z } from "zod";

export const betFormSchema = z.object({
  date: z.string().min(1, "Date is required."),
  sport: z.enum(["BASKETBALL", "BASEBALL", "HOCKEY", "FOOTBALL", "MMA", "BOXING", "OTHER"]),
  league: z.enum(["NBA", "MLB", "NHL", "NFL", "NCAAF", "UFC", "BOXING"]),
  marketType: z.enum([
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
  ]),
  side: z.string().min(1, "Side is required."),
  line: z
    .union([z.number(), z.nan(), z.null()])
    .transform((value) => (typeof value === "number" && !Number.isNaN(value) ? value : null)),
  oddsAmerican: z
    .number()
    .refine((value) => value >= -1000 && value <= 1000 && value !== 0, "Odds must be a valid American price."),
  sportsbookId: z.string().min(1, "Sportsbook is required."),
  stake: z.number().positive("Stake must be greater than zero."),
  notes: z.string().max(240).optional().default(""),
  tags: z.string().optional().default(""),
  gameId: z.string().optional(),
  playerId: z.string().optional()
});

export type BetFormSchema = z.infer<typeof betFormSchema>;
