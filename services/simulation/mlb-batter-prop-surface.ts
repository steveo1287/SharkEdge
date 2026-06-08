import type { MlbBatterStatDistribution } from "@/services/simulation/mlb-batter-stat-distribution";

export type MlbPropSurfaceOutcome = {
  market: "HITS" | "TOTAL_BASES" | "HOME_RUN" | "WALKS" | "STRIKEOUTS";
  line: number;
  side: "OVER" | "UNDER";
  probability: number;
  fairAmerican: number;
  confidence: number;
};

export type MlbBatterPropSurface = {
  modelVersion: "mlb-batter-prop-surface-v1";
  outcomes: MlbPropSurfaceOutcome[];
  strongest: MlbPropSurfaceOutcome[];
  notes: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function fairAmerican(probability: number) {
  const p = clamp(probability, 0.01, 0.99);
  if (p >= 0.5) return Math.round((-100 * p) / (1 - p));
  return Math.round((100 * (1 - p)) / p);
}

function pair(args: {
  market: MlbPropSurfaceOutcome["market"];
  line: number;
  overProbability: number;
  confidence: number;
}): MlbPropSurfaceOutcome[] {
  const over = clamp(args.overProbability, 0.01, 0.99);
  const under = clamp(1 - over, 0.01, 0.99);
  return [
    {
      market: args.market,
      line: args.line,
      side: "OVER",
      probability: round(over, 4),
      fairAmerican: fairAmerican(over),
      confidence: round(args.confidence, 3)
    },
    {
      market: args.market,
      line: args.line,
      side: "UNDER",
      probability: round(under, 4),
      fairAmerican: fairAmerican(under),
      confidence: round(args.confidence, 3)
    }
  ];
}

export function buildMlbBatterPropSurface(distribution: MlbBatterStatDistribution): MlbBatterPropSurface {
  const confidence = clamp(distribution.distributionConfidence, 0.2, 0.95);
  const outcomes = [
    ...pair({ market: "HITS", line: 0.5, overProbability: distribution.hit1PlusProbability, confidence }),
    ...pair({ market: "HITS", line: 1.5, overProbability: distribution.hit2PlusProbability, confidence: confidence * 0.94 }),
    ...pair({ market: "HITS", line: 2.5, overProbability: distribution.hit3PlusProbability, confidence: confidence * 0.86 }),
    ...pair({ market: "TOTAL_BASES", line: 0.5, overProbability: distribution.totalBases1PlusProbability, confidence }),
    ...pair({ market: "TOTAL_BASES", line: 1.5, overProbability: distribution.totalBases2PlusProbability, confidence: confidence * 0.95 }),
    ...pair({ market: "TOTAL_BASES", line: 2.5, overProbability: distribution.totalBases3PlusProbability, confidence: confidence * 0.9 }),
    ...pair({ market: "TOTAL_BASES", line: 3.5, overProbability: distribution.totalBases4PlusProbability, confidence: confidence * 0.85 }),
    ...pair({ market: "HOME_RUN", line: 0.5, overProbability: distribution.homeRunProbability, confidence: confidence * 0.72 }),
    ...pair({ market: "WALKS", line: 0.5, overProbability: distribution.walk1PlusProbability, confidence: confidence * 0.82 }),
    ...pair({ market: "STRIKEOUTS", line: 0.5, overProbability: distribution.strikeout1PlusProbability, confidence: confidence * 0.9 }),
    ...pair({ market: "STRIKEOUTS", line: 1.5, overProbability: distribution.strikeout2PlusProbability, confidence: confidence * 0.86 }),
    ...pair({ market: "STRIKEOUTS", line: 2.5, overProbability: distribution.strikeout3PlusProbability, confidence: confidence * 0.78 })
  ];
  const strongest = outcomes
    .slice()
    .filter((outcome) => outcome.confidence >= 0.35)
    .sort((a, b) => Math.abs(b.probability - 0.5) * b.confidence - Math.abs(a.probability - 0.5) * a.confidence)
    .slice(0, 8);

  return {
    modelVersion: "mlb-batter-prop-surface-v1",
    outcomes,
    strongest,
    notes: [
      "Fair prices are no-vig model prices derived from the player stat distribution, not sportsbook recommendations.",
      "Compare only after attaching live book odds, limits, vig, and data-quality gates.",
      `Source distribution confidence ${confidence.toFixed(2)} and volatility ${distribution.volatility.toFixed(2)}.`
    ]
  };
}
