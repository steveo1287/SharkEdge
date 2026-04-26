import { buildAdvancedNbaFeatures } from "@/services/simulation/nba-advanced-feature-engine";
import { getNbaDecisionContext } from "@/services/simulation/nba-decision-context";
import { getNbaSynergyContext } from "@/services/simulation/nba-synergy-context";
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
  modelVersion: "nba-intel-v5";
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
  const [comparison, awayImpact, homeImpact, decisionContext, synergyContext] = await Promise.all([
    compareNbaProfilesReal(awayTeam, homeTeam),
    getNbaLineupImpact(awayTeam),
    getNbaLineupImpact(homeTeam),
    getNbaDecisionContext(awayTeam, homeTeam),
    getNbaSynergyContext(awayTeam, homeTeam)
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
    },
    {
      key: "synergy_context",
      label: "Synergy matchup edge",
      value: synergyContext.synergySideEdge,
      weight: 1,
      contribution: synergyContext.synergySideEdge,
      explanation: "Coach, player, team, play-type, shot-profile, defensive-scheme, star, and bench creation matchup context."
    }
  ];

  const projectedHomeEdge = rounded(advanced.sideEdge + decisionContext.decisionEdge + synergyContext.synergySideEdge);
  const projectedTotalShift = rounded(advanced.totalEdge + decisionContext.totalContextEdge + synergyContext.synergyTotalEdge);
  const volatilityIndex = rounded(clamp(advanced.volatilityEdge * decisionContext.volatilityContext * synergyContext.synergyVolatility, 0.72, 2.15));
  const combinedModelRisk = rounded(
    advanced.modelRiskPenalty +
      Math.max(0, decisionContext.volatilityContext - 1) * 6 +
      Math.max(0, synergyContext.synergyVolatility - 1) * 7 +
      decisionContext.garbageTimeRisk * 3 +
      decisionContext.blowoutRisk * 2
  );
  const factorAgreement = factors.filter((item) => Math.sign(item.contribution) === Math.sign(projectedHomeEdge) && Math.abs(item.contribution) >= 0.35).length;
  const confidenceScore = rounded(
    clamp(
      48 +
        Math.abs(projectedHomeEdge) * 3.5 +
        factorAgreement * 2.0 +
        (advanced.dataCompleteness - 65) * 0.18 +
        decisionContext.confidenceAdjustment +
        synergyContext.confidenceAdjustment -
        combinedModelRisk,
      18,
      95
    )
  );

  return {
    modelVersion: "nba-intel-v5",
    awayTeam,
    homeTeam,
    projectedHomeEdge,
    projectedTotalShift,
    volatilityIndex,
    confidenceScore,
    factorStrength: strength(confidenceScore),
    dataSource: `${comparison.away.source}/${comparison.home.source}+lineups+advanced-features+decision-context:${decisionContext.source}+synergy:${synergyContext.source}`,
    dataCompleteness: advanced.dataCompleteness,
    correlationRisk: advanced.correlationRisk,
    modelRiskPenalty: combinedModelRisk,
    factors,
    notes: [
      homeImpact.summary,
      awayImpact.summary,
      ...advanced.notes,
      ...decisionContext.notes,
      ...synergyContext.notes
    ]
  };
}
