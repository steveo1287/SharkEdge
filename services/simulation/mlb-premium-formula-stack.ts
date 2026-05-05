export type MlbPremiumFormulaStackInput = {
  rawHomeWinPct: number;
  v8HomeWinPct: number;
  v7HomeWinPct: number;
  marketHomeNoVigProbability?: number | null;
  homeRuns: number;
  awayRuns: number;
  pythagoreanExponent?: number;
};

export type MlbPremiumFormulaStackResult = {
  modelVersion: "mlb-premium-formula-stack-v1";
  rawHomeWinPct: number;
  v8HomeWinPct: number;
  v7HomeWinPct: number;
  pythagoreanHomeWinPct: number;
  marketHomeNoVigProbability: number | null;
  consensusHomeWinPct: number;
  consensusAwayWinPct: number;
  finalHomeWinPct: number;
  finalAwayWinPct: number;
  edgeHomePct: number | null;
  formulaDisagreement: number;
  confidencePenalty: number;
  confidenceCap: number;
  pythagoreanExponent: number;
  reasons: string[];
};

type WeightedProbability = {
  probability: number;
  weight: number;
};

const DEFAULT_PYTHAGOREAN_EXPONENT = 1.83;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function safeProbability(value: number | null | undefined, fallback = 0.5) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return clamp(value, 0.02, 0.98);
}

function logit(probability: number) {
  const p = safeProbability(probability);
  return Math.log(p / (1 - p));
}

function invLogit(value: number) {
  return 1 / (1 + Math.exp(-value));
}

function logitBlend(items: WeightedProbability[]) {
  const valid = items.filter((item) => Number.isFinite(item.probability) && Number.isFinite(item.weight) && item.weight > 0);
  const weightSum = valid.reduce((sum, item) => sum + item.weight, 0);
  if (!valid.length || weightSum <= 0) return 0.5;
  return invLogit(valid.reduce((sum, item) => sum + logit(item.probability) * (item.weight / weightSum), 0));
}

export function pythagoreanHomeWinProbability(homeRuns: number, awayRuns: number, exponent = DEFAULT_PYTHAGOREAN_EXPONENT) {
  const home = Math.max(0.05, Number.isFinite(homeRuns) ? homeRuns : 4.5);
  const away = Math.max(0.05, Number.isFinite(awayRuns) ? awayRuns : 4.5);
  const exp = clamp(exponent, 1.5, 2.2);
  const homePowered = home ** exp;
  const awayPowered = away ** exp;
  return clamp(homePowered / (homePowered + awayPowered), 0.08, 0.92);
}

export function log5WinProbability(teamA: number, teamB: number) {
  const a = safeProbability(teamA);
  const b = safeProbability(teamB);
  const denominator = a * (1 - b) + b * (1 - a);
  if (!Number.isFinite(denominator) || denominator <= 0) return 0.5;
  return clamp((a * (1 - b)) / denominator, 0.02, 0.98);
}

export function buildMlbPremiumFormulaStack(input: MlbPremiumFormulaStackInput): MlbPremiumFormulaStackResult {
  const rawHomeWinPct = safeProbability(input.rawHomeWinPct);
  const v8HomeWinPct = safeProbability(input.v8HomeWinPct);
  const v7HomeWinPct = safeProbability(input.v7HomeWinPct);
  const marketHomeNoVigProbability = typeof input.marketHomeNoVigProbability === "number" && Number.isFinite(input.marketHomeNoVigProbability)
    ? safeProbability(input.marketHomeNoVigProbability)
    : null;
  const pythagoreanExponent = clamp(input.pythagoreanExponent ?? DEFAULT_PYTHAGOREAN_EXPONENT, 1.5, 2.2);
  const pythagoreanHomeWinPct = pythagoreanHomeWinProbability(input.homeRuns, input.awayRuns, pythagoreanExponent);
  const formulaValues = [rawHomeWinPct, v8HomeWinPct, v7HomeWinPct, pythagoreanHomeWinPct, marketHomeNoVigProbability]
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const formulaDisagreement = Math.max(...formulaValues.map((value) => Math.abs(value - v7HomeWinPct)), 0);
  const confidencePenalty = round(clamp(formulaDisagreement * 0.6, 0, 0.09), 3);
  const confidenceCap = round(clamp(0.72 - confidencePenalty, 0.54, 0.72), 3);
  const consensusHomeWinPct = logitBlend([
    { probability: v7HomeWinPct, weight: marketHomeNoVigProbability == null ? 0.42 : 0.52 },
    { probability: v8HomeWinPct, weight: 0.2 },
    { probability: pythagoreanHomeWinPct, weight: 0.2 },
    { probability: rawHomeWinPct, weight: 0.08 }
  ]);
  const finalHomeWinPct = round(clamp(consensusHomeWinPct, 0.08, 0.92));
  const finalAwayWinPct = round(1 - finalHomeWinPct);
  const edgeHomePct = marketHomeNoVigProbability == null ? null : round(finalHomeWinPct - marketHomeNoVigProbability, 4);

  return {
    modelVersion: "mlb-premium-formula-stack-v1",
    rawHomeWinPct: round(rawHomeWinPct),
    v8HomeWinPct: round(v8HomeWinPct),
    v7HomeWinPct: round(v7HomeWinPct),
    pythagoreanHomeWinPct: round(pythagoreanHomeWinPct),
    marketHomeNoVigProbability: marketHomeNoVigProbability == null ? null : round(marketHomeNoVigProbability),
    consensusHomeWinPct: round(consensusHomeWinPct),
    consensusAwayWinPct: round(1 - consensusHomeWinPct),
    finalHomeWinPct,
    finalAwayWinPct,
    edgeHomePct,
    formulaDisagreement: round(formulaDisagreement),
    confidencePenalty,
    confidenceCap,
    pythagoreanExponent,
    reasons: [
      `Premium formula stack: run-based Pythagorean home ${(pythagoreanHomeWinPct * 100).toFixed(1)}%, v8 home ${(v8HomeWinPct * 100).toFixed(1)}%, v7 calibrated home ${(v7HomeWinPct * 100).toFixed(1)}%.`,
      `Premium formula consensus home ${(finalHomeWinPct * 100).toFixed(1)}%, disagreement ${(formulaDisagreement * 100).toFixed(1)}%, confidence cap ${(confidenceCap * 100).toFixed(1)}%.`,
      marketHomeNoVigProbability == null
        ? "Premium formula stack: market anchor missing, no-vig edge remains unavailable."
        : `Premium formula stack: no-vig market ${(marketHomeNoVigProbability * 100).toFixed(1)}%, formula-adjusted edge ${((edgeHomePct ?? 0) * 100).toFixed(1)}%.`
    ]
  };
}
