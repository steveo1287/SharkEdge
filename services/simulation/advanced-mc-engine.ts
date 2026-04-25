/**
 * Advanced Monte Carlo Engine for SharkEdge
 *
 * Wraps ContextualGameSimulation with market regime-aware adjustments:
 * - SHARP regimes: Runs deeper simulations (10k samples) for higher precision
 * - SQUARE regimes: Applies variance reduction and tightens percentiles
 * - CONFLICT regimes: Flags uncertainty and widens confidence intervals
 *
 * Produces EnhancedGameSimulationSummary with regime context and optional deep-dive results.
 */

import type { ContextualGameSimulationInput, ContextualGameSimulationSummary } from "./contextual-game-sim";
import type { MarkovRegimeState } from "./markov-regime-classifier";
import { simulateContextualGame } from "./contextual-game-sim";

export type EnhancedGameSimulationSummary = ContextualGameSimulationSummary & {
  regime: {
    classification: string;
    confidence: number;
    reasoning: string[];
  };
  adjustments: {
    varianceAdjustment: number; // multiplier: <1 for SQUARE (tighter), >1 for CONFLICT (wider), ~1 for SHARP
    sharpConfidenceBoost: boolean; // true if SHARP regime ran deep simulation
    conflictFlag: boolean; // true if CONFLICT regime detected
    reason: string;
  };
  deepDiveResult?: {
    sampleCount: number;
    projectedHomeScore: number;
    projectedAwayScore: number;
    projectedTotal: number;
    projectedSpreadHome: number;
    distribution: {
      totalStdDev: number;
      homeScoreStdDev: number;
      awayScoreStdDev: number;
      p10Total: number;
      p50Total: number;
      p90Total: number;
    };
  };
};

/**
 * Enhances a baseline simulation with market regime adjustments
 * Optionally runs deeper simulations for SHARP regimes
 */
export async function enhanceSimulationWithRegime(
  baselineSimulation: ContextualGameSimulationSummary,
  input: ContextualGameSimulationInput,
  regime: MarkovRegimeState,
  runDeepSimulation: boolean = true
): Promise<EnhancedGameSimulationSummary> {
  let varianceAdjustment = 1.0;
  let reason = "";
  let deepDiveResult: EnhancedGameSimulationSummary["deepDiveResult"] | undefined;
  const sharpConfidenceBoost = false;
  const conflictFlag = regime.classification === "CONFLICT";

  // Regime-specific adjustments
  if (regime.classification === "SHARP") {
    // Sharp markets: keep base variance, optionally run deeper simulation
    varianceAdjustment = 1.0;
    reason = `Sharp market detected (confidence: ${(regime.confidence * 100).toFixed(1)}%). Recommend deep-dive simulation.`;

    if (runDeepSimulation) {
      // Run with 10x samples for sharp regimes where precision matters
      deepDiveResult = await runDeepDiveSimulation(input, 10000);
      (sharpConfidenceBoost as any) = true;
    }
  } else if (regime.classification === "SQUARE") {
    // Square markets: reduce variance (tighter estimate, lines are more predictable)
    const squarenessFactor = Math.max(0.6, 1.0 - regime.sharpnessScore / 100);
    varianceAdjustment = squarenessFactor;
    reason = `Square market detected (public money dominant, ${regime.squarenessIndicators.linestickyness.toFixed(1)} stickiness). Variance reduced by ${((1 - varianceAdjustment) * 100).toFixed(1)}%.`;
  } else if (regime.classification === "CONFLICT") {
    // Conflict: widen variance (higher uncertainty)
    const conflictFactor = 1.0 + regime.conflictScore / 100 * 0.5;
    varianceAdjustment = conflictFactor;
    reason = `Mixed signals detected (conflict score: ${regime.conflictScore}). Widened confidence intervals by ${((varianceAdjustment - 1) * 100).toFixed(1)}%.`;
  }

  // Apply variance adjustments to distribution percentiles
  const adjustedDistribution = {
    ...baselineSimulation.distribution,
    totalStdDev: baselineSimulation.distribution.totalStdDev * varianceAdjustment,
    homeScoreStdDev: baselineSimulation.distribution.homeScoreStdDev * varianceAdjustment,
    awayScoreStdDev: baselineSimulation.distribution.awayScoreStdDev * varianceAdjustment,
    p10Total: applyVarianceAdjustment(
      baselineSimulation.distribution.p50Total,
      baselineSimulation.distribution.p10Total,
      varianceAdjustment,
      "lower"
    ),
    p90Total: applyVarianceAdjustment(
      baselineSimulation.distribution.p50Total,
      baselineSimulation.distribution.p90Total,
      varianceAdjustment,
      "upper"
    )
  };

  return {
    ...baselineSimulation,
    distribution: adjustedDistribution,
    regime: {
      classification: regime.classification,
      confidence: regime.confidence,
      reasoning: regime.reasoning
    },
    adjustments: {
      varianceAdjustment,
      sharpConfidenceBoost: Boolean(deepDiveResult),
      conflictFlag,
      reason
    },
    deepDiveResult
  };
}

/**
 * Runs a deep-dive simulation with higher sample count for sharp markets
 */
async function runDeepDiveSimulation(
  input: ContextualGameSimulationInput,
  sampleCount: number
): Promise<EnhancedGameSimulationSummary["deepDiveResult"]> {
  // Run simulation with elevated sample count
  const deepResult = simulateContextualGame({
    ...input,
    samples: sampleCount
  });

  return {
    sampleCount,
    projectedHomeScore: deepResult.projectedHomeScore,
    projectedAwayScore: deepResult.projectedAwayScore,
    projectedTotal: deepResult.projectedTotal,
    projectedSpreadHome: deepResult.projectedSpreadHome,
    distribution: deepResult.distribution
  };
}

/**
 * Applies variance adjustment to a percentile value
 * Maintains the midpoint while expanding/contracting the range
 */
function applyVarianceAdjustment(
  midpoint: number,
  percentileValue: number,
  adjustment: number,
  direction: "upper" | "lower"
): number {
  const delta = Math.abs(percentileValue - midpoint);
  const adjustedDelta = delta * adjustment;

  if (direction === "upper") {
    return midpoint + adjustedDelta;
  } else {
    return midpoint - adjustedDelta;
  }
}

/**
 * Quick regime check without full deep simulation
 * Used for batch analysis or pre-filtering
 */
export function getRegimeAdjustmentFactor(regime: MarkovRegimeState): number {
  if (regime.classification === "SHARP") {
    return 1.0;
  } else if (regime.classification === "SQUARE") {
    return Math.max(0.6, 1.0 - regime.sharpnessScore / 100);
  } else {
    return 1.0 + regime.conflictScore / 100 * 0.5;
  }
}
