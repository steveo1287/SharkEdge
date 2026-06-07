export type MlbSettlementResultLabel = "WIN" | "LOSS" | "PUSH";

export type MlbSettlementMathInput = {
  homeWinProbability: number;
  modelSpread: number | null;
  modelTotal: number | null;
  finalHomeScore: number;
  finalAwayScore: number;
};

export type MlbSettlementMath = {
  homeWon: boolean | null;
  finalMargin: number;
  finalTotal: number;
  brier: number | null;
  logLoss: number | null;
  spreadError: number | null;
  totalError: number | null;
  calibrationBucket: string | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round(value: number | null | undefined, digits = 4) {
  if (!finite(value)) return null;
  return Number(value.toFixed(digits));
}

export function probabilityLogLoss(probability: number, outcome: 0 | 1) {
  const p = clamp(probability, 0.001, 0.999);
  return outcome === 1 ? -Math.log(p) : -Math.log(1 - p);
}

export function probabilityBrier(probability: number, outcome: 0 | 1) {
  return (probability - outcome) ** 2;
}

export function calibrationBucket(probability: number | null | undefined) {
  if (!finite(probability)) return null;
  const p = clamp(probability, 0, 1);
  if (p < 0.45) return "under_45";
  if (p < 0.5) return "45_50";
  if (p < 0.55) return "50_55";
  if (p < 0.6) return "55_60";
  if (p < 0.65) return "60_65";
  if (p < 0.7) return "65_70";
  return "70_plus";
}

export function computeMlbSnapshotSettlementMath(input: MlbSettlementMathInput): MlbSettlementMath {
  const finalMargin = input.finalHomeScore - input.finalAwayScore;
  const finalTotal = input.finalHomeScore + input.finalAwayScore;
  const homeWon = input.finalHomeScore === input.finalAwayScore ? null : input.finalHomeScore > input.finalAwayScore;
  const outcome = homeWon == null ? null : homeWon ? 1 : 0;
  const probability = clamp(input.homeWinProbability, 0.001, 0.999);

  return {
    homeWon,
    finalMargin,
    finalTotal,
    brier: outcome == null ? null : round(probabilityBrier(probability, outcome), 6),
    logLoss: outcome == null ? null : round(probabilityLogLoss(probability, outcome), 6),
    spreadError: finite(input.modelSpread) ? round(Math.abs(finalMargin - input.modelSpread), 4) : null,
    totalError: finite(input.modelTotal) ? round(Math.abs(finalTotal - input.modelTotal), 4) : null,
    calibrationBucket: calibrationBucket(probability)
  };
}

export function americanProfit(result: MlbSettlementResultLabel, americanOdds: number | null | undefined) {
  if (result === "PUSH") return 0;
  if (result === "LOSS") return -1;
  if (!finite(americanOdds) || americanOdds === 0) return 100 / 110;
  return americanOdds > 0 ? americanOdds / 100 : 100 / Math.abs(americanOdds);
}
