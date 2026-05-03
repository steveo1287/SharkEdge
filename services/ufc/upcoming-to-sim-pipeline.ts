import crypto from "node:crypto";

import { prisma } from "@/lib/db/prisma";
import { runUfcOperationalSkillSim } from "@/services/ufc/operational-sim";
import { ingestUpcomingUfcCards, type UfcUpcomingCardIngestionOptions } from "@/services/ufc/upcoming-card-ingestion";

export type UfcUpcomingToSimPipelineOptions = UfcUpcomingCardIngestionOptions & {
  skipIngest?: boolean;
  modelVersion?: string;
  horizonDays?: number;
  limit?: number;
  simulations?: number;
  seed?: number;
  recordShadow?: boolean;
  allowFallbackFeatures?: boolean;
  dryRun?: boolean;
};

export type UfcUpcomingSimCandidate = {
  fightId: string;
  eventId: string | null;
  eventName: string | null;
  eventDate: string | null;
  eventLabel: string;
  fightDate: string;
  scheduledRounds: number;
  fighterAId: string;
  fighterBId: string;
  fighterAName: string | null;
  fighterBName: string | null;
  sourceStatus: string | null;
  hasPrediction: boolean;
  fighterAFeatureCount: number;
  fighterBFeatureCount: number;
};

export type UfcUpcomingToSimPipelineResult = {
  ok: boolean;
  mode: "dry-run" | "ingest-and-sim" | "simulate-only";
  modelVersion: string;
  ingestion: unknown | null;
  candidateCount: number;
  simulatedCount: number;
  skippedCount: number;
  fallbackFeatureCount: number;
  candidates: Array<UfcUpcomingSimCandidate & { action: "simulate" | "skip-existing" | "skip-missing-features" | "dry-run" }>;
  simulations: unknown[];
  errors: string[];
};

type CandidateRow = {
  fight_id: string;
  event_id: string | null;
  event_name: string | null;
  event_date: Date | string | null;
  event_label: string;
  fight_date: Date | string;
  scheduled_rounds: number;
  fighter_a_id: string;
  fighter_b_id: string;
  fighter_a_name: string | null;
  fighter_b_name: string | null;
  source_status: string | null;
  prediction_count: number | bigint;
  fighter_a_feature_count: number | bigint;
  fighter_b_feature_count: number | bigint;
};

const DEFAULT_MODEL_VERSION = "ufc-fight-iq-v1";
const DEFAULT_HORIZON_DAYS = 120;
const DEFAULT_LIMIT = 25;
const BASELINE_FEATURES = {
  proFights: 0,
  ufcFights: 0,
  roundsFought: 0,
  sigStrikesLandedPerMin: 2.75,
  sigStrikesAbsorbedPerMin: 2.75,
  strikingDifferential: 0,
  takedownsPer15: 0.8,
  takedownDefensePct: 50,
  submissionAttemptsPer15: 0.25,
  controlTimePct: 0,
  opponentAdjustedStrength: 50
};

function stableId(prefix: string, value: string) {
  return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

function toIso(value: Date | string | null) {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toCount(value: number | bigint) {
  return typeof value === "bigint" ? Number(value) : value;
}

export function hasCompleteFeaturePair(candidate: Pick<UfcUpcomingSimCandidate, "fighterAFeatureCount" | "fighterBFeatureCount">) {
  return candidate.fighterAFeatureCount > 0 && candidate.fighterBFeatureCount > 0;
}

export function shouldSimulateUpcomingCandidate(candidate: Pick<UfcUpcomingSimCandidate, "hasPrediction" | "fighterAFeatureCount" | "fighterBFeatureCount">, allowFallbackFeatures: boolean) {
  if (candidate.hasPrediction) return "skip-existing" as const;
  if (hasCompleteFeaturePair(candidate) || allowFallbackFeatures) return "simulate" as const;
  return "skip-missing-features" as const;
}

export function buildFallbackFeaturePayload(input: {
  fightId: string;
  fightDate: string;
  fighterId: string;
  opponentFighterId: string;
  modelVersion: string;
}) {
  return {
    id: stableId("ufcmf", `${input.fightId}:${input.fighterId}:${input.modelVersion}:fallback`),
    fightId: input.fightId,
    fightDate: input.fightDate,
    fighterId: input.fighterId,
    opponentFighterId: input.opponentFighterId,
    modelVersion: input.modelVersion,
    snapshotAt: new Date(Math.min(Date.now(), new Date(input.fightDate).getTime() - 60_000)).toISOString(),
    ...BASELINE_FEATURES,
    coldStartActive: true,
    feature: {
      source: "upcoming-card-fallback",
      dataQuality: "D",
      confidenceCapReason: "missing_pre_fight_feature_snapshot",
      age: null,
      reachInches: null,
      heightInches: null,
      daysSinceLastFight: null,
      sigStrikeAccuracyPct: 45,
      sigStrikeDefensePct: 50,
      takedownAccuracyPct: 30,
      finishRate: 0.4,
      recentFormScore: 50,
      lateRoundPerformance: 50
    }
  };
}

async function queryCandidates(modelVersion: string, horizonDays: number, limit: number): Promise<UfcUpcomingSimCandidate[]> {
  const rows = await prisma.$queryRaw<CandidateRow[]>`
    SELECT
      f.id AS fight_id,
      e.id AS event_id,
      e.event_name,
      e.event_date,
      f.event_label,
      f.fight_date,
      f.scheduled_rounds,
      f.fighter_a_id,
      f.fighter_b_id,
      fa.full_name AS fighter_a_name,
      fb.full_name AS fighter_b_name,
      f.source_status,
      COUNT(DISTINCT p.id) AS prediction_count,
      COUNT(DISTINCT af.id) AS fighter_a_feature_count,
      COUNT(DISTINCT bf.id) AS fighter_b_feature_count
    FROM ufc_fights f
    LEFT JOIN ufc_events e ON e.id = f.event_id
    LEFT JOIN ufc_fighters fa ON fa.id = f.fighter_a_id
    LEFT JOIN ufc_fighters fb ON fb.id = f.fighter_b_id
    LEFT JOIN ufc_predictions p ON p.fight_id = f.id AND p.model_version = ${modelVersion}
    LEFT JOIN ufc_model_features af ON af.fight_id = f.id AND af.fighter_id = f.fighter_a_id AND af.model_version = ${modelVersion} AND af.snapshot_at <= f.fight_date
    LEFT JOIN ufc_model_features bf ON bf.fight_id = f.id AND bf.fighter_id = f.fighter_b_id AND bf.model_version = ${modelVersion} AND bf.snapshot_at <= f.fight_date
    WHERE f.fight_date >= now() - interval '12 hours'
      AND f.fight_date <= now() + (${horizonDays}::text || ' days')::interval
    GROUP BY f.id, e.id, e.event_name, e.event_date, f.event_label, f.fight_date, f.scheduled_rounds, f.fighter_a_id, f.fighter_b_id, fa.full_name, fb.full_name, f.source_status
    ORDER BY f.fight_date ASC, f.bout_order NULLS LAST, f.event_label
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    fightId: row.fight_id,
    eventId: row.event_id,
    eventName: row.event_name,
    eventDate: toIso(row.event_date),
    eventLabel: row.event_label,
    fightDate: toIso(row.fight_date) ?? new Date().toISOString(),
    scheduledRounds: row.scheduled_rounds,
    fighterAId: row.fighter_a_id,
    fighterBId: row.fighter_b_id,
    fighterAName: row.fighter_a_name,
    fighterBName: row.fighter_b_name,
    sourceStatus: row.source_status,
    hasPrediction: toCount(row.prediction_count) > 0,
    fighterAFeatureCount: toCount(row.fighter_a_feature_count),
    fighterBFeatureCount: toCount(row.fighter_b_feature_count)
  }));
}

async function seedFallbackFeatures(candidate: UfcUpcomingSimCandidate, modelVersion: string) {
  const payloads = [];
  if (candidate.fighterAFeatureCount === 0) {
    payloads.push(buildFallbackFeaturePayload({ fightId: candidate.fightId, fightDate: candidate.fightDate, fighterId: candidate.fighterAId, opponentFighterId: candidate.fighterBId, modelVersion }));
  }
  if (candidate.fighterBFeatureCount === 0) {
    payloads.push(buildFallbackFeaturePayload({ fightId: candidate.fightId, fightDate: candidate.fightDate, fighterId: candidate.fighterBId, opponentFighterId: candidate.fighterAId, modelVersion }));
  }

  for (const payload of payloads) {
    await prisma.$executeRaw`
      INSERT INTO ufc_model_features (id, fight_id, fight_date, fighter_id, opponent_fighter_id, snapshot_at, model_version, pro_fights, ufc_fights, rounds_fought, sig_strikes_landed_per_min, sig_strikes_absorbed_per_min, striking_differential, takedowns_per_15, takedown_defense_pct, submission_attempts_per_15, control_time_pct, opponent_adjusted_strength, cold_start_active, feature_json, updated_at)
      VALUES (${payload.id}, ${payload.fightId}, ${payload.fightDate}, ${payload.fighterId}, ${payload.opponentFighterId}, ${payload.snapshotAt}, ${payload.modelVersion}, ${payload.proFights}, ${payload.ufcFights}, ${payload.roundsFought}, ${payload.sigStrikesLandedPerMin}, ${payload.sigStrikesAbsorbedPerMin}, ${payload.strikingDifferential}, ${payload.takedownsPer15}, ${payload.takedownDefensePct}, ${payload.submissionAttemptsPer15}, ${payload.controlTimePct}, ${payload.opponentAdjustedStrength}, ${payload.coldStartActive}, ${JSON.stringify(payload.feature)}::jsonb, now())
      ON CONFLICT (fight_id, fighter_id, model_version) DO NOTHING
    `;
  }

  return payloads.length;
}

export async function runUfcUpcomingToSimPipeline(options: UfcUpcomingToSimPipelineOptions = {}): Promise<UfcUpcomingToSimPipelineResult> {
  const modelVersion = options.modelVersion ?? DEFAULT_MODEL_VERSION;
  const horizonDays = Math.max(1, Math.floor(options.horizonDays ?? DEFAULT_HORIZON_DAYS));
  const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? DEFAULT_LIMIT)));
  const mode = options.dryRun ? "dry-run" : options.skipIngest ? "simulate-only" : "ingest-and-sim";
  const errors: string[] = [];
  const simulations: unknown[] = [];
  let fallbackFeatureCount = 0;
  let ingestion: unknown | null = null;

  if (!options.skipIngest) {
    ingestion = await ingestUpcomingUfcCards({ ...options, dryRun: options.dryRun });
  }

  const candidates = await queryCandidates(modelVersion, horizonDays, limit);
  const annotatedCandidates: UfcUpcomingToSimPipelineResult["candidates"] = [];

  for (const candidate of candidates) {
    const action = options.dryRun ? "dry-run" : shouldSimulateUpcomingCandidate(candidate, Boolean(options.allowFallbackFeatures));
    annotatedCandidates.push({ ...candidate, action });
    if (action !== "simulate") continue;

    try {
      if (options.allowFallbackFeatures && !hasCompleteFeaturePair(candidate)) {
        fallbackFeatureCount += await seedFallbackFeatures(candidate, modelVersion);
      }
      simulations.push(await runUfcOperationalSkillSim(candidate.fightId, {
        modelVersion,
        simulations: options.simulations,
        seed: options.seed,
        recordShadow: options.recordShadow
      }));
    } catch (error) {
      errors.push(`${candidate.fightId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const simulatedCount = simulations.length;
  const skippedCount = annotatedCandidates.filter((candidate) => candidate.action !== "simulate").length;
  return {
    ok: errors.length === 0,
    mode,
    modelVersion,
    ingestion,
    candidateCount: candidates.length,
    simulatedCount,
    skippedCount,
    fallbackFeatureCount,
    candidates: annotatedCandidates,
    simulations,
    errors
  };
}
