import { prisma } from "@/lib/db/prisma";

type FeatureBlendRow = {
  id: string;
  fighter_id: string;
  model_version: string;
  ufc_fights: number | null;
  sig_strikes_landed_per_min: number | null;
  sig_strikes_absorbed_per_min: number | null;
  striking_differential: number | null;
  takedowns_per_15: number | null;
  takedown_defense_pct: number | null;
  submission_attempts_per_15: number | null;
  control_time_pct: number | null;
  opponent_adjusted_strength: number | null;
  feature_json: unknown;
  payload_json: unknown;
};

type Options = {
  modelVersion?: string;
  horizonDays?: number;
  limit?: number;
  includePast?: boolean;
};

const DEFAULT_MODEL_VERSION = "ufc-fight-iq-v1";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function priorMap(payload: unknown) {
  return asRecord(asRecord(asRecord(payload).backgroundPriors).wikimedia);
}

function priors(payload: unknown) {
  return asRecord(priorMap(payload).priors);
}

function confidenceMultiplier(payload: unknown) {
  const confidence = priorMap(payload).confidence;
  if (confidence === "A") return 1;
  if (confidence === "B") return 0.75;
  if (confidence === "C") return 0.5;
  return 0;
}

function historyWeight(ufcFights: number | null) {
  const fights = typeof ufcFights === "number" && Number.isFinite(ufcFights) ? ufcFights : 0;
  if (fights <= 0) return 0.45;
  if (fights < 3) return 0.32;
  if (fights < 7) return 0.18;
  return 0.06;
}

function maxMoveFor(key: string) {
  if (key.includes("Pct") || key.includes("Score") || key.includes("Strength")) return 8;
  if (key.includes("Per15")) return 0.55;
  if (key.includes("PerMin")) return 0.65;
  if (key === "strikingDifferential") return 0.45;
  return 5;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function blendValue(current: number | null, prior: unknown, key: string, weight: number) {
  const priorValue = num(prior);
  if (priorValue == null) return current;
  if (current == null || !Number.isFinite(current)) return priorValue;
  const maxMove = maxMoveFor(key);
  const delta = clamp((priorValue - current) * weight, -maxMove, maxMove);
  return Number((current + delta).toFixed(4));
}

function withBlend(existing: Record<string, unknown>, key: string, current: number | null, priorValues: Record<string, unknown>, weight: number) {
  const blended = blendValue(current, priorValues[key], key, weight);
  if (blended == null) return { value: current, changed: false };
  const currentValue = current == null ? null : Number(current.toFixed(4));
  const changed = currentValue == null || Math.abs(blended - currentValue) > 0.0001;
  if (changed) existing[key] = blended;
  return { value: blended, changed };
}

async function loadFeatureRows(modelVersion: string, horizonDays: number, limit: number, includePast: boolean) {
  return prisma.$queryRaw<FeatureBlendRow[]>`
    SELECT mf.id, mf.fighter_id, mf.model_version, mf.ufc_fights,
      mf.sig_strikes_landed_per_min, mf.sig_strikes_absorbed_per_min, mf.striking_differential,
      mf.takedowns_per_15, mf.takedown_defense_pct, mf.submission_attempts_per_15,
      mf.control_time_pct, mf.opponent_adjusted_strength, mf.feature_json, f.payload_json
    FROM ufc_model_features mf
    JOIN ufc_fighters f ON f.id = mf.fighter_id
    WHERE mf.model_version = ${modelVersion}
      AND (${includePast}::boolean OR mf.fight_date >= now() - interval '12 hours')
      AND mf.fight_date <= now() + (${horizonDays}::text || ' days')::interval
      AND f.payload_json ? 'backgroundPriors'
    ORDER BY mf.fight_date ASC, mf.updated_at DESC
    LIMIT ${limit}
  `;
}

async function updateFeature(row: FeatureBlendRow, blended: Record<string, unknown>, columnValues: Record<string, number | null>) {
  const nextFeatureJson = {
    ...asRecord(row.feature_json),
    ...blended,
    wikimediaPriorBlend: {
      appliedAt: new Date().toISOString(),
      source: "wikimedia-background-priors",
      capped: true,
      values: blended
    }
  };
  await prisma.$executeRaw`
    UPDATE ufc_model_features
    SET sig_strikes_landed_per_min = ${columnValues.sigStrikesLandedPerMin ?? row.sig_strikes_landed_per_min},
        sig_strikes_absorbed_per_min = ${columnValues.sigStrikesAbsorbedPerMin ?? row.sig_strikes_absorbed_per_min},
        striking_differential = ${columnValues.strikingDifferential ?? row.striking_differential},
        takedowns_per_15 = ${columnValues.takedownsPer15 ?? row.takedowns_per_15},
        takedown_defense_pct = ${columnValues.takedownDefensePct ?? row.takedown_defense_pct},
        submission_attempts_per_15 = ${columnValues.submissionAttemptsPer15 ?? row.submission_attempts_per_15},
        control_time_pct = ${columnValues.controlTimePct ?? row.control_time_pct},
        opponent_adjusted_strength = ${columnValues.opponentAdjustedStrength ?? row.opponent_adjusted_strength},
        feature_json = ${JSON.stringify(nextFeatureJson)}::jsonb,
        updated_at = now()
    WHERE id = ${row.id}
  `;
}

export async function applyWikimediaPriorsToUfcModelFeatures(options: Options = {}) {
  const modelVersion = options.modelVersion ?? DEFAULT_MODEL_VERSION;
  const horizonDays = Math.max(1, Math.min(365, Math.floor(options.horizonDays ?? 180)));
  const limit = Math.max(1, Math.min(5000, Math.floor(options.limit ?? 1000)));
  const rows = await loadFeatureRows(modelVersion, horizonDays, limit, Boolean(options.includePast));
  let updated = 0;
  let skipped = 0;
  const samples: Array<{ fighterId: string; changedKeys: string[] }> = [];

  for (const row of rows) {
    const multiplier = confidenceMultiplier(row.payload_json);
    if (multiplier <= 0) {
      skipped += 1;
      continue;
    }
    const p = priors(row.payload_json);
    const weight = historyWeight(row.ufc_fights) * multiplier;
    const blended: Record<string, unknown> = {};
    const columns: Record<string, number | null> = {};
    const changedKeys: string[] = [];

    for (const [key, current] of [
      ["sigStrikesLandedPerMin", row.sig_strikes_landed_per_min],
      ["sigStrikesAbsorbedPerMin", row.sig_strikes_absorbed_per_min],
      ["strikingDifferential", row.striking_differential],
      ["takedownsPer15", row.takedowns_per_15],
      ["takedownDefensePct", row.takedown_defense_pct],
      ["submissionAttemptsPer15", row.submission_attempts_per_15],
      ["controlTimePct", row.control_time_pct],
      ["opponentAdjustedStrength", row.opponent_adjusted_strength]
    ] as Array<[string, number | null]>) {
      const result = withBlend(blended, key, current, p, weight);
      columns[key] = result.value;
      if (result.changed) changedKeys.push(key);
    }

    for (const key of [
      "sigStrikeAccuracyPct", "sigStrikeDefensePct", "knockdownsPer15", "takedownAccuracyPct", "submissionDefensePct",
      "controlEscapePct", "getUpRate", "reversalsPer15", "sweepRate", "legKicksLandedPer15", "bodyKicksLandedPer15",
      "headKicksLandedPer15", "kickingAccuracyPct", "kickingDefensePct", "clinchStrikingScore", "pressureScore",
      "distanceManagementScore", "fightIqScore", "gamePlanScore", "heartScore", "staminaScore", "promotionTierSignal"
    ]) {
      const current = num(asRecord(row.feature_json)[key]);
      const result = withBlend(blended, key, current, p, weight);
      if (result.changed) changedKeys.push(key);
    }

    if (!changedKeys.length) {
      skipped += 1;
      continue;
    }
    await updateFeature(row, blended, columns);
    updated += 1;
    if (samples.length < 12) samples.push({ fighterId: row.fighter_id, changedKeys });
  }

  return { ok: true, modelVersion, checked: rows.length, updated, skipped, samples };
}
