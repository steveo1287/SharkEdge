import crypto from "node:crypto";

import { prisma } from "@/lib/db/prisma";

export type UfcReusableModelFeaturePayload = {
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

type PriorFeatureRow = {
  fight_id: string;
  fight_date: Date | string;
  fighter_id: string;
  opponent_fighter_id: string;
  snapshot_at: Date | string;
  model_version: string;
  pro_fights: number | null;
  ufc_fights: number | null;
  rounds_fought: number | null;
  sig_strikes_landed_per_min: number | null;
  sig_strikes_absorbed_per_min: number | null;
  striking_differential: number | null;
  takedowns_per_15: number | null;
  takedown_defense_pct: number | null;
  submission_attempts_per_15: number | null;
  control_time_pct: number | null;
  opponent_adjusted_strength: number | null;
  cold_start_active: boolean | null;
  feature_json: unknown;
};

type FighterPayloadRow = {
  id: string;
  full_name: string;
  stance: string | null;
  height_inches: number | null;
  reach_inches: number | null;
  combat_base: string | null;
  payload_json: unknown;
};

function stableId(prefix: string, value: string) {
  return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function snapshotBeforeFight(fightDate: string) {
  const fightMs = new Date(fightDate).getTime();
  if (!Number.isFinite(fightMs)) return new Date().toISOString();
  return new Date(Math.min(Date.now(), fightMs - 60_000)).toISOString();
}

function numeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/%$/, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function nestedRecords(payload: Record<string, unknown>) {
  const elite = asRecord(payload.eliteProfile);
  const careerStats = asRecord(elite.careerStats);
  const spider = asRecord(elite.spiderSkills);
  const wikimediaPriors = asRecord(asRecord(asRecord(payload.backgroundPriors).wikimedia).priors);
  const outcomeLearning = asRecord(asRecord(payload.outcomeLearning).skillDeltas);
  return [
    payload,
    asRecord(payload.rawFeature),
    asRecord(payload.rawPayload),
    asRecord(payload.stats),
    careerStats,
    spider,
    asRecord(payload.careerStats),
    wikimediaPriors,
    outcomeLearning
  ];
}

function payloadNumber(payload: Record<string, unknown>, ...keys: string[]) {
  for (const record of nestedRecords(payload)) {
    for (const key of keys) {
      const value = numeric(record[key]);
      if (value != null) return value;
    }
  }
  return null;
}

function payloadText(payload: Record<string, unknown>, ...keys: string[]) {
  for (const record of nestedRecords(payload)) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return null;
}

function hasEnoughProfileSignal(payload: Record<string, unknown>) {
  const signalCount = [
    payloadNumber(payload, "slpm", "sigStrikesLandedPerMin", "sig_strikes_landed_per_min"),
    payloadNumber(payload, "sapm", "sigStrikesAbsorbedPerMin", "sig_strikes_absorbed_per_min"),
    payloadNumber(payload, "takedownsPer15", "takedowns_per_15", "tdAvg"),
    payloadNumber(payload, "takedownDefensePct", "takedown_defense_pct", "tdDefense"),
    payloadNumber(payload, "submissionAttemptsPer15", "submission_attempts_per_15", "submissionAverage"),
    payloadNumber(payload, "opponentAdjustedStrength", "opponent_strength", "opponent_adjusted_strength"),
    payloadNumber(payload, "fightIqScore", "heartScore", "staminaScore")
  ].filter((value) => value != null).length;
  const hasExternalPrior = Boolean(asRecord(asRecord(asRecord(payload.backgroundPriors).wikimedia).priors) && Object.keys(asRecord(asRecord(asRecord(payload.backgroundPriors).wikimedia).priors)).length);
  const hasOutcomeLearning = Boolean(Object.keys(asRecord(asRecord(payload.outcomeLearning).skillDeltas)).length);
  return signalCount >= 2 || (signalCount >= 1 && (hasExternalPrior || hasOutcomeLearning));
}

function round(value: number | null, digits = 3) {
  return value == null || !Number.isFinite(value) ? null : Number(value.toFixed(digits));
}

async function latestPriorFeature(input: { fightId: string; fighterId: string; fightDate: string; modelVersion: string }) {
  const rows = await prisma.$queryRaw<PriorFeatureRow[]>`
    SELECT fight_id, fight_date, fighter_id, opponent_fighter_id, snapshot_at, model_version,
      pro_fights, ufc_fights, rounds_fought, sig_strikes_landed_per_min, sig_strikes_absorbed_per_min,
      striking_differential, takedowns_per_15, takedown_defense_pct, submission_attempts_per_15,
      control_time_pct, opponent_adjusted_strength, cold_start_active, feature_json
    FROM ufc_model_features
    WHERE fighter_id = ${input.fighterId}
      AND model_version = ${input.modelVersion}
      AND fight_id <> ${input.fightId}
      AND snapshot_at <= ${input.fightDate}
    ORDER BY snapshot_at DESC, updated_at DESC
    LIMIT 1;
  `;
  return rows[0] ?? null;
}

async function fighterPayload(input: { fighterId: string }) {
  const rows = await prisma.$queryRaw<FighterPayloadRow[]>`
    SELECT id, full_name, stance, height_inches, reach_inches, combat_base, payload_json
    FROM ufc_fighters
    WHERE id = ${input.fighterId}
    LIMIT 1;
  `;
  return rows[0] ?? null;
}

function featureFromPrior(input: {
  fightId: string;
  fightDate: string;
  fighterId: string;
  opponentFighterId: string;
  modelVersion: string;
  prior: PriorFeatureRow;
}): UfcReusableModelFeaturePayload {
  const feature = asRecord(input.prior.feature_json);
  return {
    id: stableId("ufcmf", `${input.fightId}:${input.fighterId}:${input.modelVersion}:reused-profile`),
    fightId: input.fightId,
    fightDate: input.fightDate,
    fighterId: input.fighterId,
    opponentFighterId: input.opponentFighterId,
    snapshotAt: snapshotBeforeFight(input.fightDate),
    modelVersion: input.modelVersion,
    proFights: input.prior.pro_fights,
    ufcFights: input.prior.ufc_fights,
    roundsFought: input.prior.rounds_fought,
    sigStrikesLandedPerMin: input.prior.sig_strikes_landed_per_min,
    sigStrikesAbsorbedPerMin: input.prior.sig_strikes_absorbed_per_min,
    strikingDifferential: input.prior.striking_differential,
    takedownsPer15: input.prior.takedowns_per_15,
    takedownDefensePct: input.prior.takedown_defense_pct,
    submissionAttemptsPer15: input.prior.submission_attempts_per_15,
    controlTimePct: input.prior.control_time_pct,
    opponentAdjustedStrength: input.prior.opponent_adjusted_strength ?? 50,
    coldStartActive: Boolean(input.prior.cold_start_active),
    feature: {
      ...feature,
      source: "reused-fighter-profile",
      reusedFromFightId: input.prior.fight_id,
      reusedFromSnapshotAt: toIso(input.prior.snapshot_at),
      hydrationQuality: feature.hydrationQuality ?? "prior-model-feature"
    }
  };
}

function featureFromFighterPayload(input: {
  fightId: string;
  fightDate: string;
  fighterId: string;
  opponentFighterId: string;
  modelVersion: string;
  fighter: FighterPayloadRow;
}): UfcReusableModelFeaturePayload | null {
  const payload = asRecord(input.fighter.payload_json);
  if (!hasEnoughProfileSignal(payload)) return null;
  const slpm = payloadNumber(payload, "slpm", "sigStrikesLandedPerMin", "sig_strikes_landed_per_min") ?? 2.75;
  const sapm = payloadNumber(payload, "sapm", "sigStrikesAbsorbedPerMin", "sig_strikes_absorbed_per_min") ?? 2.75;
  const proFights = payloadNumber(payload, "proFights", "pro_fights") ?? payloadNumber(payload, "sample.proFights");
  const ufcFights = payloadNumber(payload, "ufcFights", "ufc_fights") ?? payloadNumber(payload, "sample.ufcFights");
  const sourceSignals = {
    hasEliteProfile: Boolean(payload.eliteProfile),
    hasWikimedia: Boolean(asRecord(payload.wikimedia).matched || Object.keys(asRecord(asRecord(asRecord(payload.backgroundPriors).wikimedia).priors)).length),
    hasOutcomeLearning: Boolean(Object.keys(asRecord(asRecord(payload.outcomeLearning).skillDeltas)).length),
    hasFightHistory: Boolean(payloadNumber(payload, "roundsFought", "rounds_fought") || payloadNumber(payload, "ufcFights", "ufc_fights")),
    hasRawStats: Boolean(payload.stats || payload.rawFeature || payload.rawPayload)
  };
  return {
    id: stableId("ufcmf", `${input.fightId}:${input.fighterId}:${input.modelVersion}:fighter-payload`),
    fightId: input.fightId,
    fightDate: input.fightDate,
    fighterId: input.fighterId,
    opponentFighterId: input.opponentFighterId,
    snapshotAt: snapshotBeforeFight(input.fightDate),
    modelVersion: input.modelVersion,
    proFights: proFights == null ? null : Math.max(0, Math.round(proFights)),
    ufcFights: ufcFights == null ? null : Math.max(0, Math.round(ufcFights)),
    roundsFought: payloadNumber(payload, "roundsFought", "rounds_fought"),
    sigStrikesLandedPerMin: slpm,
    sigStrikesAbsorbedPerMin: sapm,
    strikingDifferential: round(slpm - sapm),
    takedownsPer15: payloadNumber(payload, "takedownsPer15", "takedowns_per_15", "tdAvg") ?? 0.8,
    takedownDefensePct: payloadNumber(payload, "takedownDefensePct", "takedown_defense_pct", "tdDefense") ?? 50,
    submissionAttemptsPer15: payloadNumber(payload, "submissionAttemptsPer15", "submission_attempts_per_15", "submissionAverage") ?? 0.25,
    controlTimePct: payloadNumber(payload, "controlTimePct", "control_time_pct") ?? 0,
    opponentAdjustedStrength: payloadNumber(payload, "opponentAdjustedStrength", "opponent_strength", "opponent_adjusted_strength") ?? 50,
    coldStartActive: (ufcFights ?? 0) < 3 && !sourceSignals.hasOutcomeLearning,
    feature: {
      source: "fighter-payload-profile",
      hydrationQuality: sourceSignals.hasEliteProfile || sourceSignals.hasOutcomeLearning ? "elite-profile-derived" : sourceSignals.hasWikimedia ? "external-prior-derived" : "fighter-payload-derived",
      hydrationSources: sourceSignals,
      rawSource: payload.sourceKey ?? payload.source ?? null,
      age: payloadNumber(payload, "age"),
      heightInches: input.fighter.height_inches ?? payloadNumber(payload, "heightInches", "height_inches"),
      reachInches: input.fighter.reach_inches ?? payloadNumber(payload, "reachInches", "reach_inches"),
      stance: input.fighter.stance ?? payloadText(payload, "stance"),
      combatBase: input.fighter.combat_base ?? payloadText(payload, "combatBase", "combat_base"),
      sigStrikeAccuracyPct: payloadNumber(payload, "sigStrikeAccuracyPct", "strikeAccuracyPct", "sig_strike_accuracy_pct") ?? 45,
      sigStrikeDefensePct: payloadNumber(payload, "sigStrikeDefensePct", "strikeDefensePct", "sig_strike_defense_pct") ?? 50,
      takedownAccuracyPct: payloadNumber(payload, "takedownAccuracyPct", "takedown_accuracy_pct") ?? 30,
      submissionDefensePct: payloadNumber(payload, "submissionDefensePct", "subDefense"),
      fightIqScore: payloadNumber(payload, "fightIqScore", "fightIQ"),
      heartScore: payloadNumber(payload, "heartScore"),
      staminaScore: payloadNumber(payload, "staminaScore"),
      pressureScore: payloadNumber(payload, "pressureScore"),
      distanceManagementScore: payloadNumber(payload, "distanceManagementScore"),
      recentFormScore: payloadNumber(payload, "recentFormScore", "recent_form_score") ?? 50,
      finishRate: payloadNumber(payload, "finishRate", "finish_rate") ?? 0.4,
      lateRoundPerformance: payloadNumber(payload, "lateRoundPerformance", "late_round_performance") ?? 50,
      wikimedia: payload.wikimedia ?? null,
      outcomeLearning: payload.outcomeLearning ?? null,
      rawPayload: payload
    }
  };
}

export async function buildReusableUfcModelFeature(input: {
  fightId: string;
  fightDate: string;
  fighterId: string;
  opponentFighterId: string;
  modelVersion: string;
}) {
  const prior = await latestPriorFeature(input).catch(() => null);
  if (prior) return featureFromPrior({ ...input, prior });
  const fighter = await fighterPayload({ fighterId: input.fighterId }).catch(() => null);
  if (!fighter) return null;
  return featureFromFighterPayload({ ...input, fighter });
}

export async function insertUfcModelFeaturePayload(feature: UfcReusableModelFeaturePayload) {
  await prisma.$executeRaw`
    INSERT INTO ufc_model_features (id, fight_id, fight_date, fighter_id, opponent_fighter_id, snapshot_at, model_version, pro_fights, ufc_fights, rounds_fought, sig_strikes_landed_per_min, sig_strikes_absorbed_per_min, striking_differential, takedowns_per_15, takedown_defense_pct, submission_attempts_per_15, control_time_pct, opponent_adjusted_strength, cold_start_active, feature_json, updated_at)
    VALUES (${feature.id}, ${feature.fightId}, ${feature.fightDate}, ${feature.fighterId}, ${feature.opponentFighterId}, ${feature.snapshotAt}, ${feature.modelVersion}, ${feature.proFights}, ${feature.ufcFights}, ${feature.roundsFought}, ${feature.sigStrikesLandedPerMin}, ${feature.sigStrikesAbsorbedPerMin}, ${feature.strikingDifferential}, ${feature.takedownsPer15}, ${feature.takedownDefensePct}, ${feature.submissionAttemptsPer15}, ${feature.controlTimePct}, ${feature.opponentAdjustedStrength}, ${feature.coldStartActive}, ${JSON.stringify(feature.feature)}::jsonb, now())
    ON CONFLICT (fight_id, fighter_id, model_version) DO NOTHING
  `;
}