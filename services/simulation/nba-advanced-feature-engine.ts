import type { NbaMatchupComparison } from "@/services/simulation/nba-team-analytics";
import type { NbaLineupImpact } from "@/services/simulation/nba-player-impact";

export type AdvancedNbaFeature = {
  key: string;
  label: string;
  value: number;
  sideWeight: number;
  totalWeight: number;
  volatilityWeight: number;
  sideContribution: number;
  totalContribution: number;
  volatilityContribution: number;
  explanation: string;
};

export type AdvancedNbaFeatureSet = {
  modelVersion: "nba-advanced-features-v1";
  sideEdge: number;
  totalEdge: number;
  volatilityEdge: number;
  modelRiskPenalty: number;
  correlationRisk: number;
  dataCompleteness: number;
  features: AdvancedNbaFeature[];
  notes: string[];
};

function rounded(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function feature(args: Omit<AdvancedNbaFeature, "sideContribution" | "totalContribution" | "volatilityContribution">): AdvancedNbaFeature {
  return {
    ...args,
    sideContribution: rounded(args.value * args.sideWeight),
    totalContribution: rounded(args.value * args.totalWeight),
    volatilityContribution: rounded(Math.abs(args.value) * args.volatilityWeight)
  };
}

function sourceScore(source?: string) {
  if (!source) return 0.45;
  if (source.includes("nba-stats-api")) return 1;
  if (source.includes("sportsdataverse")) return 0.9;
  if (source.includes("real")) return 0.85;
  if (source.includes("override")) return 0.72;
  return 0.55;
}

export function buildAdvancedNbaFeatures(args: {
  comparison: NbaMatchupComparison;
  awayImpact: NbaLineupImpact;
  homeImpact: NbaLineupImpact;
}): AdvancedNbaFeatureSet {
  const { comparison: c, awayImpact, homeImpact } = args;
  const lineupEdge = awayImpact.availabilityPenalty - homeImpact.availabilityPenalty;
  const offensiveHealthEdge = awayImpact.offensivePenalty - homeImpact.offensivePenalty;
  const defensiveHealthEdge = homeImpact.defensivePenalty - awayImpact.defensivePenalty;
  const usageShock = homeImpact.usageShock + awayImpact.usageShock;
  const pacePressure = c.paceAverage - 98.5;
  const sourceCompleteness = (sourceScore(c.away.source) + sourceScore(c.home.source)) / 2;
  const injuryCompleteness = awayImpact.players.length || homeImpact.players.length ? 1 : 0.62;
  const dataCompleteness = rounded(clamp((sourceCompleteness * 0.72 + injuryCompleteness * 0.28) * 100, 35, 100));

  const features = [
    feature({ key: "net_efficiency", label: "Net efficiency separation", value: rounded(c.offensiveEdge + c.defensiveEdge), sideWeight: 0.5, totalWeight: 0.12, volatilityWeight: 0.03, explanation: "Combined offensive and defensive strength gap." }),
    feature({ key: "shot_quality", label: "Shot quality profile", value: rounded(c.efgEdge), sideWeight: 0.72, totalWeight: 0.56, volatilityWeight: 0.08, explanation: "eFG edge captures shot profile and conversion quality." }),
    feature({ key: "possession_control", label: "Possession control", value: rounded(c.turnoverEdge + c.reboundEdge * 0.65), sideWeight: 0.52, totalWeight: -0.1, volatilityWeight: 0.06, explanation: "Turnovers plus rebounding determine extra possessions." }),
    feature({ key: "rim_whistle", label: "Rim pressure / whistle rate", value: rounded(c.freeThrowEdge), sideWeight: 0.35, totalWeight: 0.38, volatilityWeight: 0.04, explanation: "Free throw pressure stabilizes scoring and late-game outcomes." }),
    feature({ key: "pace_environment", label: "Pace environment", value: rounded(pacePressure), sideWeight: 0.08, totalWeight: 1.35, volatilityWeight: 0.1, explanation: "Possession volume controls total ceiling." }),
    feature({ key: "three_point_variance", label: "3PT variance profile", value: rounded(c.threePointVolatility - 1), sideWeight: 0.08, totalWeight: 0.42, volatilityWeight: 0.85, explanation: "High 3PA environments widen simulation tails." }),
    feature({ key: "lineup_availability", label: "Lineup availability", value: rounded(lineupEdge), sideWeight: 1.15, totalWeight: -0.35, volatilityWeight: 0.28, explanation: "Unavailable rotation value changes spread, total, and uncertainty." }),
    feature({ key: "usage_redistribution", label: "Usage redistribution shock", value: rounded(usageShock), sideWeight: -0.05, totalWeight: -0.22, volatilityWeight: 0.42, explanation: "Missing high-usage players creates role instability." }),
    feature({ key: "offensive_health", label: "Offensive health drag", value: rounded(offensiveHealthEdge), sideWeight: 0.62, totalWeight: -0.5, volatilityWeight: 0.16, explanation: "Scoring-side lineup health affects shot creation." }),
    feature({ key: "defensive_health", label: "Defensive health drag", value: rounded(defensiveHealthEdge), sideWeight: 0.42, totalWeight: 0.22, volatilityWeight: 0.1, explanation: "Defensive absences raise opponent scoring efficiency." }),
    feature({ key: "schedule_form", label: "Schedule + form context", value: rounded(c.restTravelEdge * 0.55 + c.formEdge * 0.45), sideWeight: 0.48, totalWeight: 0.12, volatilityWeight: 0.12, explanation: "Rest, travel, and recent form are blended without overfitting streaks." })
  ];

  const sideEdge = rounded(features.reduce((sum, item) => sum + item.sideContribution, 0));
  const totalEdge = rounded(features.reduce((sum, item) => sum + item.totalContribution, 0));
  const volatilityEdge = rounded(clamp(1 + features.reduce((sum, item) => sum + item.volatilityContribution, 0) / 10, 0.72, 1.95));
  const correlationRisk = rounded(clamp((Math.abs(c.efgEdge) + Math.abs(pacePressure) + usageShock) / 18, 0, 1));
  const modelRiskPenalty = rounded(clamp((100 - dataCompleteness) / 7 + correlationRisk * 4 + Math.max(0, volatilityEdge - 1.25) * 7, 0, 18));

  return {
    modelVersion: "nba-advanced-features-v1",
    sideEdge,
    totalEdge,
    volatilityEdge,
    modelRiskPenalty,
    correlationRisk,
    dataCompleteness,
    features,
    notes: [
      `Data completeness ${dataCompleteness}/100.`,
      correlationRisk >= 0.55 ? "Correlation risk is elevated; spread and total outcomes are linked." : "Correlation risk is contained.",
      modelRiskPenalty >= 9 ? "Model-risk penalty is material; reduce confidence." : "Model-risk penalty is acceptable."
    ]
  };
}
