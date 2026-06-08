import type { MlbPlayerStatMarketVariance } from "@/services/simulation/mlb-elite-hitter-context-adjustment";

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
  marketVolatility: MlbPlayerStatMarketVariance;
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

function defaultMarketVolatility(): MlbPlayerStatMarketVariance {
  return {
    hits: 1,
    totalBases: 1,
    homeRun: 1,
    walks: 1,
    strikeouts: 1
  };
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
  marketVolatility?: Partial<MlbPlayerStatMarketVariance> | null;
  drivers: string[];
}): MlbBatterStatDistribution {
  const powerVol = clamp(args.powerMultiplier, 0.82, 1.28);
  const contactVol = clamp(1.08 - (args.contactMultiplier - 1) * 0.35, 0.88, 1.18);
  const paVol = clamp(args.expectedPlateAppearances / 4.35, 0.82, 1.18);
  const volatility = round(clamp((powerVol * 0.48 + contactVol * 0.32 + paVol * 0.2), 0.78, 1.32), 3);
  const marketVolatility = {
    ...defaultMarketVolatility(),
    ...(args.marketVolatility ?? {})
  };
  const confidence = round(clamp(args.statConfidence * 0.62 + args.advancedConfidence * 0.38, 0.22, 0.94), 3);
  const hitMean = clamp(args.expectedHits, 0, 3.2);
  const tbMean = clamp(args.expectedTotalBases, 0, 8);
  const kMean = clamp(args.expectedStrikeouts, 0, 5.5);
  const bbMean = clamp(args.expectedWalks, 0, 3.2);
  const hrMean = clamp(args.expectedHomeRuns, 0, 1.2);
  const hitVol = clamp(volatility * marketVolatility.hits, 0.68, 1.58);
  const tbVol = clamp(volatility * marketVolatility.totalBases, 0.68, 1.7);
  const hrVol = clamp(args.powerMultiplier * marketVolatility.homeRun, 0.64, 1.95);
  const walkVol = clamp(marketVolatility.walks, 0.68, 1.55);
  const strikeoutVol = clamp(marketVolatility.strikeouts, 0.68, 1.58);
  const notes = [
    `Distribution uses mean stat projection with volatility ${volatility.toFixed(2)}.`,
    `Market volatility H ${marketVolatility.hits.toFixed(2)}, TB ${marketVolatility.totalBases.toFixed(2)}, HR ${marketVolatility.homeRun.toFixed(2)}, BB ${marketVolatility.walks.toFixed(2)}, K ${marketVolatility.strikeouts.toFixed(2)}.`,
    `Confidence blends batter sample and advanced matchup context at ${confidence.toFixed(2)}.`,
    `Drivers: ${args.drivers.slice(0, 5).join(", ") || "neutral"}.`
  ];

  return {
    hit0Probability: round(poissonCdf(0, hitMean * hitVol), 4),
    hit1PlusProbability: probAtLeast(1, hitMean, hitVol),
    hit2PlusProbability: probAtLeast(2, hitMean, hitVol),
    hit3PlusProbability: probAtLeast(3, hitMean, hitVol),
    totalBases1PlusProbability: probAtLeast(1, tbMean, clamp(tbVol * 0.96, 0.68, 1.64)),
    totalBases2PlusProbability: probAtLeast(2, tbMean, clamp(tbVol * 0.98, 0.68, 1.68)),
    totalBases3PlusProbability: probAtLeast(3, tbMean, clamp(tbVol * 1.02, 0.68, 1.72)),
    totalBases4PlusProbability: probAtLeast(4, tbMean, clamp(tbVol * 1.05, 0.68, 1.78)),
    homeRunProbability: eventProbability(hrMean, hrVol),
    walk1PlusProbability: eventProbability(bbMean, walkVol),
    strikeout0Probability: round(poissonCdf(0, kMean * strikeoutVol), 4),
    strikeout1PlusProbability: probAtLeast(1, kMean, strikeoutVol),
    strikeout2PlusProbability: probAtLeast(2, kMean, strikeoutVol),
    strikeout3PlusProbability: probAtLeast(3, kMean, strikeoutVol),
    volatility,
    marketVolatility: {
      hits: round(marketVolatility.hits, 3),
      totalBases: round(marketVolatility.totalBases, 3),
      homeRun: round(marketVolatility.homeRun, 3),
      walks: round(marketVolatility.walks, 3),
      strikeouts: round(marketVolatility.strikeouts, 3)
    },
    distributionConfidence: confidence,
    notes
  };
}
