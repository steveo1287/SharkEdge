import { prisma } from "@/lib/prisma";
import type { MarketType } from "@prisma/client";

export type SimTuningParams = {
  calibrationScale: number;
  varianceScale: number;
  matchupWeight: number;
  paceWeight: number;
};

const DEFAULT_PARAMS: SimTuningParams = {
  calibrationScale: 1.0,
  varianceScale: 1.0,
  matchupWeight: 1.0,
  paceWeight: 1.0
};

export async function getSimTuning(scope: string = "global"): Promise<SimTuningParams> {
  try {
    const tuning = await prisma.simTuning.findUnique({
      where: { scope }
    });
    return tuning ? (tuning.params as SimTuningParams) : DEFAULT_PARAMS;
  } catch {
    return DEFAULT_PARAMS;
  }
}

export async function getSimTuningByPropType(propType: MarketType): Promise<SimTuningParams> {
  const scope = propType.toLowerCase();
  return getSimTuning(scope);
}

export async function saveSimTuning(scope: string, params: SimTuningParams, brierScore: number, sampleSize: number) {
  try {
    await prisma.simTuning.upsert({
      where: { scope },
      create: {
        scope,
        params,
        brierScore,
        sampleSize
      },
      update: {
        params,
        brierScore,
        sampleSize
      }
    });
  } catch (error) {
    console.error("Failed to save sim tuning:", error);
  }
}

function calculateBrierScore(logs: any[]): number {
  if (logs.length === 0) return Infinity;

  const sumSquaredError = logs.reduce((sum, log) => {
    const p = log.side.toLowerCase() === "over" ? log.simOverPct : log.simUnderPct;
    const actual = log.result === "WIN" ? 1 : 0;
    return sum + Math.pow(p - actual, 2);
  }, 0);

  return sumSquaredError / logs.length;
}

function simulateWithParams(logs: any[], params: SimTuningParams, propType?: string): number {
  const adjusted = logs.map((log) => {
    let p = log.side.toLowerCase() === "over" ? log.simOverPct : log.simUnderPct;

    // Apply calibration scale
    p = 0.5 + (p - 0.5) * params.calibrationScale;

    // Clamp to valid probability range
    p = Math.max(0.01, Math.min(0.99, p));

    return {
      ...log,
      adjustedProb: p,
      actual: log.result === "WIN" ? 1 : 0
    };
  });

  return adjusted.reduce((sum, log) => sum + Math.pow(log.adjustedProb - log.actual, 2), 0) / adjusted.length;
}

async function getLogs(propType?: string, minSamples = 50): Promise<any[]> {
  const where: any = {
    result: { in: ["WIN", "LOSS"] }
  };

  if (propType) {
    where.propType = propType;
  }

  const logs = await prisma.simPrediction.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 1000 // Use recent 1000 predictions
  });

  // Need minimum samples to avoid overfitting
  if (logs.length < minSamples) {
    return [];
  }

  return logs;
}

export async function autoTuneModel(propType?: string): Promise<{ params: SimTuningParams; brierScore: number; sampleSize: number } | null> {
  const logs = await getLogs(propType, 50);

  if (logs.length === 0) {
    console.log(`Insufficient data for tuning${propType ? ` (${propType})` : ""}: need 50+ settled predictions`);
    return null;
  }

  let params: SimTuningParams = { ...DEFAULT_PARAMS };
  const step = 0.02;
  const iterations = 25;
  const baselineScore = calculateBrierScore(logs);

  for (let iter = 0; iter < iterations; iter++) {
    const keys: (keyof SimTuningParams)[] = ["calibrationScale", "varianceScale", "matchupWeight", "paceWeight"];

    for (const key of keys) {
      // Try upward adjustment
      const upParams = { ...params, [key]: params[key] + step };
      const upScore = simulateWithParams(logs, upParams, propType);

      // Try downward adjustment
      const downParams = { ...params, [key]: params[key] - step };
      const downScore = simulateWithParams(logs, downParams, propType);

      // Keep the best adjustment
      const currentScore = simulateWithParams(logs, params, propType);

      if (upScore < currentScore && upScore < downScore) {
        params[key] += step;
      } else if (downScore < currentScore && downScore < upScore) {
        params[key] -= step;
      }

      // Keep parameters in reasonable bounds
      params[key] = Math.max(0.5, Math.min(1.5, params[key]));
    }
  }

  const finalScore = simulateWithParams(logs, params, propType);
  const improvement = baselineScore - finalScore;

  console.log(`Tuning complete${propType ? ` for ${propType}` : ""}:`);
  console.log(`  Baseline Brier: ${baselineScore.toFixed(4)}`);
  console.log(`  Tuned Brier: ${finalScore.toFixed(4)}`);
  console.log(`  Improvement: ${improvement.toFixed(4)} (${((improvement / baselineScore) * 100).toFixed(1)}%)`);
  console.log(`  Sample size: ${logs.length}`);
  console.log(`  Params:`, params);

  return {
    params,
    brierScore: finalScore,
    sampleSize: logs.length
  };
}

export async function autoTuneAllPropTypes(): Promise<Record<string, any>> {
  const propTypes: MarketType[] = [
    "player_points",
    "player_rebounds",
    "player_assists",
    "player_blocks",
    "player_steals"
  ];

  const results: Record<string, any> = {};
  const globalTuning = await autoTuneModel();

  if (globalTuning) {
    await saveSimTuning("global", globalTuning.params, globalTuning.brierScore, globalTuning.sampleSize);
    results.global = globalTuning;
  }

  for (const propType of propTypes) {
    const tuning = await autoTuneModel(propType);
    if (tuning) {
      await saveSimTuning(propType, tuning.params, tuning.brierScore, tuning.sampleSize);
      results[propType] = tuning;
    }
  }

  return results;
}

export async function getCurrentTuningStats(): Promise<Record<string, any>> {
  const tunings = await prisma.simTuning.findMany();
  const stats: Record<string, any> = {};

  for (const tuning of tunings) {
    stats[tuning.scope] = {
      params: tuning.params,
      brierScore: tuning.brierScore,
      sampleSize: tuning.sampleSize,
      lastUpdated: tuning.updatedAt
    };
  }

  return stats;
}
