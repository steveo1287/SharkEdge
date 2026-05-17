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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/%$/, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function payloadRecords(payload: Record<string, unknown>) {
  const eliteProfile = asRecord(payload.eliteProfile);
  return [
    payload,
    asRecord(payload.stats),
    asRecord(payload.profile),
    asRecord(payload.rawPayload),
    asRecord(payload.rawFeature),
    eliteProfile,
    asRecord(eliteProfile.sample),
    asRecord(eliteProfile.careerStats),
    asRecord(eliteProfile.background),
    asRecord(payload.careerStats),
    asRecord(payload.background),
    asRecord(payload.spiderSkills)
  ];
}

export function pickUfcPayloadNumber(payload: Record<string, unknown>, ...keys: string[]) {
  for (const record of payloadRecords(payload)) {
    for (const key of keys) {
      const value = numeric(record[key]);
      if (value != null) return value;
    }
  }
  return null;
}

function pickUfcPayloadString(payload: Record<string, unknown>, ...keys: string[]) {
  for (const record of payloadRecords(payload)) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return null;
}

function normalizePct(value: number | null) {
  if (value == null) return null;
  return value > 1 ? value : value * 100;
}

function estimateRounds(proFights: number | null, ufcFights: number | null, wins: number | null, losses: number | null) {
  const explicit = pickPositive(proFights, ufcFights);
  const recordFights = (wins ?? 0) + (losses ?? 0);
  const fights = explicit ?? (recordFights > 0 ? recordFights : null);
  return fights == null ? null : Math.max(1, Math.round(fights * 2.15));
}

function pickPositive(...values: Array<number | null>) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

export function hasHydratableUfcPayload(payload: Record<string, unknown>) {
  const available = [
    pickUfcPayloadNumber(payload, "slpm", "sigStrikesLandedPerMin", "sig_strikes_landed_per_min"),
    pickUfcPayloadNumber(payload, "sapm", "sigStrikesAbsorbedPerMin", "sig_strikes_absorbed_per_min"),
    pickUfcPayloadNumber(payload, "takedownsPer15", "takedowns_per_15", "tdAvg", "td_avg"),
    pickUfcPayloadNumber(payload, "takedownDefensePct", "takedown_defense_pct", "tdDefense"),
    pickUfcPayloadNumber(payload, "submissionAttemptsPer15", "submission_attempts_per_15", "subAvg")
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
  const ufcFights = pickUfcPayloadNumber(input.payload, "ufcFights", "ufc_fights") ?? proFights;
  const wins = pickUfcPayloadNumber(input.payload, "wins", "recordWins", "record_wins");
  const losses = pickUfcPayloadNumber(input.payload, "losses", "recordLosses", "record_losses");
  const roundsFought = pickUfcPayloadNumber(input.payload, "roundsFought", "rounds_fought") ?? estimateRounds(proFights, ufcFights, wins, losses);
  const sigStrikeAccuracyPct = normalizePct(pickUfcPayloadNumber(input.payload, "sigStrikeAccuracyPct", "strikeAccuracyPct", "sig_strike_accuracy_pct"));
  const sigStrikeDefensePct = normalizePct(pickUfcPayloadNumber(input.payload, "sigStrikeDefensePct", "strikeDefensePct", "sig_strike_defense_pct"));
  const takedownsPer15 = pickUfcPayloadNumber(input.payload, "takedownsPer15", "takedowns_per_15", "tdAvg", "td_avg");
  const takedownAccuracyPct = normalizePct(pickUfcPayloadNumber(input.payload, "takedownAccuracyPct", "takedown_accuracy_pct", "tdAccuracy"));
  const takedownDefensePct = normalizePct(pickUfcPayloadNumber(input.payload, "takedownDefensePct", "takedown_defense_pct", "tdDefense"));
  const submissionAttemptsPer15 = pickUfcPayloadNumber(input.payload, "submissionAttemptsPer15", "submission_attempts_per_15", "subAvg");
  const controlTimePct = normalizePct(pickUfcPayloadNumber(input.payload, "controlTimePct", "control_time_pct")) ?? Math.max(4, Math.min(42, (takedownsPer15 ?? 0.8) * 7.5 + (submissionAttemptsPer15 ?? 0.25) * 3.5));
  const controlEscapePct = normalizePct(pickUfcPayloadNumber(input.payload, "controlEscapePct", "control_escape_pct", "escapePct")) ?? (takedownDefensePct != null ? Math.max(25, Math.min(92, takedownDefensePct * 0.82)) : null);
  const finishRate = pickUfcPayloadNumber(input.payload, "finishRate", "finish_rate");
  const staminaScore = pickUfcPayloadNumber(input.payload, "staminaScore", "cardioScore", "lateRoundPerformance") ?? (roundsFought != null ? Math.max(42, Math.min(84, 47 + Math.sqrt(roundsFought) * 3.2)) : null);
  const strikeDiff = slpm != null && sapm != null ? Number((slpm - sapm).toFixed(3)) : pickUfcPayloadNumber(input.payload, "strikingDifferential", "striking_differential");
  const hydratedFrom = pickUfcPayloadString(input.payload, "source", "provider", "ufcStatsUrl") ?? "fighter-payload";

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
    roundsFought,
    sigStrikesLandedPerMin: slpm,
    sigStrikesAbsorbedPerMin: sapm,
    strikingDifferential: strikeDiff,
    takedownsPer15,
    takedownDefensePct,
    submissionAttemptsPer15,
    controlTimePct,
    opponentAdjustedStrength: pickUfcPayloadNumber(input.payload, "opponentAdjustedStrength", "opponent_adjusted_strength") ?? 50,
    coldStartActive: (ufcFights ?? proFights ?? 0) < 3,
    feature: {
      source: "upcoming-feature-hydration",
      hydrationQuality: "internet-profile-derived",
      hydratedFrom,
      rawSource: input.payload.sourceKey ?? input.payload.source ?? null,
      age: pickUfcPayloadNumber(input.payload, "age"),
      heightInches: pickUfcPayloadNumber(input.payload, "heightInches", "height_inches"),
      reachInches: pickUfcPayloadNumber(input.payload, "reachInches", "reach_inches"),
      stance: pickUfcPayloadString(input.payload, "stance"),
      sigStrikeAccuracyPct,
      sigStrikeDefensePct,
      takedownAccuracyPct,
      takedownDefensePct,
      submissionDefensePct: normalizePct(pickUfcPayloadNumber(input.payload, "submissionDefensePct", "submission_defense_pct", "subDefense")) ?? Math.max(45, Math.min(88, 58 + (takedownDefensePct ?? 62) * 0.18 - (submissionAttemptsPer15 ?? 0) * 1.5)),
      controlEscapePct,
      finishRate,
      lateRoundPerformance: staminaScore,
      staminaScore,
      paceScore: slpm != null ? Math.max(35, Math.min(88, 42 + slpm * 6 + (takedownsPer15 ?? 0) * 2)) : null,
      chinScore: sigStrikeDefensePct != null && sapm != null ? Math.max(30, Math.min(88, 48 + sigStrikeDefensePct * 0.34 - sapm * 2.4)) : null,
      fightIqScore: roundsFought != null && sigStrikeDefensePct != null && takedownDefensePct != null ? Math.max(40, Math.min(88, 42 + Math.sqrt(roundsFought) * 2 + sigStrikeDefensePct * 0.16 + takedownDefensePct * 0.12)) : null,
      derivedEstimates: {
        roundsFought: pickUfcPayloadNumber(input.payload, "roundsFought", "rounds_fought") == null && roundsFought != null,
        controlTimePct: pickUfcPayloadNumber(input.payload, "controlTimePct", "control_time_pct") == null && controlTimePct != null,
        controlEscapePct: pickUfcPayloadNumber(input.payload, "controlEscapePct", "control_escape_pct", "escapePct") == null && controlEscapePct != null,
        staminaScore: pickUfcPayloadNumber(input.payload, "staminaScore", "cardioScore", "lateRoundPerformance") == null && staminaScore != null
      }
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
    VALUES (${feature.id}, ${feature.fightId}, ${feature.fightDate}::timestamptz, ${feature.fighterId}, ${feature.opponentFighterId}, ${feature.snapshotAt}::timestamptz, ${feature.modelVersion}, ${feature.proFights}, ${feature.ufcFights}, ${feature.roundsFought}, ${feature.sigStrikesLandedPerMin}, ${feature.sigStrikesAbsorbedPerMin}, ${feature.strikingDifferential}, ${feature.takedownsPer15}, ${feature.takedownDefensePct}, ${feature.submissionAttemptsPer15}, ${feature.controlTimePct}, ${feature.opponentAdjustedStrength}, ${feature.coldStartActive}, ${JSON.stringify(feature.feature)}::jsonb, now())
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
