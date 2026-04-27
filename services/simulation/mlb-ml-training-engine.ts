import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { buildMlbTrainingDataset } from "@/services/simulation/mlb-training-dataset-builder";

const MODEL_KEY = "mlb:ml:model:v1";
const TTL_SECONDS = 60 * 60 * 24 * 14;

const FEATURES = [
  "teamEdge",
  "playerEdge",
  "statcastEdge",
  "weatherEdge",
  "pitcherEdge",
  "bullpenEdge",
  "lockEdge",
  "parkEdge",
  "formEdge",
  "totalWeatherEdge",
  "totalStatcastEdge",
  "totalPitchingEdge",
  "totalParkEdge",
  "totalBullpenEdge"
] as const;

type FeatureName = typeof FEATURES[number];
type TrainingRow = Record<FeatureName, number> & { homeScore: number; awayScore: number; closingTotal?: number | null; marketTotal?: number | null };

type MlbMlModel = {
  ok: boolean;
  trainedAt: string;
  rows: number;
  features: FeatureName[];
  sideModel: { intercept: number; coefficients: Record<FeatureName, number>; accuracy: number; logLoss: number };
  totalModel: { intercept: number; coefficients: Record<FeatureName, number>; mae: number; rmse: number };
  warning: string | null;
};

function sigmoid(x: number) { return 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, x)))); }
function round(value: number, digits = 5) { return Number(value.toFixed(digits)); }
function featureVector(row: TrainingRow) { return FEATURES.map((feature) => Number(row[feature] ?? 0)); }
function dot(weights: number[], xs: number[]) { return weights.reduce((sum, weight, index) => sum + weight * xs[index], 0); }
function coefficientMap(weights: number[]) { return Object.fromEntries(FEATURES.map((feature, index) => [feature, round(weights[index] ?? 0)])) as Record<FeatureName, number>; }
function validRows(rows: any[]): TrainingRow[] { return rows.filter((row) => typeof row.homeScore === "number" && typeof row.awayScore === "number" && FEATURES.every((feature) => typeof row[feature] === "number")); }

function trainSide(rows: TrainingRow[]) {
  const weights = Array(FEATURES.length).fill(0);
  let intercept = 0;
  const lr = 0.035;
  const l2 = 0.002;
  for (let epoch = 0; epoch < 450; epoch += 1) {
    for (const row of rows) {
      const xs = featureVector(row);
      const y = row.homeScore > row.awayScore ? 1 : 0;
      const p = sigmoid(intercept + dot(weights, xs));
      const error = p - y;
      intercept -= lr * error;
      for (let i = 0; i < weights.length; i += 1) weights[i] -= lr * (error * xs[i] + l2 * weights[i]);
    }
  }
  let correct = 0;
  let loss = 0;
  for (const row of rows) {
    const y = row.homeScore > row.awayScore ? 1 : 0;
    const p = sigmoid(intercept + dot(weights, featureVector(row)));
    if ((p >= 0.5 ? 1 : 0) === y) correct += 1;
    loss += -(y * Math.log(Math.max(1e-6, p)) + (1 - y) * Math.log(Math.max(1e-6, 1 - p)));
  }
  return { intercept: round(intercept), coefficients: coefficientMap(weights), accuracy: round(correct / Math.max(1, rows.length), 4), logLoss: round(loss / Math.max(1, rows.length), 4) };
}

function trainTotal(rows: TrainingRow[]) {
  const weights = Array(FEATURES.length).fill(0);
  let intercept = rows.reduce((sum, row) => sum + (row.homeScore + row.awayScore), 0) / Math.max(1, rows.length);
  const lr = 0.004;
  const l2 = 0.001;
  for (let epoch = 0; epoch < 550; epoch += 1) {
    for (const row of rows) {
      const xs = featureVector(row);
      const y = row.homeScore + row.awayScore;
      const pred = intercept + dot(weights, xs);
      const error = pred - y;
      intercept -= lr * error;
      for (let i = 0; i < weights.length; i += 1) weights[i] -= lr * (error * xs[i] + l2 * weights[i]);
    }
  }
  let abs = 0;
  let sq = 0;
  for (const row of rows) {
    const y = row.homeScore + row.awayScore;
    const pred = intercept + dot(weights, featureVector(row));
    abs += Math.abs(pred - y);
    sq += (pred - y) ** 2;
  }
  return { intercept: round(intercept), coefficients: coefficientMap(weights), mae: round(abs / Math.max(1, rows.length), 4), rmse: round(Math.sqrt(sq / Math.max(1, rows.length)), 4) };
}

export async function trainMlbMlModel(limit = 1000): Promise<MlbMlModel> {
  const dataset = await buildMlbTrainingDataset(limit, 240);
  const rows = validRows(dataset.games ?? []);
  if (rows.length < 30) {
    const model: MlbMlModel = {
      ok: false,
      trainedAt: new Date().toISOString(),
      rows: rows.length,
      features: [...FEATURES],
      sideModel: { intercept: 0, coefficients: coefficientMap(Array(FEATURES.length).fill(0)), accuracy: 0, logLoss: 0 },
      totalModel: { intercept: 0, coefficients: coefficientMap(Array(FEATURES.length).fill(0)), mae: 0, rmse: 0 },
      warning: "Not enough joined training rows. Capture snapshots before games, wait for finals, then retrain. Minimum useful row count is 30."
    };
    await writeHotCache(MODEL_KEY, model, TTL_SECONDS);
    return model;
  }
  const model: MlbMlModel = {
    ok: true,
    trainedAt: new Date().toISOString(),
    rows: rows.length,
    features: [...FEATURES],
    sideModel: trainSide(rows),
    totalModel: trainTotal(rows),
    warning: rows.length < 300 ? "Model trained, but sample size is small. Treat coefficients as unstable until several hundred rows exist." : null
  };
  await writeHotCache(MODEL_KEY, model, TTL_SECONDS);
  return model;
}

export async function getCachedMlbMlModel() {
  return readHotCache<MlbMlModel>(MODEL_KEY);
}

export function scoreMlbMlModel(model: MlbMlModel, features: Record<string, number>) {
  const xs = FEATURES.map((feature) => Number(features[feature] ?? 0));
  const sideWeights = FEATURES.map((feature) => model.sideModel.coefficients[feature] ?? 0);
  const totalWeights = FEATURES.map((feature) => model.totalModel.coefficients[feature] ?? 0);
  return {
    homeWinProbability: round(sigmoid(model.sideModel.intercept + dot(sideWeights, xs)), 4),
    projectedTotal: round(model.totalModel.intercept + dot(totalWeights, xs), 3)
  };
}
