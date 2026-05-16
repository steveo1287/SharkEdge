import { prisma } from "@/lib/db/prisma";
import type { UfcEnsembleWeights } from "@/services/ufc/ensemble-sim";

export const DEFAULT_UFC_ENSEMBLE_WEIGHTS: UfcEnsembleWeights = {
  skillMarkov: 0.42,
  exchangeMonteCarlo: 0.34,
  roundByRound: 0.24
};

export type UfcEnsembleWeightSource = "manual" | "learned" | "default";

export type UfcResolvedEnsembleWeights = {
  weights: UfcEnsembleWeights;
  source: UfcEnsembleWeightSource;
  calibrationSnapshotId?: string | null;
  generatedAt?: string | null;
  sampleCount?: number | null;
  shrinkage?: number | null;
};

export type UfcManualEnsembleWeightOverride = {
  skillMarkovWeight?: number | null;
  exchangeMonteCarloWeight?: number | null;
  roundByRoundWeight?: number | null;
};

type CalibrationSnapshotRow = {
  id: string;
  generated_at: Date | string;
  metrics_json: any;
};

function round(value: number, digits = 4) { return Number(value.toFixed(digits)); }

export function normalizeUfcEnsembleWeights(weights: Partial<UfcEnsembleWeights>): UfcEnsembleWeights {
  const skill = Number.isFinite(weights.skillMarkov) ? Math.max(0, Number(weights.skillMarkov)) : 0;
  const exchange = Number.isFinite(weights.exchangeMonteCarlo) ? Math.max(0, Number(weights.exchangeMonteCarlo)) : 0;
  const roundEngine = Number.isFinite(weights.roundByRound) ? Math.max(0, Number(weights.roundByRound)) : 0;
  const total = skill + exchange + roundEngine;
  if (total <= 0) return DEFAULT_UFC_ENSEMBLE_WEIGHTS;
  return { skillMarkov: round(skill / total), exchangeMonteCarlo: round(exchange / total), roundByRound: round(roundEngine / total) };
}

export function parseManualUfcEnsembleWeights(override?: UfcManualEnsembleWeightOverride | null): UfcEnsembleWeights | null {
  if (!override) return null;
  const hasSkill = typeof override.skillMarkovWeight === "number" && Number.isFinite(override.skillMarkovWeight);
  const hasExchange = typeof override.exchangeMonteCarloWeight === "number" && Number.isFinite(override.exchangeMonteCarloWeight);
  const hasRound = typeof override.roundByRoundWeight === "number" && Number.isFinite(override.roundByRoundWeight);
  if (!hasSkill && !hasExchange && !hasRound) return null;
  return normalizeUfcEnsembleWeights({
    skillMarkov: hasSkill ? Number(override.skillMarkovWeight) : DEFAULT_UFC_ENSEMBLE_WEIGHTS.skillMarkov,
    exchangeMonteCarlo: hasExchange ? Number(override.exchangeMonteCarloWeight) : DEFAULT_UFC_ENSEMBLE_WEIGHTS.exchangeMonteCarlo,
    roundByRound: hasRound ? Number(override.roundByRoundWeight) : DEFAULT_UFC_ENSEMBLE_WEIGHTS.roundByRound
  });
}

export function parseLearnedUfcEnsembleWeights(row: CalibrationSnapshotRow | null | undefined): UfcResolvedEnsembleWeights | null {
  const metrics = row?.metrics_json;
  const recommended = metrics?.recommendedWeights;
  if (!row || !recommended) return null;
  const skill = recommended.skillMarkov;
  const exchange = recommended.exchangeMonteCarlo;
  const roundEngine = recommended.roundByRound;
  if (typeof skill !== "number" || typeof exchange !== "number" || !Number.isFinite(skill) || !Number.isFinite(exchange)) return null;
  return {
    weights: normalizeUfcEnsembleWeights({ skillMarkov: skill, exchangeMonteCarlo: exchange, roundByRound: typeof roundEngine === "number" && Number.isFinite(roundEngine) ? roundEngine : DEFAULT_UFC_ENSEMBLE_WEIGHTS.roundByRound }),
    source: "learned",
    calibrationSnapshotId: row.id,
    generatedAt: row.generated_at ? new Date(row.generated_at).toISOString() : null,
    sampleCount: typeof metrics.sampleCount === "number" ? metrics.sampleCount : null,
    shrinkage: typeof metrics.shrinkage === "number" ? metrics.shrinkage : null
  };
}

export async function loadLatestLearnedUfcEnsembleWeights(modelVersion = "ufc-fight-iq-v1"): Promise<UfcResolvedEnsembleWeights | null> {
  const rows = await prisma.$queryRaw<CalibrationSnapshotRow[]>`
    SELECT id, generated_at, metrics_json
    FROM ufc_calibration_snapshots
    WHERE model_version = ${modelVersion}
      AND snapshot_label = 'ensemble-weight-learner'
    ORDER BY generated_at DESC
    LIMIT 1
  `;
  return parseLearnedUfcEnsembleWeights(rows[0]);
}

export async function resolveUfcEnsembleWeights(modelVersion = "ufc-fight-iq-v1", override?: UfcManualEnsembleWeightOverride | null): Promise<UfcResolvedEnsembleWeights> {
  const manual = parseManualUfcEnsembleWeights(override);
  if (manual) return { weights: manual, source: "manual", calibrationSnapshotId: null, generatedAt: null, sampleCount: null, shrinkage: null };
  const learned = await loadLatestLearnedUfcEnsembleWeights(modelVersion);
  if (learned) return learned;
  return { weights: DEFAULT_UFC_ENSEMBLE_WEIGHTS, source: "default", calibrationSnapshotId: null, generatedAt: null, sampleCount: null, shrinkage: null };
}