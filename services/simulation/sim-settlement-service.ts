import { prisma } from "@/lib/db/prisma";
import type { MarketType } from "@prisma/client";

function extractStat(statsJson: any, propType: MarketType): number | null {
  if (!statsJson) return null;

  switch (propType as string) {
    case "player_points":
      return statsJson.points ?? null;
    case "player_rebounds":
      return statsJson.rebounds ?? null;
    case "player_assists":
      return statsJson.assists ?? null;
    case "player_strikeouts":
      return statsJson.strikeouts ?? null;
    case "player_home_runs":
      return statsJson.homeRuns ?? null;
    case "player_rbis":
      return statsJson.rbis ?? null;
    case "player_hits":
      return statsJson.hits ?? null;
    case "player_blocks":
      return statsJson.blocks ?? null;
    case "player_steals":
      return statsJson.steals ?? null;
    default:
      return null;
  }
}

function determineResult(
  side: string,
  line: number,
  actual: number
): "WIN" | "LOSS" | "PUSH" {
  const tolerance = 0.01;

  if (Math.abs(actual - line) < tolerance) {
    return "PUSH";
  }

  if (side.toLowerCase() === "over") {
    return actual > line ? "WIN" : "LOSS";
  } else if (side.toLowerCase() === "under") {
    return actual < line ? "WIN" : "LOSS";
  }

  return "LOSS";
}

export async function settleSimPredictions() {
  // Settlement disabled - database schema not yet set up
  return {
    settledCount: 0,
    totalOpen: 0,
    errors: []
  };
}
