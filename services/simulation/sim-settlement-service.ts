import { prisma } from "@/lib/db/prisma";
import { persistMlbPlayerPropCalibrationRows, type MlbPlayerPropCalibrationPersistRow } from "@/services/simulation/mlb-player-prop-calibration-persistence";
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
    case "player_pitcher_strikeouts":
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

function toMlbMarket(propType: MarketType): MlbPlayerPropCalibrationPersistRow["market"] | null {
  switch (propType as string) {
    case "player_hits": return "HITS";
    case "player_home_runs": return "HOME_RUN";
    case "player_pitcher_strikeouts":
    case "player_strikeouts": return "STRIKEOUTS";
    default: return null;
  }
}

function impliedProbability(americanOdds: number) {
  if (!Number.isFinite(americanOdds) || americanOdds === 0) return null;
  if (americanOdds < 0) return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
  return 100 / (americanOdds + 100);
}

function predictionModelProbability(prediction: { side: string; simOverPct: number; simUnderPct: number }) {
  const side = prediction.side.toUpperCase();
  if (side === "OVER") return prediction.simOverPct > 1 ? prediction.simOverPct / 100 : prediction.simOverPct;
  if (side === "UNDER") return prediction.simUnderPct > 1 ? prediction.simUnderPct / 100 : prediction.simUnderPct;
  return prediction.simOverPct > 1 ? prediction.simOverPct / 100 : prediction.simOverPct;
}

export async function settleSimPredictions() {
  const openPredictions = await prisma.simPrediction.findMany({
    where: { result: "OPEN" },
    orderBy: { createdAt: "asc" },
    take: 500
  });

  const errors: string[] = [];
  const calibrationRows: MlbPlayerPropCalibrationPersistRow[] = [];
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
      const settledAt = new Date();
      await prisma.simPrediction.update({
        where: { id: prediction.id },
        data: { result, actualValue, settledAt }
      });

      const market = toMlbMarket(prediction.propType);
      if (market && result !== "PUSH") {
        calibrationRows.push({
          rowKey: `sim:${prediction.id}`,
          sourceKey: "SIM_SETTLEMENT",
          eventId: prediction.eventId,
          gameId: game?.id ?? null,
          playerId: prediction.playerId,
          playerName: prediction.playerName,
          market,
          line: prediction.line,
          side: prediction.side.toUpperCase() as MlbPlayerPropCalibrationPersistRow["side"],
          modelProbability: predictionModelProbability(prediction),
          rawModelProbability: predictionModelProbability(prediction),
          confidence: prediction.confidence,
          won: result === "WIN",
          actualValue,
          book: null,
          oddsAmerican: prediction.bookOdds,
          impliedProbability: impliedProbability(prediction.bookOdds),
          settledAt: settledAt.toISOString(),
          metadataJson: {
            simPredictionId: prediction.id,
            league: prediction.league,
            edgePct: prediction.edgePct,
            result
          }
        });
      }

      settledCount++;
    } catch (err) {
      errors.push(`Failed to settle ${prediction.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const calibrationPersistence = await persistMlbPlayerPropCalibrationRows(calibrationRows);
  errors.push(...calibrationPersistence.warnings);

  return {
    settledCount,
    totalOpen: openPredictions.length,
    calibrationRowsPersisted: calibrationPersistence.persistedCount,
    calibrationRowsSkipped: calibrationPersistence.skippedCount,
    errors
  };
}
