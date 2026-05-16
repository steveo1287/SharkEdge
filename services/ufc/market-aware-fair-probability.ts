import { americanOddsToImpliedProbability } from "@/services/ufc/fight-iq";

export type UfcMarketAwareFairProbability = {
  hasRealMarket: boolean;
  noMarketEdge: boolean;
  reasonCodes: string[];
  modelProbabilityA: number;
  modelProbabilityB: number;
  marketProbabilityA: number | null;
  marketProbabilityB: number | null;
  noVigMarketProbabilityA: number | null;
  noVigMarketProbabilityB: number | null;
  blendedProbabilityA: number;
  blendedProbabilityB: number;
  modelWeight: number;
  marketWeight: number;
  pickFighterId: string;
  pickProbability: number;
  modelPickProbability: number;
  marketOddsAmerican: number | null;
  marketImpliedProbability: number | null;
  edgePct: number | null;
  confidenceBand: {
    low: number;
    high: number;
    width: number;
    crossesMarket: boolean;
  };
};

type Args = {
  fighterAId: string;
  fighterBId: string;
  modelProbabilityA: number;
  modelProbabilityB: number;
  marketOddsA?: number | null;
  marketOddsB?: number | null;
  dataQualityGrade: string;
  confidenceGrade: string;
  profileFeatureScore?: number | null;
  methodCalibrationQuality?: string | null;
  hasLearningSignal?: boolean;
  hasPriorSignal?: boolean;
  coldStartActive?: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function gradeRank(grade: string) {
  if (grade === "A") return 4;
  if (grade === "B") return 3;
  if (grade === "C") return 2;
  return 1;
}

function confidenceRank(grade: string) {
  if (grade === "HIGH") return 4;
  if (grade === "MEDIUM_HIGH") return 3;
  if (grade === "MEDIUM") return 2;
  return 1;
}

function noVigMarket(a: number | null, b: number | null) {
  if (a == null || b == null) return { a: null, b: null };
  const total = a + b;
  if (!Number.isFinite(total) || total <= 0) return { a: null, b: null };
  return { a: round(a / total), b: round(b / total) };
}

function modelWeightFor(args: Args, hasRealMarket: boolean) {
  if (!hasRealMarket) return 1;
  const rank = gradeRank(args.dataQualityGrade);
  if (rank <= 1) return 0;
  if (rank === 2) return 0.3;
  if (rank === 3) return 0.5;
  return 0.65;
}

function uncertaintyWidth(args: Args, hasRealMarket: boolean) {
  let width = 0.045;
  const dataRank = gradeRank(args.dataQualityGrade);
  const confRank = confidenceRank(args.confidenceGrade);
  if (dataRank <= 1) width += 0.12;
  else if (dataRank === 2) width += 0.08;
  else if (dataRank === 3) width += 0.045;
  if (confRank <= 1) width += 0.08;
  else if (confRank === 2) width += 0.04;
  if (args.coldStartActive) width += 0.06;
  if (!args.hasLearningSignal) width += 0.025;
  if (!args.hasPriorSignal) width += 0.015;
  if (!hasRealMarket) width += 0.04;
  if (args.methodCalibrationQuality === "D") width += 0.025;
  if (typeof args.profileFeatureScore === "number" && args.profileFeatureScore < 65) width += 0.025;
  return clamp(width, 0.035, 0.22);
}

export function evaluateUfcMarketAwareFairProbability(args: Args): UfcMarketAwareFairProbability {
  const marketA = americanOddsToImpliedProbability(args.marketOddsA);
  const marketB = americanOddsToImpliedProbability(args.marketOddsB);
  const noVig = noVigMarket(marketA, marketB);
  const hasRealMarket = noVig.a != null && noVig.b != null;
  const modelA = clamp(args.modelProbabilityA, 0.01, 0.99);
  const modelB = clamp(args.modelProbabilityB, 0.01, 0.99);
  const modelWeight = modelWeightFor(args, hasRealMarket);
  const marketWeight = hasRealMarket ? 1 - modelWeight : 0;
  const blendedA = hasRealMarket
    ? round(clamp(modelA * modelWeight + (noVig.a ?? modelA) * marketWeight, 0.01, 0.99))
    : round(modelA);
  const blendedB = round(1 - blendedA);
  const pickFighterId = blendedA >= blendedB ? args.fighterAId : args.fighterBId;
  const pickProbability = Math.max(blendedA, blendedB);
  const modelPickProbability = pickFighterId === args.fighterAId ? modelA : modelB;
  const marketOddsAmerican = pickFighterId === args.fighterAId ? args.marketOddsA ?? null : args.marketOddsB ?? null;
  const marketImpliedProbability = pickFighterId === args.fighterAId ? noVig.a : noVig.b;
  const width = uncertaintyWidth(args, hasRealMarket);
  const low = round(clamp(pickProbability - width, 0.01, 0.99));
  const high = round(clamp(pickProbability + width, 0.01, 0.99));
  const crossesMarket = marketImpliedProbability != null && low <= marketImpliedProbability && high >= marketImpliedProbability;
  const edgePct = marketImpliedProbability == null ? null : round((pickProbability - marketImpliedProbability) * 100, 2);
  const reasonCodes: string[] = [];
  if (!hasRealMarket) reasonCodes.push("NO_REAL_MARKET");
  if (gradeRank(args.dataQualityGrade) <= 1) reasonCodes.push("DATA_QUALITY_D");
  if (args.coldStartActive) reasonCodes.push("COLD_START_ACTIVE");
  if (crossesMarket) reasonCodes.push("UNCERTAINTY_BAND_CROSSES_MARKET");
  if (edgePct == null) reasonCodes.push("EDGE_UNAVAILABLE");
  else if (edgePct < 1.5) reasonCodes.push("EDGE_BELOW_THRESHOLD");

  return {
    hasRealMarket,
    noMarketEdge: !hasRealMarket || gradeRank(args.dataQualityGrade) <= 1,
    reasonCodes,
    modelProbabilityA: round(modelA),
    modelProbabilityB: round(modelB),
    marketProbabilityA: marketA,
    marketProbabilityB: marketB,
    noVigMarketProbabilityA: noVig.a,
    noVigMarketProbabilityB: noVig.b,
    blendedProbabilityA: blendedA,
    blendedProbabilityB: blendedB,
    modelWeight: round(modelWeight),
    marketWeight: round(marketWeight),
    pickFighterId,
    pickProbability,
    modelPickProbability: round(modelPickProbability),
    marketOddsAmerican,
    marketImpliedProbability,
    edgePct,
    confidenceBand: { low, high, width: round(width), crossesMarket }
  };
}
