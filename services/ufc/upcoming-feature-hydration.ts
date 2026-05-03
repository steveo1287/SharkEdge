import crypto from "node:crypto";

import { prisma } from "@/lib/db/prisma";

export type UfcHydrationAction = "create" | "skip-existing" | "skip-insufficient-data";

export type UfcHydratedFeature = {
  id: string;
  fightId: string;
  fightDate: string;
  fighterId: string;
  opponentFighterId: string;
  snapshotAt: string;
  modelVersion: string;
  proFights: number | null;
  ufcFights: number | null;
  roundsFought: number | null;
  sigStrikesLandedPerMin: number | null;
  sigStrikesAbsorbedPerMin: number | null;
  strikingDifferential: number | null;
  takedownsPer15: number | null;
  takedownDefensePct: number | null;
  submissionAttemptsPer15: number | null;
  controlTimePct: number | null;
  opponentAdjustedStrength: number | null;
  coldStartActive: boolean;
  feature: Record<string, unknown>;
};

type CandidateRow = {
  fight_id: string;
  fight_date: Date | string;
  event_label: string;
  fighter_a_id: string;
  fighter_b_id: string;
  fighter_a_name: string | null;
  fighter_b_name: string | null;
  fighter_a_payload: Record<string, unknown> | null;
  fighter_b_payload: Record<string, unknown> | null;
  fighter_a_feature_count: number | bigint;
  fighter_b_feature_count: number | bigint;
};

const DEFAULT_MODEL_VERSION = "ufc-fight-iq-v1";

function stableId(prefix: string, value: string) {
  return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function count(value: number | bigint) {
  return typeof value === "bigint" ? Number(value) : value;
}

function numeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/%$/, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function pickUfcPayloadNumber(payload: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = numeric(payload[key]);
    if (value != null) return value;
  }
  const rawFeature = payload.rawFeature;
  if (rawFeature && typeof rawFeature === "object") {
    for (const key of keys) {
      const value = numeric((rawFeature as Record<string, unknown>)[key]);
      if (value != null) return value;
    }
  }
  return null;
}

export function hasHydratableUfcPayload(payload: Record<string, unknown>) {
  const available = [
    pickUfcPayloadNumber(payload, "slpm", "sigStrikesLandedPerMin", "sig_strikes_landed_per_min"),
    pickUfcPayloadNumber(payload, "sapm", "sigStrikesAbsorbedPerMin", "sig_strikes_absorbed_per_min"),
    pickUfcPayloadNumber(payload, "takedownsPer15", "takedowns_per_15"),
    pickUfcPayloadNumber(payload, "takedownDefensePct", "takedown_defense_pct"),
    pickUfcPayloadNumber(payload, "submissionAttemptsPer15", "submission_attempts_per_15")
  ].filter((value) => value != null).length;
  return available >= 2;
}

function snapshotBeforeFight(fightDate: string) {
  const fightMs = new Date(fightDate).getTime();
  if (!Number.isFinite(fightMs)) return new Date().toISOString();
  return new Date(Math.min(Date.now(), fightMs - 60_000)).toISOString();
}

export function buildHydratedUfcFeature(input: {
  fightId: string;
  fightDate: string;
  fighterId: string;
  opponentFighterId: string;
  modelVersion?: string;
  payload: Record<string, unknown>;
}): UfcHydratedFeature | null {
  if (!hasHydratableUfcPayload(input.payload)) return null;
  const modelVersion = input.modelVersion ?? DEFAULT_MODEL_VERSION;
  const slpm = pickUfcPayloadNumber(input.payload, "slpm", "sigStrikesLandedPerMin", "sig_strikes_landed_per_min");
  const sapm = pickUfcPayloadNumber(input.payload, "sapm", "sigStrikesAbsorbedPerMin", "sig_strikes_absorbed_per_min");
  const proFights = pickUfcPayloadNumber(input.payload, "proFights", "pro_fights");
  const ufcFights = pickUfcPayloadNumber(input.payload, "ufcFights", "ufc_fights");
  return {
    id: stableId("ufcmf", `${input.fightId}:${input.fighterId}:${modelVersion}:hydrated`),
    fightId: input.fightId,
    fightDate: input.fightDate,
    fighterId: input.fighterId,
    opponentFighterId: input.opponentFighterId,
    snapshotAt: snapshotBeforeFight(input.fightDate),
    modelVersion,
    proFights: proFights == null ? null : Math.max(0, Math.round(proFights)),
    ufcFights: ufcFights == null ? null : Math.max(0, Math.round(ufcFights)),
    roundsFought: pickUfcPayloadNumber(input.payload, "roundsFought", "rounds_fought"),
    sigStrikesLandedPerMin: slpm,
    sigStrikesAbsorbedPerMin: sapm,
    strikingDifferential: slpm != null && sapm != null ? Number((slpm - sapm).toFixed(3)) : null,
    takedownsPer15: pickUfcPayloadNumber(input.payload, "takedownsPer15", "takedowns_per_15"),
    takedownDefensePct: pickUfcPayloadNumber(input.payload, "takedownDefensePct", "takedown_defense_pct"),
    submissionAttemptsPer15: pickUfcPayloadNumber(input.payload, "submissionAttemptsPer15", "submission_attempts_per_15"),
    controlTimePct: pickUfcPayloadNumber(input.payload, "controlTimePct", "control_time_pct"),
    opponentAdjustedStrength: pickUfcPayloadNumber(input.payload, "opponentAdjustedStrength", "opponent_adjusted_strength") ?? 50,
    coldStartActive: (ufcFights ?? 0) < 3 || (proFights ?? 0) < 8,
    feature: {
      source: "upcoming-feature-hydration",
      hydrationQuality: "profile-derived",
      rawSource: input.payload.sourceKey ?? input.payload.source ?? null,
      age: pickUfcPayloadNumber(input.payload, "age"),
      heightInches: pickUfcPayloadNumber(input.payload, "heightInches", "height_inches"),
      reachInches: pickUfcPayloadNumber(input.payload, "reachInches", "reach_inches"),
      sigStrikeAccuracyPct: pickUfcPayloadNumber(input.payload, "sigStrikeAccuracyPct", "strikeAccuracyPct", "sig_strike_accuracy_pct"),
      sigStrikeDefensePct: pickUfcPayloadNumber(input.payload, "sigStrikeDefensePct", "strikeDefensePct", "sig_strike_defense_pct"),
      takedownAccuracyPct: pickUfcPayloadNumber(input.payload, "takedownAccuracyPct", "takedown_accuracy_pct")
    }
  };
}

export function hydrationAction(existingCount: number, payload: Record<string, unknown>): UfcHydrationAction {
  if (existingCount > 0) return "skip-existing";
  return hasHydratableUfcPayload(payload) ? "create" : "skip-insufficient-data";
}

async function insertFeature(feature: UfcHydratedFeature) {
  await prisma.$executeRaw`
    INSERT INTO ufc_model_features (id, fight_id, fight_date, fighter_id, opponent_fighter_id, snapshot_at, model_version, pro_fights, ufc_fights, rounds_fought, sig_strikes_landed_per_min, sig_strikes_absorbed_per_min, striking_differential, takedowns_per_15, takedown_defense_pct, submission_attempts_per_15, control_time_pct, opponent_adjusted_strength, cold_start_active, feature_json, updated_at)
    VALUES (${feature.id}, ${feature.fightId}, ${feature.fightDate}, ${feature.fighterId}, ${feature.opponentFighterId}, ${feature.snapshotAt}, ${feature.modelVersion}, ${feature.proFights}, ${feature.ufcFights}, ${feature.roundsFought}, ${feature.sigStrikesLandedPerMin}, ${feature.sigStrikesAbsorbedPerMin}, ${feature.strikingDifferential}, ${feature.takedownsPer15}, ${feature.takedownDefensePct}, ${feature.submissionAttemptsPer15}, ${feature.controlTimePct}, ${feature.opponentAdjustedStrength}, ${feature.coldStartActive}, ${JSON.stringify(feature.feature)}::jsonb, now())
    ON CONFLICT (fight_id, fighter_id, model_version) DO NOTHING
  `;
}

export async function hydrateUpcomingUfcFeatureSnapshots(options: { modelVersion?: string; horizonDays?: number; limit?: number; dryRun?: boolean } = {}) {
  const modelVersion = options.modelVersion ?? DEFAULT_MODEL_VERSION;
  const horizonDays = Math.max(1, Math.floor(options.horizonDays ?? 120));
  const limit = Math.max(1, Math.min(200, Math.floor(options.limit ?? 100)));
  const rows = await prisma.$queryRaw<CandidateRow[]>`
    SELECT f.id AS fight_id, f.fight_date, f.event_label, f.fighter_a_id, f.fighter_b_id,
      fa.full_name AS fighter_a_name, fb.full_name AS fighter_b_name,
      fa.payload_json AS fighter_a_payload, fb.payload_json AS fighter_b_payload,
      COUNT(DISTINCT af.id) AS fighter_a_feature_count,
      COUNT(DISTINCT bf.id) AS fighter_b_feature_count
    FROM ufc_fights f
    LEFT JOIN ufc_fighters fa ON fa.id = f.fighter_a_id
    LEFT JOIN ufc_fighters fb ON fb.id = f.fighter_b_id
    LEFT JOIN ufc_model_features af ON af.fight_id = f.id AND af.fighter_id = f.fighter_a_id AND af.model_version = ${modelVersion} AND af.snapshot_at <= f.fight_date
    LEFT JOIN ufc_model_features bf ON bf.fight_id = f.id AND bf.fighter_id = f.fighter_b_id AND bf.model_version = ${modelVersion} AND bf.snapshot_at <= f.fight_date
    WHERE f.fight_date >= now() - interval '12 hours'
      AND f.fight_date <= now() + (${horizonDays}::text || ' days')::interval
    GROUP BY f.id, f.fight_date, f.event_label, f.fighter_a_id, f.fighter_b_id, fa.full_name, fb.full_name, fa.payload_json, fb.payload_json
    HAVING COUNT(DISTINCT af.id) = 0 OR COUNT(DISTINCT bf.id) = 0
    ORDER BY f.fight_date ASC, f.event_label
    LIMIT ${limit}
  `;

  let createdFeatureCount = 0;
  let skippedFeatureCount = 0;
  const errors: string[] = [];
  const candidates = [];
  for (const row of rows) {
    const fightDate = toIso(row.fight_date);
    const aPayload = row.fighter_a_payload ?? {};
    const bPayload = row.fighter_b_payload ?? {};
    const aCount = count(row.fighter_a_feature_count);
    const bCount = count(row.fighter_b_feature_count);
    const fighterAAction = hydrationAction(aCount, aPayload);
    const fighterBAction = hydrationAction(bCount, bPayload);
    candidates.push({ fightId: row.fight_id, eventLabel: row.event_label, fighterAName: row.fighter_a_name, fighterBName: row.fighter_b_name, fighterAAction, fighterBAction });
    const features = [
      fighterAAction === "create" ? buildHydratedUfcFeature({ fightId: row.fight_id, fightDate, fighterId: row.fighter_a_id, opponentFighterId: row.fighter_b_id, modelVersion, payload: aPayload }) : null,
      fighterBAction === "create" ? buildHydratedUfcFeature({ fightId: row.fight_id, fightDate, fighterId: row.fighter_b_id, opponentFighterId: row.fighter_a_id, modelVersion, payload: bPayload }) : null
    ];
    for (const feature of features) {
      if (!feature) { skippedFeatureCount += 1; continue; }
      if (!options.dryRun) {
        try { await insertFeature(feature); } catch (error) { errors.push(`${feature.fightId}:${feature.fighterId}: ${error instanceof Error ? error.message : String(error)}`); continue; }
      }
      createdFeatureCount += 1;
    }
  }
  return { ok: errors.length === 0, mode: options.dryRun ? "dry-run" : "hydrate", modelVersion, candidateCount: rows.length, createdFeatureCount, skippedFeatureCount, candidates, errors };
}
