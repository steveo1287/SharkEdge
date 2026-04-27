import { prisma } from "@/lib/db/prisma";
import type { MarketType } from "@prisma/client";

function extractStat(statsJson: any, propType: MarketType): number | null {
  if (!statsJson) return null;

  switch (propType) {
    case "player_points":
      return statsJson.points ?? null;
    case "player_rebounds":
      return statsJson.rebounds ?? null;
    case "player_assists":
      return statsJson.assists ?? null;
    case "player_passes_completed":
      return statsJson.passCompletions ?? null;
    case "player_pass_yards":
      return statsJson.passYards ?? null;
    case "player_rush_yards":
      return statsJson.rushYards ?? null;
    case "player_receiving_yards":
      return statsJson.receivingYards ?? null;
    case "player_pitcher_strikeouts":
      return statsJson.strikeouts ?? null;
    case "player_pitcher_hits_allowed":
      return statsJson.hitsAllowed ?? null;
    case "player_pitcher_home_runs_allowed":
      return statsJson.homeRunsAllowed ?? null;
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
  const openPredictions = await prisma.simPrediction.findMany({
    where: { result: "OPEN" }
  });

  let settledCount = 0;
  let errors: string[] = [];

  for (const pred of openPredictions) {
    try {
      if (!pred.playerId || !pred.eventId) continue;

      const stat = await prisma.playerGameStat.findFirst({
        where: {
          playerId: pred.playerId,
          gameId: pred.eventId
        }
      });

      if (!stat) continue;

      const statsJson = typeof stat.statsJson === "string" ? JSON.parse(stat.statsJson) : stat.statsJson;
      const actual = extractStat(statsJson, pred.propType);

      if (actual === null) {
        errors.push(`Cannot extract ${pred.propType} for ${pred.playerName}`);
        continue;
      }

      const result = determineResult(pred.side, pred.line, actual);

      await prisma.simPrediction.update({
        where: { id: pred.id },
        data: {
          result,
          actualValue: actual,
          settledAt: new Date()
        }
      });

      settledCount++;
    } catch (error) {
      errors.push(`Error settling ${pred.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    settledCount,
    totalOpen: openPredictions.length,
    errors
  };
}
