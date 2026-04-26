import { buildAdvancedNbaFeatures } from "@/services/simulation/nba-advanced-feature-engine";
import { getNbaDecisionContext } from "@/services/simulation/nba-decision-context";
import { compareNbaProfilesReal } from "@/services/simulation/nba-team-analytics";
import { getNbaLineupImpact } from "@/services/simulation/nba-player-impact";

export type NbaIntelFactor = {
  key: string;
  label: string;
  value: number;
  weight: number;
  contribution: number;
  explanation: string;
};

export type NbaIntelResult = {
  modelVersion: "nba-intel-v4";
  awayTeam: string;
  homeTeam: string;
  projectedHomeEdge: number;
  projectedTotalShift: number;
  volatilityIndex: number;
  confidenceScore: number;
  factorStrength: "elite" | "strong" | "medium" | "thin";
  dataSource: string;
  dataCompleteness: number;
  correlationRisk: number;
  modelRiskPenalty: number;
  factors: NbaIntelFactor[];
  notes: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function rounded(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function strength(score: number): NbaIntelResult["factorStrength"] {
  if (score >= 72) return "elite";
  if (score >= 61) return "strong";
  if (score >= 49) return "medium";
  return "thin";
}

export async function buildNbaIntel(awayTeam: string, homeTeam: string): Promise<NbaIntelResult> {
  const [comparison, awayImpact, homeImpact, decisionContext] = await Promise.all([
    compareNbaProfilesReal(awayTeam, homeTeam),
    getNbaLineupImpact(awayTeam),
    getNbaLineupImpact(homeTeam),
    getNbaDecisionContext(awayTeam, homeTeam)
  ]);

  const advanced = buildAdvancedNbaFeatures({ comparison, awayImpact, homeImpact });
  const factors: NbaIntelFactor[] = [
    ...advanced.features.map((item) => ({
      key: item.key,
      label: item.label,
      value: item.value,
      weight: item.sideWeight,
      contribution: item.sideContribution,
      explanation: item.explanation
    })),
    {
      key: "decision_context",
      label: "Decision-context edge",
      value: decisionContext.decisionEdge,
      weight: 1,
      contribution: decisionContext.decisionEdge,
      explanation: "Schedule, travel, referee, public bias, sharp split, matchup mechanics, bench, and game-script context."
    }
  ];

  const projectedHomeEdge = rounded(advanced.sideEdge + decisionContext.decisionEdge);
  const projectedTotalShift = rounded(advanced.totalEdge + decisionContext.totalContextEdge);
  const volatilityIndex = rounded(clamp(advanced.volatilityEdge * decisionContext.volatilityContext, 0.72, 2));
  const combinedModelRisk = rounded(advanced.modelRiskPenalty + Math.max(0, decisionContext.volatilityContext - 1) * 6 + decisionContext.garbageTimeRisk * 3 + decisionContext.blowoutRisk * 2);
  const factorAgreement = factors.filter((item) => Math.sign(item.contribution) === Math.sign(projectedHomeEdge) && Math.abs(item.contribution) >= 0.35).length;
  const confidenceScore = rounded(
    clamp(
      48 + Math.abs(projectedHomeEdge) * 3.6 + factorAgreement * 2.1 + (advanced.dataCompleteness - 65) * 0.18 + decisionContext.confidenceAdjustment - combinedModelRisk,
      20,
      94
    )
  );

  return {
    modelVersion: "nba-intel-v4",
    awayTeam,
    homeTeam,
    projectedHomeEdge,
    projectedTotalShift,
    volatilityIndex,
    confidenceScore,
    factorStrength: strength(confidenceScore),
    dataSource: `${comparison.away.source}/${comparison.home.source}+lineups+advanced-features+decision-context:${decisionContext.source}`,
    dataCompleteness: advanced.dataCompleteness,
    correlationRisk: advanced.correlationRisk,
    modelRiskPenalty: combinedModelRisk,
    factors,
    notes: [
      homeImpact.summary,
      awayImpact.summary,
      ...advanced.notes,
      ...decisionContext.notes
    ]
  };
}
