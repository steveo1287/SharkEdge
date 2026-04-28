import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { buildMlbTrainingDataset } from "@/services/simulation/mlb-training-dataset-builder";
import { getCachedMlbMlModel, scoreMlbMlModel } from "@/services/simulation/mlb-ml-training-engine";

const CALIBRATION_KEY = "mlb:calibration:conformal:v1";
const TTL_SECONDS = 60 * 60 * 24 * 14;
const FEATURES = ["teamEdge", "playerEdge", "statcastEdge", "weatherEdge", "pitcherEdge", "bullpenEdge", "lockEdge", "parkEdge", "formEdge", "totalWeatherEdge", "totalStatcastEdge", "totalPitchingEdge", "totalParkEdge", "totalBullpenEdge"] as const;

type FeatureName = typeof FEATURES[number];
type TrainingRow = Record<FeatureName, number> & { homeScore: number; awayScore: number; closingTotal?: number | null; marketTotal?: number | null };

type CalibrationBin = { min: number; max: number; count: number; avgPredicted: number; observedRate: number; correction: number };
export type MlbCalibrationModel = {
  ok: boolean;
  trainedAt: string;
  rows: number;
  ece: number;
  bins: CalibrationBin[];
  sideConformalThreshold: number;
  totalResidualP50: number;
  totalResidualP80: number;
  totalResidualP90: number;
  warning: string | null;
};

function round(value: number, digits = 4) { return Number(value.toFixed(digits)); }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function quantile(values: number[], q: number) { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1)); return sorted[index]; }
function validRows(rows: any[]): TrainingRow[] { return rows.filter((row) => typeof row.homeScore === "number" && typeof row.awayScore === "number" && FEATURES.every((feature) => typeof row[feature] === "number")); }
function binIndex(probability: number, binCount: number) { return Math.min(binCount - 1, Math.max(0, Math.floor(probability * binCount))); }
function featureMap(row: TrainingRow): Record<string, number> { return Object.fromEntries(FEATURES.map((feature) => [feature, row[feature]])); }

function calibrationCorrectionCap(model: MlbCalibrationModel, bin: CalibrationBin | null) {
  if (!bin || bin.count < 8) return 0;
  if (model.rows >= 1000 && bin.count >= 80 && model.ece <= 0.055) return 0.045;
  if (model.rows >= 300 && bin.count >= 30 && model.ece <= 0.075) return 0.032;
  return 0.022;
}

export async function trainMlbCalibrationConformal(limit = 1000): Promise<MlbCalibrationModel> {
  const ml = await getCachedMlbMlModel();
  const dataset = await buildMlbTrainingDataset(limit, 240);
  const rows = validRows(dataset.games ?? []);
  if (!ml?.ok || rows.length < 30) {
    const model: MlbCalibrationModel = { ok: false, trainedAt: new Date().toISOString(), rows: rows.length, ece: 0, bins: [], sideConformalThreshold: 0, totalResidualP50: 0, totalResidualP80: 0, totalResidualP90: 0, warning: "Need a trained ML model and at least 30 joined training rows before calibration/conformal uncertainty can be trusted." };
    await writeHotCache(CALIBRATION_KEY, model, TTL_SECONDS);
    return model;
  }
  const binCount = 10;
  const rawBins = Array.from({ length: binCount }, (_, index) => ({ min: index / binCount, max: (index + 1) / binCount, preds: [] as number[], actuals: [] as number[] }));
  const sideScores: number[] = [];
  const totalResiduals: number[] = [];
  for (const row of rows) {
    const scored = scoreMlbMlModel(ml, featureMap(row));
    const p = scored.homeWinProbability;
    const actual = row.homeScore > row.awayScore ? 1 : 0;
    rawBins[binIndex(p, binCount)].preds.push(p);
    rawBins[binIndex(p, binCount)].actuals.push(actual);
    sideScores.push(actual === 1 ? 1 - p : p);
    totalResiduals.push(Math.abs((row.homeScore + row.awayScore) - scored.projectedTotal));
  }
  const bins = rawBins.map((bin) => {
    const count = bin.preds.length;
    const avgPredicted = count ? bin.preds.reduce((sum, value) => sum + value, 0) / count : (bin.min + bin.max) / 2;
    const observedRate = count ? bin.actuals.reduce((sum, value) => sum + value, 0) / count : avgPredicted;
    return { min: round(bin.min, 2), max: round(bin.max, 2), count, avgPredicted: round(avgPredicted), observedRate: round(observedRate), correction: round(observedRate - avgPredicted) };
  });
  const ece = bins.reduce((sum, bin) => sum + (bin.count / rows.length) * Math.abs(bin.observedRate - bin.avgPredicted), 0);
  const model: MlbCalibrationModel = { ok: true, trainedAt: new Date().toISOString(), rows: rows.length, ece: round(ece), bins, sideConformalThreshold: round(quantile(sideScores, 0.8)), totalResidualP50: round(quantile(totalResiduals, 0.5), 3), totalResidualP80: round(quantile(totalResiduals, 0.8), 3), totalResidualP90: round(quantile(totalResiduals, 0.9), 3), warning: rows.length < 300 ? "Calibration trained on small sample. Treat no-bet gates as conservative." : null };
  await writeHotCache(CALIBRATION_KEY, model, TTL_SECONDS);
  return model;
}

export async function getCachedMlbCalibrationConformal() { return readHotCache<MlbCalibrationModel>(CALIBRATION_KEY); }

export function applyMlbCalibration(model: MlbCalibrationModel | null, probability: number) {
  if (!model?.ok) return { calibratedProbability: probability, correction: 0, bin: null as CalibrationBin | null };
  const bin = model.bins.find((item) => probability >= item.min && probability < item.max) ?? model.bins[model.bins.length - 1] ?? null;
  const rawCorrection = bin && bin.count >= 5 ? bin.correction : 0;
  const cap = calibrationCorrectionCap(model, bin);
  const correction = clamp(rawCorrection, -cap, cap);
  const calibratedProbability = clamp(probability + correction, 0.385, 0.615);
  return { calibratedProbability: round(calibratedProbability), correction: round(correction), bin };
}

export function applyMlbConformalDecision(model: MlbCalibrationModel | null, input: { probability: number; projectedTotal: number; confidence: number }) {
  if (!model?.ok) return { interval: null, uncertaintyPenalty: 0.08, calibratedConfidence: Math.max(0.1, input.confidence - 0.08), reason: "No conformal calibration available." };
  const samplePenalty = model.rows < 300 ? 0.04 : model.rows < 1000 ? 0.025 : 0;
  const thresholdPenalty = model.sideConformalThreshold > 0.38 ? 0.05 : 0;
  const uncertaintyPenalty = Math.min(0.2, Math.max(0.025, model.ece + thresholdPenalty + samplePenalty));
  return { interval: { low: round(input.projectedTotal - model.totalResidualP80, 3), high: round(input.projectedTotal + model.totalResidualP80, 3), p90Low: round(input.projectedTotal - model.totalResidualP90, 3), p90High: round(input.projectedTotal + model.totalResidualP90, 3) }, uncertaintyPenalty: round(uncertaintyPenalty), calibratedConfidence: round(Math.max(0.1, input.confidence - uncertaintyPenalty)), reason: `ECE ${model.ece}; total p80 residual ${model.totalResidualP80}; calibration correction capped for MLB winner reliability.` };
}
