import { prisma } from "@/lib/prisma";
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
  const tolerance = 0.01; // Allow floating point comparison tolerance

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
      if (!pred.playerId || !pred.eventId) {
        continue;
      }

      // Find the player's game stats for this event
      const stat = await prisma.playerGameStat.findFirst({
        where: {
          playerId: pred.playerId,
          gameId: pred.eventId
        }
      });

      if (!stat) {
        continue; // Game not settled yet
      }

      const statsJson = typeof stat.statsJson === "string" ? JSON.parse(stat.statsJson) : stat.statsJson;
      const actual = extractStat(statsJson, pred.propType);

      if (actual === null) {
        errors.push(`Cannot extract ${pred.propType} from stats for ${pred.playerName}`);
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
      errors.push(`Error settling prediction ${pred.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    settledCount,
    totalOpen: openPredictions.length,
    errors
  };
}

export async function calibrateSimulationByPropType() {
  const settled = await prisma.simPrediction.findMany({
    where: { result: { not: "OPEN" } }
  });

  const byPropType = new Map<string, any[]>();

  for (const pred of settled) {
    if (!byPropType.has(pred.propType)) {
      byPropType.set(pred.propType, []);
    }
    byPropType.get(pred.propType)!.push(pred);
  }

  const calibration: Record<string, any> = {};

  for (const [propType, preds] of byPropType) {
    const wins = preds.filter((p) => p.result === "WIN").length;
    const losses = preds.filter((p) => p.result === "LOSS").length;
    const pushes = preds.filter((p) => p.result === "PUSH").length;
    const total = wins + losses + pushes;

    const simAverage = preds.reduce((sum, p) => sum + (p.side.toLowerCase() === "over" ? p.simOverPct : p.simUnderPct), 0) / preds.length;
    const actualHitRate = wins / total;
    const calibrationDelta = actualHitRate - simAverage;

    calibration[propType] = {
      sampleSize: total,
      hitRate: actualHitRate,
      simAverage,
      calibrationDelta,
      wins,
      losses,
      pushes
    };
  }

  return calibration;
}

export async function getTopEdgeOpportunities(limit = 10) {
  const settled = await prisma.simPrediction.findMany({
    where: { result: "WIN" },
    orderBy: { edgePct: "desc" },
    take: limit
  });

  return settled.map((p) => ({
    playerName: p.playerName,
    propType: p.propType,
    line: p.line,
    side: p.side,
    edge: p.edgePct,
    confidence: p.confidence,
    actualValue: p.actualValue
  }));
}

export async function getCalibrationBuckets(propType?: string) {
  const where = propType ? { propType } : {};
  const settled = await prisma.simPrediction.findMany({
    where: { ...where, result: { not: "OPEN" } }
  });

  // Group by confidence buckets
  const buckets: Record<string, { count: number; wins: number; losses: number; hitRate: number }> = {
    "0.55-0.60": { count: 0, wins: 0, losses: 0, hitRate: 0 },
    "0.60-0.70": { count: 0, wins: 0, losses: 0, hitRate: 0 },
    "0.70-0.80": { count: 0, wins: 0, losses: 0, hitRate: 0 },
    "0.80-0.90": { count: 0, wins: 0, losses: 0, hitRate: 0 }
  };

  for (const pred of settled) {
    let bucket: string;
    if (pred.confidence < 0.60) bucket = "0.55-0.60";
    else if (pred.confidence < 0.70) bucket = "0.60-0.70";
    else if (pred.confidence < 0.80) bucket = "0.70-0.80";
    else bucket = "0.80-0.90";

    buckets[bucket].count++;
    if (pred.result === "WIN") {
      buckets[bucket].wins++;
    } else if (pred.result === "LOSS") {
      buckets[bucket].losses++;
    }
  }

  // Calculate hit rates
  for (const bucket of Object.values(buckets)) {
    if (bucket.count > 0) {
      bucket.hitRate = bucket.wins / bucket.count;
    }
  }

  return buckets;
}
