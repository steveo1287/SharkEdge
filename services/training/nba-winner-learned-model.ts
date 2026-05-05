import {
  buildNbaWinnerFeatureLedger,
  NBA_WINNER_FEATURE_NAMES,
  type NbaWinnerFeatureLedgerRow,
  type NbaWinnerFeatureName
} from "@/services/training/nba-winner-feature-ledger";

type ModelStatus = "GREEN" | "YELLOW" | "RED" | "INSUFFICIENT";

type ScoredRow = {
  eventId: string;
  actualHomeWin: 0 | 1;
  marketHomeNoVig: number;
  finalHomeWinPct: number;
  learnedHomeWinPct: number;
  brier: number;
  marketBrier: number;
  learnedBrier: number;
  logLoss: number;
  marketLogLoss: number;
  learnedLogLoss: number;
};

export type NbaWinnerLearnedCoefficient = {
  feature: "intercept" | "marketLogit" | NbaWinnerFeatureName;
  coefficient: number;
  absCoefficient: number;
};

export type NbaWinnerLearnedModelReport = {
  modelVersion: "nba-winner-learned-logistic-v1";
  generatedAt: string;
  status: ModelStatus;
  sourceRowCount: number;
  usableRowCount: number;
  trainCount: number;
  testCount: number;
  regularizationLambda: number;
  learningRate: number;
  iterations: number;
  coefficients: NbaWinnerLearnedCoefficient[];
  trainMetrics: NbaWinnerLearnedMetrics;
  testMetrics: NbaWinnerLearnedMetrics;
  recommendations: {
    applyLearnedOverlay: boolean;
    maxProbabilityDelta: number;
    reason: string;
  };
  blockers: string[];
  warnings: string[];
};

export type NbaWinnerLearnedMetrics = {
  sampleSize: number;
  learnedBrier: number | null;
  currentBrier: number | null;
  marketBrier: number | null;
  learnedVsCurrentBrierEdge: number | null;
  learnedVsMarketBrierEdge: number | null;
  learnedLogLoss: number | null;
  currentLogLoss: number | null;
  marketLogLoss: number | null;
  learnedVsCurrentLogLossEdge: number | null;
  learnedVsMarketLogLossEdge: number | null;
  learnedHitRate: number | null;
  currentHitRate: number | null;
  marketFavoriteHitRate: number | null;
  calibrationError: number | null;
};

const EPSILON = 1e-6;
const MARKET_LOGIT_WEIGHT = 1;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 6) {
  return Number(value.toFixed(digits));
}

function sigmoid(value: number) {
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }
  const z = Math.exp(value);
  return z / (1 + z);
}

function logLoss(probability: number, actual: 0 | 1) {
  const p = clamp(probability, EPSILON, 1 - EPSILON);
  return actual === 1 ? -Math.log(p) : -Math.log(1 - p);
}

function brier(probability: number, actual: 0 | 1) {
  return (probability - actual) ** 2;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function normalizeFeature(name: NbaWinnerFeatureName, value: number) {
  if (!Number.isFinite(value)) return 0;
  switch (name) {
    case "sourceConfidence":
    case "shrinkageToMarket":
    case "marketConflictScore":
    case "signalAgreementRate":
    case "confidenceOrdinal":
      return clamp((value - 0.5) * 2, -2, 2);
    case "modelMarketAbsGap":
      return clamp(value / 0.08, 0, 2);
    default:
      return clamp(value / 0.035, -2, 2);
  }
}

function vector(row: NbaWinnerFeatureLedgerRow) {
  return [1, row.marketLogit * MARKET_LOGIT_WEIGHT, ...NBA_WINNER_FEATURE_NAMES.map((name) => normalizeFeature(name, row.features[name]))];
}

function dot(weights: number[], xs: number[]) {
  let total = 0;
  for (let index = 0; index < weights.length; index += 1) total += weights[index] * xs[index];
  return total;
}

function trainLogistic(rows: NbaWinnerFeatureLedgerRow[], args: { iterations: number; learningRate: number; lambda: number }) {
  const featureCount = 2 + NBA_WINNER_FEATURE_NAMES.length;
  const weights = Array.from({ length: featureCount }, (_, index) => index === 1 ? 1 : 0);
  if (!rows.length) return weights;
  for (let iteration = 0; iteration < args.iterations; iteration += 1) {
    const gradients = Array.from({ length: featureCount }, () => 0);
    for (const row of rows) {
      const xs = vector(row);
      const prediction = sigmoid(dot(weights, xs));
      const error = prediction - row.actualHomeWin;
      for (let index = 0; index < featureCount; index += 1) gradients[index] += error * xs[index];
    }
    for (let index = 0; index < featureCount; index += 1) {
      const penalty = index <= 1 ? 0 : args.lambda * weights[index];
      weights[index] -= args.learningRate * ((gradients[index] / rows.length) + penalty);
    }
  }
  return weights;
}

function scoreRows(rows: NbaWinnerFeatureLedgerRow[], weights: number[]): ScoredRow[] {
  return rows.map((row) => {
    const learned = clamp(sigmoid(dot(weights, vector(row))), 0.01, 0.99);
    return {
      eventId: row.eventId,
      actualHomeWin: row.actualHomeWin,
      marketHomeNoVig: row.marketHomeNoVig,
      finalHomeWinPct: row.finalHomeWinPct,
      learnedHomeWinPct: round(learned),
      brier: row.brier,
      marketBrier: row.marketBrier ?? brier(row.marketHomeNoVig, row.actualHomeWin),
      learnedBrier: round(brier(learned, row.actualHomeWin)),
      logLoss: row.logLoss,
      marketLogLoss: row.marketLogLoss ?? logLoss(row.marketHomeNoVig, row.actualHomeWin),
      learnedLogLoss: round(logLoss(learned, row.actualHomeWin))
    };
  });
}

function summarize(rows: ScoredRow[]): NbaWinnerLearnedMetrics {
  const learnedBrier = average(rows.map((row) => row.learnedBrier));
  const currentBrier = average(rows.map((row) => row.brier));
  const marketBrier = average(rows.map((row) => row.marketBrier));
  const learnedLogLoss = average(rows.map((row) => row.learnedLogLoss));
  const currentLogLoss = average(rows.map((row) => row.logLoss));
  const marketLogLoss = average(rows.map((row) => row.marketLogLoss));
  const learnedHits = rows.filter((row) => (row.learnedHomeWinPct >= 0.5 ? 1 : 0) === row.actualHomeWin).length;
  const currentHits = rows.filter((row) => (row.finalHomeWinPct >= 0.5 ? 1 : 0) === row.actualHomeWin).length;
  const marketHits = rows.filter((row) => (row.marketHomeNoVig >= 0.5 ? 1 : 0) === row.actualHomeWin).length;
  const avgLearned = average(rows.map((row) => row.learnedHomeWinPct));
  const actual = average(rows.map((row) => row.actualHomeWin));
  return {
    sampleSize: rows.length,
    learnedBrier: learnedBrier == null ? null : round(learnedBrier),
    currentBrier: currentBrier == null ? null : round(currentBrier),
    marketBrier: marketBrier == null ? null : round(marketBrier),
    learnedVsCurrentBrierEdge: learnedBrier == null || currentBrier == null ? null : round(currentBrier - learnedBrier),
    learnedVsMarketBrierEdge: learnedBrier == null || marketBrier == null ? null : round(marketBrier - learnedBrier),
    learnedLogLoss: learnedLogLoss == null ? null : round(learnedLogLoss),
    currentLogLoss: currentLogLoss == null ? null : round(currentLogLoss),
    marketLogLoss: marketLogLoss == null ? null : round(marketLogLoss),
    learnedVsCurrentLogLossEdge: learnedLogLoss == null || currentLogLoss == null ? null : round(currentLogLoss - learnedLogLoss),
    learnedVsMarketLogLossEdge: learnedLogLoss == null || marketLogLoss == null ? null : round(marketLogLoss - learnedLogLoss),
    learnedHitRate: rows.length ? round(learnedHits / rows.length) : null,
    currentHitRate: rows.length ? round(currentHits / rows.length) : null,
    marketFavoriteHitRate: rows.length ? round(marketHits / rows.length) : null,
    calibrationError: avgLearned == null || actual == null ? null : round(Math.abs(avgLearned - actual))
  };
}

function coefficients(weights: number[]): NbaWinnerLearnedCoefficient[] {
  return [
    { feature: "intercept" as const, coefficient: round(weights[0]), absCoefficient: round(Math.abs(weights[0])) },
    { feature: "marketLogit" as const, coefficient: round(weights[1]), absCoefficient: round(Math.abs(weights[1])) },
    ...NBA_WINNER_FEATURE_NAMES.map((feature, index) => ({
      feature,
      coefficient: round(weights[index + 2]),
      absCoefficient: round(Math.abs(weights[index + 2]))
    }))
  ].sort((left, right) => right.absCoefficient - left.absCoefficient);
}

export async function buildNbaWinnerLearnedModelReport(args: {
  limit?: number;
  iterations?: number;
  learningRate?: number;
  lambda?: number;
} = {}): Promise<NbaWinnerLearnedModelReport> {
  const ledger = await buildNbaWinnerFeatureLedger({ limit: args.limit ?? 10000 });
  const rows = ledger.rows;
  const trainCount = Math.floor(rows.length * 0.7);
  const trainRows = rows.slice(trainCount > 0 ? rows.length - trainCount : 0);
  const testRows = rows.slice(0, Math.max(0, rows.length - trainCount));
  const iterations = Math.max(100, Math.min(args.iterations ?? 900, 2500));
  const learningRate = clamp(args.learningRate ?? 0.055, 0.005, 0.2);
  const lambda = clamp(args.lambda ?? 0.08, 0, 1);
  const weights = trainLogistic(trainRows, { iterations, learningRate, lambda });
  const trainMetrics = summarize(scoreRows(trainRows, weights));
  const testMetrics = summarize(scoreRows(testRows, weights));
  const blockers: string[] = [];
  const warnings = [...ledger.warnings];

  if (rows.length < 120) blockers.push("usable learned-model sample under 120 rows");
  if (testRows.length < 40) warnings.push("test sample under 40 rows; learned model should not be trusted live yet");
  if ((testMetrics.learnedVsMarketBrierEdge ?? 0) < 0) blockers.push("learned model trails market Brier on holdout rows");
  if ((testMetrics.learnedVsMarketLogLossEdge ?? 0) < 0) blockers.push("learned model trails market log loss on holdout rows");
  if ((testMetrics.calibrationError ?? 1) > 0.06) blockers.push("learned model holdout calibration error above 6%");
  if ((testMetrics.learnedVsCurrentBrierEdge ?? 0) < -0.0025) warnings.push("learned model trails current SharkEdge Brier on holdout rows");
  if ((testMetrics.learnedVsCurrentLogLossEdge ?? 0) < -0.0025) warnings.push("learned model trails current SharkEdge log loss on holdout rows");

  const applyLearnedOverlay = blockers.length === 0 && testRows.length >= 40 && (testMetrics.learnedVsMarketBrierEdge ?? 0) > 0 && (testMetrics.learnedVsMarketLogLossEdge ?? 0) > 0;
  const status: ModelStatus = rows.length < 120
    ? "INSUFFICIENT"
    : blockers.length
      ? "RED"
      : warnings.length
        ? "YELLOW"
        : "GREEN";

  return {
    modelVersion: "nba-winner-learned-logistic-v1",
    generatedAt: new Date().toISOString(),
    status,
    sourceRowCount: ledger.sourceRowCount,
    usableRowCount: ledger.usableRowCount,
    trainCount: trainRows.length,
    testCount: testRows.length,
    regularizationLambda: lambda,
    learningRate,
    iterations,
    coefficients: coefficients(weights),
    trainMetrics,
    testMetrics,
    recommendations: {
      applyLearnedOverlay,
      maxProbabilityDelta: applyLearnedOverlay ? 0.025 : 0,
      reason: applyLearnedOverlay
        ? "learned logistic overlay beat market Brier and log loss on holdout rows"
        : "learned logistic overlay is report-only until holdout Brier/log-loss beats market with enough sample"
    },
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)]
  };
}
