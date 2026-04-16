import { NextResponse } from "next/server";

import { getEdgesApi } from "@/services/feed/feed-api";
import { buildMlbIntelligenceEnvelope } from "@/services/modeling/mlb-intelligence-envelope-service";
import { buildMlbDecisionGate } from "@/services/modeling/mlb-conformal-gating-service";
import { buildMlbCalibratedOutcomeMath } from "@/services/modeling/mlb-outcome-math-service";
import { buildMlbPrimaryDecisionScore } from "@/services/modeling/mlb-decision-score-service";
import { buildMlbPromotionDecision } from "@/services/modeling/mlb-promotion-orchestrator";
import { getActiveCalibrationAlerts } from "@/services/calibration/calibration-actionability-service";
import { getLatestDailyCalibrationSummary } from "@/services/calibration/daily-calibration-summary-service";

export async function GET() {
  try {
    const [edges, alerts, summary] = await Promise.all([
      getEdgesApi(),
      getActiveCalibrationAlerts(50),
      getLatestDailyCalibrationSummary()
    ]);

    const mlbGames = (edges.data ?? []).filter((item: any) => item.league === "MLB" && item.mlbEliteSnapshot);
    const topGame = mlbGames.sort((left: any, right: any) => (right.adjustedRankSignal ?? 0) - (left.adjustedRankSignal ?? 0))[0] ?? null;

    const envelope = topGame ? await buildMlbIntelligenceEnvelope(topGame.eventId) : null;
    const gate = envelope ? buildMlbDecisionGate(envelope) : null;
    const outcomeMath = topGame ? await buildMlbCalibratedOutcomeMath(topGame.eventId) : null;
    const primaryDecision = outcomeMath && gate ? buildMlbPrimaryDecisionScore(outcomeMath, gate) : null;
    const promotionDecision = outcomeMath && gate && envelope && primaryDecision
      ? buildMlbPromotionDecision({
          outcomeMath,
          gate,
          envelope,
          primaryDecision,
          marketImpliedProb: 0.5,
          lineupCertainty: 0.74,
          starterCertainty: 0.86,
          bullpenCertainty: 0.68,
          weatherCertainty: 0.71,
          trendConfirmationScore: 0.05
        })
      : null;

    return NextResponse.json({
      ok: true,
      game: topGame,
      envelope,
      gate,
      outcomeMath,
      primaryDecision,
      promotionDecision,
      modelHealth: {
        overall: summary?.report?.overall ?? null,
        alerts
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load MLB intelligence view." },
      { status: 500 }
    );
  }
}
