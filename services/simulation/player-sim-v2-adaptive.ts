import { buildPlayerSimV2, type PlayerSimV2Input, type PlayerSimV2Output } from "./player-sim-v2";
import { applyPlayerAdaptiveAdjustment } from "./sim-adaptive-layer";
import type { SimTuningParams } from "./sim-tuning";

export function buildAdaptivePlayerSimV2(input: PlayerSimV2Input, tuning?: SimTuningParams): PlayerSimV2Output {
  const base = buildPlayerSimV2(input, tuning);

  if (!input.trend || input.trend.longAvg <= 0) {
    return base;
  }

  const adaptive = applyPlayerAdaptiveAdjustment(base.rawMean, {
    playerId: input.player,
    propType: input.propType,
    recentAvg: input.trend.recentAvg,
    longAvg: input.trend.longAvg,
    recentMinutes: input.trend.recentMinutes ?? null,
    longMinutes: input.trend.longMinutes ?? null
  });

  const adaptiveInput: PlayerSimV2Input = {
    ...input,
    teamTotal: input.teamTotal,
    usageRate: Math.max(0.01, input.usageRate * adaptive.adjustmentFactor),
    sims: input.sims,
    seed: `${input.seed ?? input.player}:adaptive:${adaptive.adjustmentFactor.toFixed(4)}:${adaptive.weights.volatility.toFixed(4)}`
  };

  const rerun = buildPlayerSimV2(adaptiveInput, tuning);

  return {
    ...rerun,
    rawMean: Number(adaptive.adjustedMean.toFixed(4)),
    reasons: [
      `Adaptive blend (${(adaptive.weights.recentWeight * 100).toFixed(0)}% recent)`,
      ...rerun.reasons
    ],
    riskFlags: adaptive.weights.volatility > 0.28
      ? [...rerun.riskFlags, "Elevated player volatility"]
      : rerun.riskFlags
  };
}
