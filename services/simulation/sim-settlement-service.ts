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
  const openPredictions = await prisma.simPrediction.findMany({
    where: { result: "OPEN" },
    orderBy: { createdAt: "asc" },
    take: 500
  });

  const errors: string[] = [];
  let settledCount = 0;

  for (const prediction of openPredictions) {
    try {
      if (!prediction.playerId) continue;

      const game = await prisma.game.findFirst({
        where: {
          OR: [
            { externalEventId: prediction.eventId },
            { id: prediction.eventId }
          ]
        },
        include: {
          playerGameStats: {
            where: { playerId: prediction.playerId }
          }
        }
      });

      const stat = game?.playerGameStats?.[0];
      if (!stat) continue;

      const actualValue = extractStat(stat.statsJson, prediction.propType);
      if (actualValue === null) continue;

      const result = determineResult(prediction.side, prediction.line, actualValue);
      await prisma.simPrediction.update({
        where: { id: prediction.id },
        data: { result, actualValue, settledAt: new Date() }
      });

      settledCount++;
    } catch (err) {
      errors.push(`Failed to settle ${prediction.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    settledCount,
    totalOpen: openPredictions.length,
    errors
  };
}
