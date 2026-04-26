import { compareNbaProfiles } from "@/services/simulation/nba-team-analytics";

export type NbaIntelFactor = {
  key: string;
  label: string;
  value: number;
  weight: number;
  contribution: number;
  explanation: string;
};

export type NbaIntelResult = {
  modelVersion: "nba-intel-v1";
  awayTeam: string;
  homeTeam: string;
  projectedHomeEdge: number;
  projectedTotalShift: number;
  volatilityIndex: number;
  confidenceScore: number;
  factorStrength: "elite" | "strong" | "medium" | "thin";
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
  return {
    ...args,
    contribution: rounded(args.value * args.weight)
  };
}

function strength(score: number): NbaIntelResult["factorStrength"] {
  if (score >= 72) return "elite";
  if (score >= 61) return "strong";
  if (score >= 49) return "medium";
  return "thin";
}

export function buildNbaIntel(awayTeam: string, homeTeam: string): NbaIntelResult {
  const c = compareNbaProfiles(awayTeam, homeTeam);

  const factors: NbaIntelFactor[] = [
    factor({
      key: "offense",
      label: "Offensive efficiency edge",
      value: rounded(c.offensiveEdge),
      weight: 0.9,
      explanation: "Home offensive rating advantage versus road offensive profile."
    }),
    factor({
      key: "defense",
      label: "Defensive resistance edge",
      value: rounded(c.defensiveEdge),
      weight: 0.72,
      explanation: "Home defense versus opponent scoring environment."
    }),
    factor({
      key: "efg",
      label: "Shot quality / eFG edge",
      value: rounded(c.efgEdge),
      weight: 0.68,
      explanation: "Effective field goal gap captures shooting profile and shot quality."
    }),
    factor({
      key: "turnovers",
      label: "Turnover pressure edge",
      value: rounded(c.turnoverEdge),
      weight: 0.48,
      explanation: "Possession protection and forced mistake profile."
    }),
    factor({
      key: "rebounds",
      label: "Rebounding edge",
      value: rounded(c.reboundEdge),
      weight: 0.36,
      explanation: "Extra possession creation through glass control."
    }),
    factor({
      key: "freeThrows",
      label: "Free throw pressure edge",
      value: rounded(c.freeThrowEdge),
      weight: 0.34,
      explanation: "Paint pressure and whistle-friendly scoring profile."
    }),
    factor({
      key: "restTravel",
      label: "Rest/travel edge",
      value: rounded(c.restTravelEdge),
      weight: 0.5,
      explanation: "Schedule fatigue, home rest, and travel drag."
    }),
    factor({
      key: "form",
      label: "Recent form edge",
      value: rounded(c.formEdge),
      weight: 0.42,
      explanation: "Recent performance momentum without fully overfitting to streaks."
    })
  ];

  const projectedHomeEdge = rounded(factors.reduce((sum, item) => sum + item.contribution, 0));
  const projectedTotalShift = rounded((c.paceAverage - 98.5) * 1.6 + c.offensiveEdge * 0.55 + c.efgEdge * 0.52 + c.freeThrowEdge * 0.3 - Math.max(0, c.defensiveEdge) * 0.38);
  const volatilityIndex = rounded(clamp(c.threePointVolatility + Math.abs(c.formEdge) / 9 + Math.abs(c.paceAverage - 98.5) / 12, 0.72, 1.75));
  const agreement = factors.filter((item) => Math.sign(item.contribution) === Math.sign(projectedHomeEdge) && Math.abs(item.contribution) >= 0.35).length;
  const confidenceScore = rounded(clamp(42 + Math.abs(projectedHomeEdge) * 4.4 + agreement * 3.2 - (volatilityIndex - 1) * 14, 28, 91));

  const notes = [
    projectedHomeEdge > 2.5 ? "Home profile owns a meaningful model edge." : projectedHomeEdge < -2.5 ? "Road profile owns a meaningful model edge." : "Model edge is narrow; treat matchup as fragile.",
    volatilityIndex >= 1.25 ? "Three-point/form volatility is elevated; widen outcome bands." : "Volatility is contained enough for tighter distribution reads.",
    confidenceScore >= 65 ? "Factor agreement is strong enough to support a cleaner read." : "Factor agreement is mixed; use trends and odds context before conviction."
  ];

  return {
    modelVersion: "nba-intel-v1",
    awayTeam,
    homeTeam,
    projectedHomeEdge,
    projectedTotalShift,
    volatilityIndex,
    confidenceScore,
    factorStrength: strength(confidenceScore),
    factors,
    notes
  };
}
