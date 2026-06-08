export type MlbBatterStatDistribution = {
  hit0Probability: number;
  hit1PlusProbability: number;
  hit2PlusProbability: number;
  hit3PlusProbability: number;
  totalBases1PlusProbability: number;
  totalBases2PlusProbability: number;
  totalBases3PlusProbability: number;
  totalBases4PlusProbability: number;
  homeRunProbability: number;
  walk1PlusProbability: number;
  strikeout0Probability: number;
  strikeout1PlusProbability: number;
  strikeout2PlusProbability: number;
  strikeout3PlusProbability: number;
  volatility: number;
  distributionConfidence: number;
  notes: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function poissonCdf(k: number, lambda: number) {
  let sum = 0;
  let term = Math.exp(-lambda);
  for (let index = 0; index <= k; index += 1) {
    if (index > 0) term *= lambda / index;
    sum += term;
  }
  return clamp(sum, 0, 1);
}

function probAtLeast(count: number, mean: number, overdispersion = 1) {
  const adjustedMean = clamp(mean * overdispersion, 0, 8);
  if (count <= 0) return 1;
  return round(1 - poissonCdf(count - 1, adjustedMean), 4);
}

function eventProbability(mean: number, volatility = 1) {
  return round(clamp(1 - Math.exp(-Math.max(0, mean) * volatility), 0, 0.98), 4);
}

export function buildMlbBatterStatDistribution(args: {
  expectedHits: number;
  expectedTotalBases: number;
  expectedHomeRuns: number;
  expectedWalks: number;
  expectedStrikeouts: number;
  expectedPlateAppearances: number;
  powerMultiplier: number;
  contactMultiplier: number;
  statConfidence: number;
  advancedConfidence: number;
  drivers: string[];
}): MlbBatterStatDistribution {
  const powerVol = clamp(args.powerMultiplier, 0.82, 1.28);
  const contactVol = clamp(1.08 - (args.contactMultiplier - 1) * 0.35, 0.88, 1.18);
  const paVol = clamp(args.expectedPlateAppearances / 4.35, 0.82, 1.18);
  const volatility = round(clamp((powerVol * 0.48 + contactVol * 0.32 + paVol * 0.2), 0.78, 1.32), 3);
  const confidence = round(clamp(args.statConfidence * 0.62 + args.advancedConfidence * 0.38, 0.22, 0.94), 3);
  const hitMean = clamp(args.expectedHits, 0, 3.2);
  const tbMean = clamp(args.expectedTotalBases, 0, 8);
  const kMean = clamp(args.expectedStrikeouts, 0, 5.5);
  const bbMean = clamp(args.expectedWalks, 0, 3.2);
  const hrMean = clamp(args.expectedHomeRuns, 0, 1.2);
  const notes = [
    `Distribution uses mean stat projection with volatility ${volatility.toFixed(2)}.`,
    `Confidence blends batter sample and advanced matchup context at ${confidence.toFixed(2)}.`,
    `Drivers: ${args.drivers.slice(0, 5).join(", ") || "neutral"}.`
  ];

  return {
    hit0Probability: round(poissonCdf(0, hitMean * volatility), 4),
    hit1PlusProbability: probAtLeast(1, hitMean, volatility),
    hit2PlusProbability: probAtLeast(2, hitMean, volatility),
    hit3PlusProbability: probAtLeast(3, hitMean, volatility),
    totalBases1PlusProbability: probAtLeast(1, tbMean, clamp(volatility * 0.96, 0.78, 1.28)),
    totalBases2PlusProbability: probAtLeast(2, tbMean, clamp(volatility * 0.98, 0.78, 1.3)),
    totalBases3PlusProbability: probAtLeast(3, tbMean, clamp(volatility * 1.02, 0.78, 1.34)),
    totalBases4PlusProbability: probAtLeast(4, tbMean, clamp(volatility * 1.05, 0.78, 1.38)),
    homeRunProbability: eventProbability(hrMean, clamp(args.powerMultiplier, 0.8, 1.35)),
    walk1PlusProbability: eventProbability(bbMean, 1),
    strikeout0Probability: round(poissonCdf(0, kMean), 4),
    strikeout1PlusProbability: probAtLeast(1, kMean, 1),
    strikeout2PlusProbability: probAtLeast(2, kMean, 1),
    strikeout3PlusProbability: probAtLeast(3, kMean, 1),
    volatility,
    distributionConfidence: confidence,
    notes
  };
}
