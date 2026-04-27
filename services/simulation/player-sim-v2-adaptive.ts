import { buildPlayerSimV2, type PlayerSimV2Input, type PlayerSimV2Output } from "./player-sim-v2";
import { buildNbaMinutesUsageProjection, type NbaMinutesUsageInput } from "./nba-minutes-usage-model";
import { applyPlayerAdaptiveAdjustment } from "./sim-adaptive-layer";
import { buildMarketIntelligenceSignal } from "./sim-market-intelligence-layer";
import { buildClvSharpSignal } from "./sim-clv-sharp-layer";
import { buildBetSizingRecommendation } from "./sim-bankroll-sizing-engine";
import type { SimTuningParams } from "./sim-tuning";

export type AdaptiveSimInput = PlayerSimV2Input & {
  nbaContext?: NbaMinutesUsageInput;
  market?: {
    averageOdds?: number | null;
    bestAvailableOdds?: number | null;
    lineMovement?: number | null;
    bookCount?: number | null;
    marketDeltaAmerican?: number | null;
    expectedValuePct?: number | null;
    side?: string | null;
  };
  clv?: {
    entryOdds?: number | null;
    currentOdds?: number | null;
    closingOdds?: number | null;
    entryLine?: number | null;
    currentLine?: number | null;
    closingLine?: number | null;
  };
  bankroll?: number;
};

export function buildAdaptivePlayerSimV2(
  input: AdaptiveSimInput,
  tuning?: SimTuningParams
): PlayerSimV2Output & { betSizing?: any; nbaRoleAnalysis?: any } {
  let workingInput: PlayerSimV2Input = { ...input };
  let reasons: string[] = [];
  let riskFlags: string[] = [];

  // Step 1: Project NBA minutes + usage (CORE)
  let nbaRoleAnalysis = null;
  if (input.nbaContext) {
    nbaRoleAnalysis = buildNbaMinutesUsageProjection(input.nbaContext);

    // Override minutes and usage with projections
    workingInput.minutes = nbaRoleAnalysis.projectedMinutes;
    workingInput.usageRate = nbaRoleAnalysis.projectedUsageRate;

    // Feed reasoning
    reasons.unshift(...nbaRoleAnalysis.minutesReasons);
    reasons.unshift(...nbaRoleAnalysis.usageReasons);
    riskFlags.push(...nbaRoleAnalysis.riskFlags);
  }

  // Step 2: Run base V2 with projected minutes/usage
  const base = buildPlayerSimV2(workingInput, tuning);

  // Preserve base reasons
  reasons.unshift(...base.reasons);
  let confidence = base.confidence;

  // Adjust confidence based on role tier and minutes uncertainty
  if (nbaRoleAnalysis) {
    const minuteConfidencePenalty = (1 - nbaRoleAnalysis.minutesConfidence) * 0.1;
    confidence = Math.max(0.2, confidence - minuteConfidencePenalty);

    // LOW/OUT roles should significantly suppress confidence
    if (nbaRoleAnalysis.roleTier === "OUT") {
      return {
        ...base,
        decision: "PASS",
        confidence: 0.1,
        reasons: ["Player OUT - no play"],
        riskFlags: ["Out of game"],
        nbaRoleAnalysis
      };
    }

    if (nbaRoleAnalysis.roleTier === "LOW") {
      confidence *= 0.6;
      riskFlags.push("Low-tier role minutes - high volatility");
    }
  }

  // Step 3: Adaptive adjustments
  if (input.trend && input.trend.longAvg > 0) {
    const adaptive = applyPlayerAdaptiveAdjustment(base.rawMean, {
      playerId: input.player,
      propType: input.propType,
      recentAvg: input.trend.recentAvg,
      longAvg: input.trend.longAvg
    });

    reasons.unshift(`Adaptive blend (${(adaptive.weights.recentWeight * 100).toFixed(0)}% recent)`);
  }

  // Step 4: Market intelligence
  let marketSignal = null;
  if (input.market) {
    marketSignal = buildMarketIntelligenceSignal({
      odds: input.odds,
      averageOdds: input.market.averageOdds,
      bestAvailableOdds: input.market.bestAvailableOdds,
      lineMovement: input.market.lineMovement,
      bookCount: input.market.bookCount,
      marketDeltaAmerican: input.market.marketDeltaAmerican,
      expectedValuePct: input.market.expectedValuePct,
      side: input.market.side
    });

    reasons.unshift(...marketSignal.reasons);
    riskFlags.push(...marketSignal.riskFlags);
    confidence = Math.max(0, Math.min(0.95, confidence + marketSignal.confidenceShift));
  }

  // Step 5: CLV signal
  let clvSignal = null;
  if (input.clv || input.market) {
    clvSignal = buildClvSharpSignal({
      entryOdds: input.clv?.entryOdds,
      currentOdds: input.clv?.currentOdds ?? input.odds,
      closingOdds: input.clv?.closingOdds,
      entryLine: input.clv?.entryLine,
      currentLine: input.clv?.currentLine ?? input.line,
      closingLine: input.clv?.closingLine
    });

    if (clvSignal.sharp) {
      reasons.unshift(`Sharp money detected (${clvSignal.direction})`);
      confidence = Math.min(0.95, confidence + 0.08);
    }
    if (clvSignal.riskFlags?.length) {
      riskFlags.push(...clvSignal.riskFlags);
    }
  }

  // Step 6: Bet sizing
  let betSizing = null;
  if (input.bankroll && base.edgePct > 1) {
    betSizing = buildBetSizingRecommendation({
      bankroll: input.bankroll,
      edgePct: base.edgePct,
      confidence,
      odds: input.odds,
      nbaRoleTier: nbaRoleAnalysis?.roleTier
    });
  }

  return {
    ...base,
    reasons: Array.from(new Set(reasons)), // Deduplicate
    riskFlags,
    confidence: Math.max(0.2, Math.min(0.95, confidence)),
    betSizing,
    nbaRoleAnalysis
  };
}
