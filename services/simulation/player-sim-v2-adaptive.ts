import { buildPlayerSimV2, type PlayerSimV2Input, type PlayerSimV2Output } from "./player-sim-v2";
import { getNbaPlayerProjectionContext, type NbaPlayerProjectionContext } from "@/services/nba/nba-player-projection-context-service";
import { applyPlayerAdaptiveAdjustment } from "./sim-adaptive-layer";
import { buildMarketIntelligenceSignal } from "./sim-market-intelligence-layer";
import { buildClvSharpSignal } from "./sim-clv-sharp-layer";
import { buildBetSizingRecommendation } from "./sim-bankroll-sizing-engine";
import type { SimTuningParams } from "./sim-tuning";

export type AdaptiveSimInput = PlayerSimV2Input & {
  nbaContext?: NbaPlayerProjectionContext;
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

export async function buildAdaptivePlayerSimV2(
  input: AdaptiveSimInput,
  tuning?: SimTuningParams
): Promise<PlayerSimV2Output & { betSizing?: any; nbaRoleAnalysis?: any }> {
  let workingInput: PlayerSimV2Input = { ...input };
  let reasons: string[] = [];
  let riskFlags: string[] = [];

  // Step 1: Project NBA minutes + usage (CORE)
  let nbaRoleAnalysis = null;
  let nbaContext = input.nbaContext;

  if (nbaContext && nbaContext.projectedMinutes) {
    nbaRoleAnalysis = {
      projectedMinutes: nbaContext.projectedMinutes,
      projectedUsageRate: workingInput.usageRate || 0.25,
      minutesConfidence: 0.85,
      usageConfidence: 0.85,
      roleTier: "STARTER" as const,
      minutesReasons: ["DataBallr projection"],
      usageReasons: ["Input usage rate"],
      riskFlags: []
    };

    // Override minutes with projections
    workingInput.minutes = nbaRoleAnalysis.projectedMinutes;

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

    if (clvSignal.sharpMoneyScore > 0.5) {
      reasons.unshift(`Sharp money detected (score: ${clvSignal.sharpMoneyScore.toFixed(2)})`);
      confidence = Math.min(0.95, confidence + 0.08);
    }
    if (clvSignal.reasons?.length) {
      reasons.push(...clvSignal.reasons);
    }
  }

  // Step 6: Bet sizing
  let betSizing = null;
  if (input.bankroll && base.edgePct > 1) {
    betSizing = buildBetSizingRecommendation({
      bankroll: input.bankroll,
      oddsAmerican: input.odds,
      probability: base.probability,
      confidence,
      edgePct: base.edgePct,
      decision: "ATTACK"
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
