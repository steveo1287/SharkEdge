import crypto from "node:crypto";

import { prisma } from "@/lib/db/prisma";
import type { UfcEnsembleWeights } from "@/services/ufc/ensemble-sim";

export type UfcEnsembleCalibrationRow = {
  fightId: string;
  actualWinner: "A" | "B";
  skillMarkovFighterAWinProbability: number;
  exchangeMonteCarloFighterAWinProbability: number;
  roundByRoundFighterAWinProbability: number;
  styleMatchupFighterAWinProbability: number;
  bucket?: string | null;
};

export type UfcEnsembleCalibrationOptions = {
  defaultWeights?: UfcEnsembleWeights;
  minSamples?: number;
  gridStep?: number;
};

export type UfcEnsembleWeightMetrics = {
  accuracyPct: number;
  logLoss: number;
  brierScore: number;
  calibrationError: number;
};

export type UfcEnsembleCalibrationReport = {
  sampleCount: number;
  defaultWeights: UfcEnsembleWeights;
  bestRawWeights: UfcEnsembleWeights;
  recommendedWeights: UfcEnsembleWeights;
  shrinkage: number;
  defaultMetrics: UfcEnsembleWeightMetrics;
  bestRawMetrics: UfcEnsembleWeightMetrics;
  recommendedMetrics: UfcEnsembleWeightMetrics;
  bucketReports: Record<string, Omit<UfcEnsembleCalibrationReport, "bucketReports">>;
};

const DEFAULT_WEIGHTS: UfcEnsembleWeights = { skillMarkov: 0.34, exchangeMonteCarlo: 0.28, roundByRound: 0.2, styleMatchup: 0.18 };
const DEFAULT_MIN_SAMPLES = 30;
const DEFAULT_GRID_STEP = 0.1;

const round = (value: number, digits = 4) => Number(value.toFixed(digits));
const clampProbability = (value: number) => Number.isFinite(value) ? Math.max(0.001, Math.min(0.999, value)) : 0.5;

function normalizeWeights(weights: Partial<UfcEnsembleWeights>): UfcEnsembleWeights {
  const skill = weights.skillMarkov ?? DEFAULT_WEIGHTS.skillMarkov;
  const exchange = weights.exchangeMonteCarlo ?? DEFAULT_WEIGHTS.exchangeMonteCarlo;
  const roundEngine = weights.roundByRound ?? DEFAULT_WEIGHTS.roundByRound;
  const style = weights.styleMatchup ?? DEFAULT_WEIGHTS.styleMatchup;
  const total = Math.max(0.0001, skill + exchange + roundEngine + style);
  return { skillMarkov: round(skill / total), exchangeMonteCarlo: round(exchange / total), roundByRound: round(roundEngine / total), styleMatchup: round(style / total) };
}

function blend(skill: number, exchange: number, roundEngine: number, style: number, weights: UfcEnsembleWeights) {
  return clampProbability(skill * weights.skillMarkov + exchange * weights.exchangeMonteCarlo + roundEngine * weights.roundByRound + style * weights.styleMatchup);
}

function stableId(prefix: string, value: string) {
  return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

export function scoreUfcEnsembleWeights(rows: UfcEnsembleCalibrationRow[], weights: UfcEnsembleWeights): UfcEnsembleWeightMetrics {
  if (!rows.length) return { accuracyPct: 0, logLoss: 0, brierScore: 0, calibrationError: 0 };
  const normalized = normalizeWeights(weights);
  let correct = 0;
  let logLoss = 0;
  let brier = 0;
  let predictedSum = 0;
  let actualSum = 0;

  for (const row of rows) {
    const pA = blend(row.skillMarkovFighterAWinProbability, row.exchangeMonteCarloFighterAWinProbability, row.roundByRoundFighterAWinProbability, row.styleMatchupFighterAWinProbability, normalized);
    const actualA = row.actualWinner === "A" ? 1 : 0;
    const pickA = pA >= 0.5;
    if ((pickA && actualA === 1) || (!pickA && actualA === 0)) correct += 1;
    logLoss += -(actualA * Math.log(pA) + (1 - actualA) * Math.log(1 - pA));
    brier += Math.pow(pA - actualA, 2);
    predictedSum += pA;
    actualSum += actualA;
  }

  return {
    accuracyPct: round((correct / rows.length) * 100, 2),
    logLoss: round(logLoss / rows.length, 5),
    brierScore: round(brier / rows.length, 5),
    calibrationError: round(Math.abs(predictedSum / rows.length - actualSum / rows.length), 5)
  };
}

function candidateWeights(gridStep: number) {
  const step = Math.max(0.05, Math.min(0.25, gridStep));
  const candidates: UfcEnsembleWeights[] = [];
  for (let skill = 0; skill <= 1.0001; skill += step) {
    for (let exchange = 0; exchange <= 1 - skill + 0.0001; exchange += step) {
      for (let roundEngine = 0; roundEngine <= 1 - skill - exchange + 0.0001; roundEngine += step) {
        const style = Math.max(0, 1 - skill - exchange - roundEngine);
        candidates.push(normalizeWeights({ skillMarkov: round(skill, 4), exchangeMonteCarlo: round(exchange, 4), roundByRound: round(roundEngine, 4), styleMatchup: round(style, 4) }));
      }
    }
  }
  return candidates;
}

function bestWeightsByLogLoss(rows: UfcEnsembleCalibrationRow[], gridStep: number) {
  let best = DEFAULT_WEIGHTS;
  let bestMetrics = scoreUfcEnsembleWeights(rows, best);
  for (const candidate of candidateWeights(gridStep)) {
    const metrics = scoreUfcEnsembleWeights(rows, candidate);
    if (metrics.logLoss < bestMetrics.logLoss || (metrics.logLoss === bestMetrics.logLoss && metrics.brierScore < bestMetrics.brierScore)) {
      best = candidate;
      bestMetrics = metrics;
    }
  }
  return { weights: best, metrics: bestMetrics };
}

function shrinkWeights(raw: UfcEnsembleWeights, defaults: UfcEnsembleWeights, sampleCount: number, minSamples: number) {
  const shrinkage = round(Math.min(1, sampleCount / Math.max(1, minSamples)), 4);
  return {
    shrinkage,
    weights: normalizeWeights({
      skillMarkov: defaults.skillMarkov * (1 - shrinkage) + raw.skillMarkov * shrinkage,
      exchangeMonteCarlo: defaults.exchangeMonteCarlo * (1 - shrinkage) + raw.exchangeMonteCarlo * shrinkage,
      roundByRound: defaults.roundByRound * (1 - shrinkage) + raw.roundByRound * shrinkage,
      styleMatchup: defaults.styleMatchup * (1 - shrinkage) + raw.styleMatchup * shrinkage
    })
  };
}

function withoutBuckets(report: UfcEnsembleCalibrationReport): Omit<UfcEnsembleCalibrationReport, "bucketReports"> {
  const { bucketReports, ...rest } = report;
  return rest;
}

function calculateUfcEnsembleCalibrationReportInternal(rows: UfcEnsembleCalibrationRow[], options: UfcEnsembleCalibrationOptions = {}, includeBucketReports = true): UfcEnsembleCalibrationReport {
  const defaultWeights = normalizeWeights(options.defaultWeights ?? DEFAULT_WEIGHTS);
  const minSamples = options.minSamples ?? DEFAULT_MIN_SAMPLES;
  const gridStep = options.gridStep ?? DEFAULT_GRID_STEP;
  const defaultMetrics = scoreUfcEnsembleWeights(rows, defaultWeights);
  const bestRaw = rows.length ? bestWeightsByLogLoss(rows, gridStep) : { weights: defaultWeights, metrics: defaultMetrics };
  const shrunk = shrinkWeights(bestRaw.weights, defaultWeights, rows.length, minSamples);
  const recommendedMetrics = scoreUfcEnsembleWeights(rows, shrunk.weights);
  const bucketReports: Record<string, Omit<UfcEnsembleCalibrationReport, "bucketReports">> = {};
  const bucketNames = includeBucketReports ? [...new Set(rows.map((row) => row.bucket).filter((bucket): bucket is string => Boolean(bucket)))] : [];

  for (const bucket of bucketNames) {
    bucketReports[bucket] = withoutBuckets(calculateUfcEnsembleCalibrationReportInternal(rows.filter((row) => row.bucket === bucket), options, false));
  }

  return {
    sampleCount: rows.length,
    defaultWeights,
    bestRawWeights: bestRaw.weights,
    recommendedWeights: shrunk.weights,
    shrinkage: shrunk.shrinkage,
    defaultMetrics,
    bestRawMetrics: bestRaw.metrics,
    recommendedMetrics,
    bucketReports
  };
}

export function calculateUfcEnsembleCalibrationReport(rows: UfcEnsembleCalibrationRow[], options: UfcEnsembleCalibrationOptions = {}): UfcEnsembleCalibrationReport {
  return calculateUfcEnsembleCalibrationReportInternal(rows, options, true);
}

function engineBucket(payload: any) {
  const flags = Array.isArray(payload?.sim?.dangerFlags) ? payload.sim.dangerFlags : [];
  if (flags.includes("engine-disagreement")) return "engine-disagreement";
  if (flags.includes("finish-volatility")) return "finish-volatility";
  if (flags.includes("style-engine-close-fight")) return "style-close-fight";
  if (flags.includes("style-input-volatility")) return "style-input-volatility";
  if (flags.includes("high-upset-risk")) return "high-upset-risk";
  if (flags.includes("round-engine-close-fight")) return "round-engine-close-fight";
  return "all";
}

function extractCalibrationRow(row: {
  fight_id: string;
  fighter_a_id: string;
  actual_winner_fighter_id: string | null;
  payload_json: any;
}): UfcEnsembleCalibrationRow | null {
  const skill = row.payload_json?.sim?.sourceOutputs?.skillMarkov?.fighterAWinProbability;
  const exchange = row.payload_json?.sim?.sourceOutputs?.exchangeMonteCarlo?.fighterAWinProbability;
  const roundEngine = row.payload_json?.sim?.sourceOutputs?.roundByRound?.fighterAWinProbability;
  const style = row.payload_json?.sim?.sourceOutputs?.styleMatchup?.fighterAWinProbability;
  if (typeof skill !== "number" || typeof exchange !== "number" || !row.actual_winner_fighter_id) return null;
  return {
    fightId: row.fight_id,
    actualWinner: row.actual_winner_fighter_id === row.fighter_a_id ? "A" : "B",
    skillMarkovFighterAWinProbability: skill,
    exchangeMonteCarloFighterAWinProbability: exchange,
    roundByRoundFighterAWinProbability: typeof roundEngine === "number" ? roundEngine : (skill + exchange) / 2,
    styleMatchupFighterAWinProbability: typeof style === "number" ? style : (skill + exchange + (typeof roundEngine === "number" ? roundEngine : 0.5)) / 3,
    bucket: engineBucket(row.payload_json)
  };
}

export async function loadResolvedUfcEnsembleCalibrationRows(modelVersion = "ufc-fight-iq-v1") {
  const rows = await prisma.$queryRaw<Array<{
    fight_id: string;
    fighter_a_id: string;
    actual_winner_fighter_id: string | null;
    payload_json: any;
  }>>`
    SELECT s.fight_id, f.fighter_a_id, s.actual_winner_fighter_id, s.payload_json
    FROM ufc_shadow_predictions s
    JOIN ufc_fights f ON f.id = s.fight_id
    WHERE s.model_version = ${modelVersion}
      AND s.status = 'RESOLVED'
      AND s.actual_winner_fighter_id IS NOT NULL
  `;
  return rows.map(extractCalibrationRow).filter((row): row is UfcEnsembleCalibrationRow => row !== null);
}

export async function persistUfcEnsembleCalibrationReport(modelVersion = "ufc-fight-iq-v1", label = "ensemble-weight-learner") {
  const rows = await loadResolvedUfcEnsembleCalibrationRows(modelVersion);
  const report = calculateUfcEnsembleCalibrationReport(rows);
  const id = stableId("ufcew", `${modelVersion}:${label}:${new Date().toISOString()}`);
  await prisma.$executeRaw`
    INSERT INTO ufc_calibration_snapshots (id, model_version, snapshot_label, generated_at, fight_count, accuracy_pct, log_loss, brier_score, calibration_error, avg_clv_pct, bucket_json, metrics_json, updated_at)
    VALUES (${id}, ${modelVersion}, ${label}, now(), ${report.sampleCount}, ${report.recommendedMetrics.accuracyPct}, ${report.recommendedMetrics.logLoss}, ${report.recommendedMetrics.brierScore}, ${report.recommendedMetrics.calibrationError}, null, ${JSON.stringify(report.bucketReports)}::jsonb, ${JSON.stringify(report)}::jsonb, now())
  `;
  return { id, report };
}
