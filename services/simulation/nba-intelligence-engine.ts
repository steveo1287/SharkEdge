import { buildAdvancedNbaFeatures } from "@/services/simulation/nba-advanced-feature-engine";
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
  modelVersion: "nba-intel-v3";
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
  const [comparison, awayImpact, homeImpact] = await Promise.all([
    compareNbaProfilesReal(awayTeam, homeTeam),
    getNbaLineupImpact(awayTeam),
    getNbaLineupImpact(homeTeam)
  ]);

  const advanced = buildAdvancedNbaFeatures({ comparison, awayImpact, homeImpact });
  const factors: NbaIntelFactor[] = advanced.features.map((item) => ({
    key: item.key,
    label: item.label,
    value: item.value,
    weight: item.sideWeight,
    contribution: item.sideContribution,
    explanation: item.explanation
  }));

  const projectedHomeEdge = advanced.sideEdge;
  const projectedTotalShift = advanced.totalEdge;
  const volatilityIndex = advanced.volatilityEdge;
  const factorAgreement = factors.filter((item) => Math.sign(item.contribution) === Math.sign(projectedHomeEdge) && Math.abs(item.contribution) >= 0.35).length;
  const confidenceScore = rounded(
    clamp(
      48 + Math.abs(projectedHomeEdge) * 3.8 + factorAgreement * 2.2 + (advanced.dataCompleteness - 65) * 0.18 - advanced.modelRiskPenalty,
      24,
      92
    )
  );

  return {
    modelVersion: "nba-intel-v3",
    awayTeam,
    homeTeam,
    projectedHomeEdge,
    projectedTotalShift,
    volatilityIndex,
    confidenceScore,
    factorStrength: strength(confidenceScore),
    dataSource: `${comparison.away.source}/${comparison.home.source}+lineups+advanced-features`,
    dataCompleteness: advanced.dataCompleteness,
    correlationRisk: advanced.correlationRisk,
    modelRiskPenalty: advanced.modelRiskPenalty,
    factors,
    notes: [
      homeImpact.summary,
      awayImpact.summary,
      ...advanced.notes
    ]
  };
}
