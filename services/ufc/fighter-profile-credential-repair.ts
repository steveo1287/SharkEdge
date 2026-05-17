import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { calculateUfcCredentialPriorApplications, UFC_PROFILE_PRIOR_KEYS, type UfcProfilePriorKey } from "@/services/ufc/fighter-credential-priors";
import type { UfcModelFeatureSnapshot } from "@/services/ufc/fighter-skill-profile";

type RepairRow = {
  fight_id: string;
  event_label: string;
  fight_date: Date | string;
  fighter_id: string;
  fighter_name: string;
  opponent_id: string;
  opponent_name: string;
  fighter_payload_json: unknown;
  feature_json: Record<string, unknown> | null;
  pro_fights: number | null;
  ufc_fights: number | null;
  rounds_fought: number | null;
  sig_strikes_landed_per_min: number | null;
  sig_strikes_absorbed_per_min: number | null;
  striking_differential: number | null;
  takedowns_per_15: number | null;
  takedown_accuracy_pct: number | null;
  takedown_defense_pct: number | null;
  submission_attempts_per_15: number | null;
  control_time_pct: number | null;
  opponent_adjusted_strength: number | null;
  cold_start_active: boolean | null;
  snapshot_at: Date | string | null;
  feature_updated_at: Date | string | null;
};

export type UfcCredentialProfileRepairResult = {
  ok: boolean;
  dryRun: boolean;
  modelVersion: string;
  horizonDays: number;
  scanned: number;
  repaired: number;
  skipped: number;
  repairedRows: Array<{ fightId: string; fighterId: string; fighterName: string; eventLabel: string; applications: string[]; changedKeys: string[] }>;
  skippedRows: Array<{ fightId: string; fighterId: string; fighterName: string; reason: string }>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function iso(value: Date | string | null | undefined) {
  if (!value) return new Date().toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function featureValue(row: RepairRow, key: string) {
  const feature = asRecord(row.feature_json);
  const rawFeature = asRecord(feature.rawFeature);
  const dbKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  const direct = numeric((row as unknown as Record<string, unknown>)[dbKey]) ?? numeric((row as unknown as Record<string, unknown>)[key]);
  if (direct != null) return direct;
  const json = numeric(feature[key]);
  if (json != null) return json;
  return numeric(rawFeature[key]);
}

function buildSnapshot(row: RepairRow, modelVersion: string): UfcModelFeatureSnapshot {
  const feature = asRecord(row.feature_json);
  return {
    fightId: row.fight_id,
    fightDate: iso(row.fight_date),
    fighterId: row.fighter_id,
    opponentFighterId: row.opponent_id,
    snapshotAt: iso(row.snapshot_at ?? row.feature_updated_at),
    modelVersion,
    age: featureValue(row, "age"),
    reachInches: featureValue(row, "reachInches"),
    heightInches: featureValue(row, "heightInches"),
    stance: typeof feature.stance === "string" ? feature.stance : null,
    weightClass: typeof feature.weightClass === "string" ? feature.weightClass : typeof feature.weight_class === "string" ? feature.weight_class : null,
    daysSinceLastFight: featureValue(row, "daysSinceLastFight"),
    proFights: row.pro_fights,
    ufcFights: row.ufc_fights,
    roundsFought: row.rounds_fought,
    sigStrikesLandedPerMin: row.sig_strikes_landed_per_min,
    sigStrikesAbsorbedPerMin: row.sig_strikes_absorbed_per_min,
    strikingDifferential: row.striking_differential,
    sigStrikeAccuracyPct: featureValue(row, "sigStrikeAccuracyPct"),
    sigStrikeDefensePct: featureValue(row, "sigStrikeDefensePct"),
    knockdownsPer15: featureValue(row, "knockdownsPer15"),
    takedownsPer15: row.takedowns_per_15,
    takedownAccuracyPct: row.takedown_accuracy_pct,
    takedownDefensePct: row.takedown_defense_pct,
    submissionAttemptsPer15: row.submission_attempts_per_15,
    controlTimePct: row.control_time_pct,
    recentFormScore: featureValue(row, "recentFormScore"),
    finishRate: featureValue(row, "finishRate"),
    lateRoundPerformance: featureValue(row, "lateRoundPerformance"),
    opponentAdjustedStrength: row.opponent_adjusted_strength,
    coldStartActive: Boolean(row.cold_start_active),
    feature: { ...feature, fighterName: row.fighter_name }
  };
}

function mergedFeatureJson(row: RepairRow, applications: ReturnType<typeof calculateUfcCredentialPriorApplications>) {
  const feature = { ...asRecord(row.feature_json) };
  const appliedPriors = applications.map((application) => ({ id: application.id, confidence: application.confidence, sourceUrl: application.sourceUrl, appliedWeight: application.appliedWeight, changedKeys: application.changedKeys, evidence: application.evidence, metadata: application.metadata }));
  for (const application of applications) {
    for (const key of UFC_PROFILE_PRIOR_KEYS) {
      const value = application.values[key];
      if (value != null) feature[key] = value;
    }
    if (application.metadata.combatBase) feature.combatBase = application.metadata.combatBase;
    if (application.metadata.projectedWeightClass && !feature.weightClass) feature.weightClass = application.metadata.projectedWeightClass;
  }
  return {
    ...feature,
    source: feature.source ?? "credential-profile-repair",
    credentialProfileRepair: {
      source: "fighter-credential-priors",
      repairedAt: new Date().toISOString(),
      appliedPriors,
      changedKeys: applications.flatMap((application) => application.changedKeys),
      evidence: [...new Set(applications.flatMap((application) => application.evidence))].slice(0, 12)
    },
    eliteCombatCredentialPrior: {
      source: "fighter-credential-priors",
      confidence: applications[0]?.confidence ?? null,
      sourceUrl: applications[0]?.sourceUrl ?? null,
      appliedPriors,
      evidence: [...new Set(applications.flatMap((application) => application.evidence))].slice(0, 12)
    }
  };
}

function dbColumnForKey(key: UfcProfilePriorKey) {
  const map: Partial<Record<UfcProfilePriorKey, string>> = {
    sigStrikesLandedPerMin: "sig_strikes_landed_per_min",
    sigStrikesAbsorbedPerMin: "sig_strikes_absorbed_per_min",
    strikingDifferential: "striking_differential",
    takedownsPer15: "takedowns_per_15",
    takedownAccuracyPct: "takedown_accuracy_pct",
    takedownDefensePct: "takedown_defense_pct",
    submissionAttemptsPer15: "submission_attempts_per_15",
    controlTimePct: "control_time_pct",
    opponentAdjustedStrength: "opponent_adjusted_strength"
  };
  return map[key] ?? null;
}

function dbUpdates(applications: ReturnType<typeof calculateUfcCredentialPriorApplications>) {
  const updates: Record<string, number> = {};
  for (const application of applications) {
    for (const key of UFC_PROFILE_PRIOR_KEYS) {
      const column = dbColumnForKey(key);
      const value = application.values[key];
      if (column && value != null) updates[column] = value;
    }
  }
  return updates;
}

async function queryRepairRows(modelVersion: string, horizonDays: number, limit: number) {
  return prisma.$queryRaw<RepairRow[]>`
    WITH fight_scope AS (
      SELECT f.id, f.event_label, f.fight_date, f.fighter_a_id, f.fighter_b_id
      FROM ufc_fights f
      WHERE f.fight_date >= now() - interval '12 hours'
        AND f.fight_date <= now() + (${horizonDays}::text || ' days')::interval
        AND f.status NOT IN ('CANCELED', 'VOID')
        AND COALESCE(f.payload_json->>'matchupQuality', '') <> 'FAKE_NAVIGATION'
      ORDER BY f.fight_date ASC, f.bout_order NULLS LAST, f.event_label ASC
      LIMIT ${Math.max(1, Math.min(500, limit))}
    ), sides AS (
      SELECT fs.id AS fight_id, fs.event_label, fs.fight_date, fs.fighter_a_id AS fighter_id, fs.fighter_b_id AS opponent_id FROM fight_scope fs
      UNION ALL
      SELECT fs.id AS fight_id, fs.event_label, fs.fight_date, fs.fighter_b_id AS fighter_id, fs.fighter_a_id AS opponent_id FROM fight_scope fs
    )
    SELECT s.fight_id, s.event_label, s.fight_date, s.fighter_id, ftr.full_name AS fighter_name,
      s.opponent_id, opp.full_name AS opponent_name, ftr.payload_json AS fighter_payload_json,
      mf.feature_json, mf.pro_fights, mf.ufc_fights, mf.rounds_fought,
      mf.sig_strikes_landed_per_min, mf.sig_strikes_absorbed_per_min, mf.striking_differential,
      mf.takedowns_per_15, mf.takedown_accuracy_pct, mf.takedown_defense_pct,
      mf.submission_attempts_per_15, mf.control_time_pct, mf.opponent_adjusted_strength,
      mf.cold_start_active, mf.snapshot_at, mf.updated_at AS feature_updated_at
    FROM sides s
    JOIN ufc_fighters ftr ON ftr.id = s.fighter_id
    JOIN ufc_fighters opp ON opp.id = s.opponent_id
    JOIN LATERAL (
      SELECT * FROM ufc_model_features mf
      WHERE mf.fight_id = s.fight_id AND mf.fighter_id = s.fighter_id AND mf.model_version = ${modelVersion} AND mf.snapshot_at <= mf.fight_date
      ORDER BY mf.updated_at DESC, mf.snapshot_at DESC
      LIMIT 1
    ) mf ON true
    ORDER BY s.fight_date ASC, s.event_label ASC, s.fighter_id ASC
    LIMIT ${Math.max(1, Math.min(1000, limit * 2))}
  `;
}

async function updateFeatureRow(row: RepairRow, modelVersion: string, featureJson: Record<string, unknown>, updates: Record<string, number>) {
  await prisma.$executeRaw`
    UPDATE ufc_model_features
    SET feature_json = ${JSON.stringify(featureJson)}::jsonb,
        sig_strikes_landed_per_min = COALESCE(${updates.sig_strikes_landed_per_min ?? null}, sig_strikes_landed_per_min),
        sig_strikes_absorbed_per_min = COALESCE(${updates.sig_strikes_absorbed_per_min ?? null}, sig_strikes_absorbed_per_min),
        striking_differential = COALESCE(${updates.striking_differential ?? null}, striking_differential),
        takedowns_per_15 = COALESCE(${updates.takedowns_per_15 ?? null}, takedowns_per_15),
        takedown_accuracy_pct = COALESCE(${updates.takedown_accuracy_pct ?? null}, takedown_accuracy_pct),
        takedown_defense_pct = COALESCE(${updates.takedown_defense_pct ?? null}, takedown_defense_pct),
        submission_attempts_per_15 = COALESCE(${updates.submission_attempts_per_15 ?? null}, submission_attempts_per_15),
        control_time_pct = COALESCE(${updates.control_time_pct ?? null}, control_time_pct),
        opponent_adjusted_strength = COALESCE(${updates.opponent_adjusted_strength ?? null}, opponent_adjusted_strength),
        cold_start_active = false,
        updated_at = now()
    WHERE fight_id = ${row.fight_id}
      AND fighter_id = ${row.fighter_id}
      AND model_version = ${modelVersion}
  `;
}

export async function repairUfcCredentialProfiles(options: { modelVersion?: string; horizonDays?: number; limit?: number; dryRun?: boolean } = {}): Promise<UfcCredentialProfileRepairResult> {
  const modelVersion = options.modelVersion ?? "ufc-fight-iq-v1";
  const horizonDays = Math.max(1, Math.min(365, Math.round(options.horizonDays ?? 180)));
  const limit = Math.max(1, Math.min(500, Math.round(options.limit ?? 200)));
  const dryRun = options.dryRun !== false;
  if (!hasUsableServerDatabaseUrl()) return { ok: false, dryRun, modelVersion, horizonDays, scanned: 0, repaired: 0, skipped: 0, repairedRows: [], skippedRows: [{ fightId: "", fighterId: "", fighterName: "", reason: "No usable server database URL." }] };
  const rows = await queryRepairRows(modelVersion, horizonDays, limit);
  const repairedRows: UfcCredentialProfileRepairResult["repairedRows"] = [];
  const skippedRows: UfcCredentialProfileRepairResult["skippedRows"] = [];

  for (const row of rows) {
    const snapshot = buildSnapshot(row, modelVersion);
    const applications = calculateUfcCredentialPriorApplications({ feature: snapshot, payloadRecord: asRecord(row.fighter_payload_json) });
    if (!applications.length) {
      skippedRows.push({ fightId: row.fight_id, fighterId: row.fighter_id, fighterName: row.fighter_name, reason: "No credential prior matched or no fields would change." });
      continue;
    }
    const featureJson = mergedFeatureJson(row, applications);
    const updates = dbUpdates(applications);
    if (!dryRun) await updateFeatureRow(row, modelVersion, featureJson, updates);
    repairedRows.push({ fightId: row.fight_id, fighterId: row.fighter_id, fighterName: row.fighter_name, eventLabel: row.event_label, applications: applications.map((application) => application.id), changedKeys: applications.flatMap((application) => application.changedKeys) });
  }

  return { ok: true, dryRun, modelVersion, horizonDays, scanned: rows.length, repaired: repairedRows.length, skipped: skippedRows.length, repairedRows, skippedRows: skippedRows.slice(0, 100) };
}
