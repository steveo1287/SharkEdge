import { NextResponse } from "next/server";

import { getEdgesApi } from "@/services/feed/feed-api";
import { buildMlbIntelligenceEnvelope } from "@/services/modeling/mlb-intelligence-envelope-service";
import { buildMlbDecisionGate } from "@/services/modeling/mlb-conformal-gating-service";
import { buildMlbCalibratedOutcomeMath } from "@/services/modeling/mlb-outcome-math-service";
import { buildMlbPrimaryDecisionScore } from "@/services/modeling/mlb-decision-score-service";
import { buildMlbPromotionDecision } from "@/services/modeling/mlb-promotion-orchestrator";
import { buildDecisionFusion } from "@/services/decision/decision-fusion-service";
import { calibrateDecisionFusion } from "@/services/decision/decision-fusion-calibration-service";
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

    const rawDecisionFusion = topGame ? buildDecisionFusion({
      eventId: topGame.eventId,
      marketType: String(topGame.marketType ?? "moneyline"),
      league: String(topGame.league ?? "MLB"),
      simScore: Number(promotionDecision?.finalPromotionScore ?? primaryDecision?.primaryScore ?? 0),
      rawTrendScore: Number(topGame?.whyItGradesWell?.score ?? 0) * 10,
      marketScore: Number(topGame?.noVigProb ?? 0.5) * 10,
      calibrationScore: Number(topGame?.whyItGradesWell?.confidence ?? 0.55) * 10,
      uncertaintyPenalty: Number(envelope?.uncertaintyPenalty ?? 0.06),
      weatherDelta: Number(topGame?.mlbEliteSnapshot?.parkWeatherDelta ?? 0),
      volatility: Number(topGame?.mlbEliteSnapshot?.bullpenFatigueDelta ?? 0)
    }) : null;
    const decisionFusion = rawDecisionFusion ? calibrateDecisionFusion(rawDecisionFusion) : null;

    return NextResponse.json({
      ok: true,
      game: topGame,
      envelope,
      gate,
      outcomeMath,
      primaryDecision,
      promotionDecision,
      decisionFusion,
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
