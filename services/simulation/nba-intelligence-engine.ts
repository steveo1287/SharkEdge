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
  modelVersion: "nba-intel-v2";
  awayTeam: string;
  homeTeam: string;
  projectedHomeEdge: number;
  projectedTotalShift: number;
  volatilityIndex: number;
  confidenceScore: number;
  factorStrength: "elite" | "strong" | "medium" | "thin";
  dataSource: string;
  factors: NbaIntelFactor[];
  notes: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function rounded(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function factor(args: Omit<NbaIntelFactor, "contribution">): NbaIntelFactor {
  return { ...args, contribution: rounded(args.value * args.weight) };
}

function strength(score: number): NbaIntelResult["factorStrength"] {
  if (score >= 72) return "elite";
  if (score >= 61) return "strong";
  if (score >= 49) return "medium";
  return "thin";
}

export async function buildNbaIntel(awayTeam: string, homeTeam: string): Promise<NbaIntelResult> {
  const [c, awayImpact, homeImpact] = await Promise.all([
    compareNbaProfilesReal(awayTeam, homeTeam),
    getNbaLineupImpact(awayTeam),
    getNbaLineupImpact(homeTeam)
  ]);

  const lineupEdge = homeImpact.availabilityPenalty - awayImpact.availabilityPenalty;

  const factors: NbaIntelFactor[] = [
    factor({ key: "offense", label: "Offensive efficiency edge", value: rounded(c.offensiveEdge), weight: 0.9, explanation: "Home offensive rating advantage." }),
    factor({ key: "defense", label: "Defensive resistance edge", value: rounded(c.defensiveEdge), weight: 0.72, explanation: "Home defense vs opponent scoring." }),
    factor({ key: "efg", label: "Shot quality edge", value: rounded(c.efgEdge), weight: 0.68, explanation: "eFG% gap." }),
    factor({ key: "turnovers", label: "Turnover edge", value: rounded(c.turnoverEdge), weight: 0.48, explanation: "Possession pressure." }),
    factor({ key: "rebounds", label: "Rebounding edge", value: rounded(c.reboundEdge), weight: 0.36, explanation: "Extra possessions." }),
    factor({ key: "lineup", label: "Lineup / injury edge", value: rounded(-lineupEdge), weight: 1.1, explanation: "Impact of unavailable players." }),
    factor({ key: "form", label: "Recent form", value: rounded(c.formEdge), weight: 0.42, explanation: "Momentum." })
  ];

  const projectedHomeEdge = rounded(factors.reduce((sum, f) => sum + f.contribution, 0));

  const totalShift = rounded(
    (c.paceAverage - 98.5) * 1.6 +
    c.offensiveEdge * 0.55 +
    c.efgEdge * 0.52 -
    (homeImpact.offensivePenalty + awayImpact.offensivePenalty) * 0.4
  );

  const volatilityIndex = rounded(
    clamp(
      c.threePointVolatility +
      (homeImpact.volatilityBoost - 1) +
      (awayImpact.volatilityBoost - 1),
      0.75,
      1.8
    )
  );

  const confidenceScore = rounded(
    clamp(
      50 + Math.abs(projectedHomeEdge) * 4 - (volatilityIndex - 1) * 15 - (homeImpact.activeCoreHealth < 70 ? 8 : 0),
      28,
      90
    )
  );

  return {
    modelVersion: "nba-intel-v2",
    awayTeam,
    homeTeam,
    projectedHomeEdge,
    projectedTotalShift: totalShift,
    volatilityIndex,
    confidenceScore,
    factorStrength: strength(confidenceScore),
    dataSource: `${c.away.source}/${c.home.source}+lineups`,
    factors,
    notes: [homeImpact.summary, awayImpact.summary]
  };
}
