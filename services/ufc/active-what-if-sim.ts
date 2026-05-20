import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { canUseActiveUfcWhatIfProfile, evaluateActiveUfcRosterStatus, type ActiveUfcRosterStatus } from "@/services/ufc/active-roster";
import { runUfcEnsembleSimFromFeatures, type UfcEnsembleSimResult } from "@/services/ufc/ensemble-sim";
import { applyIndividualUfcProfileToFeature, type UfcIndividualFighterProfile } from "@/services/ufc/individual-fighter-profile";
import type { UfcModelFeatureSnapshot } from "@/services/ufc/fighter-skill-profile";

export type ActiveUfcWhatIfFighterSummary = {
  fighterId: string;
  fullName: string;
  status: string | null;
  whatIfReady: boolean;
  completenessScore: number;
  activeRoster: ActiveUfcRosterStatus;
  blockers: string[];
  individualProfile: UfcIndividualFighterProfile;
};

export type ActiveUfcWhatIfSimResult = {
  ok: boolean;
  generatedAt: string;
  modelVersion: string;
  scheduledRounds: 3 | 5;
  simulations: number;
  fighterA: ActiveUfcWhatIfFighterSummary | null;
  fighterB: ActiveUfcWhatIfFighterSummary | null;
  sim: UfcEnsembleSimResult | null;
  warnings: string[];
  errors: string[];
};

type FeatureRow = {
  fighter_id: string;
  full_name: string;
  nickname: string | null;
  payload_json: unknown;
  latest_fight_id: string | null;
  latest_fight_date: Date | string | null;
  feature_json: Record<string, unknown> | null;
  model_version: string | null;
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
  feature_updated_at: Date | string | null;
  has_upcoming_ufc_fight: boolean | null;
  has_recent_ufc_fight: boolean | null;
  recent_ufc_fight_date: Date | string | null;
  ufc_activity_count: number | null;
};

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

function iso(value: Date | string | null | undefined) {
  if (!value) return new Date().toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function featureValue(row: FeatureRow, key: string) {
  const feature = asRecord(row.feature_json);
  const payload = asRecord(row.payload_json);
  const canonical = asRecord(payload.canonicalProfile);
  const careerStats = asRecord(canonical.careerStats);
  const stats = asRecord(payload.stats);
  const rawFeature = asRecord(feature.rawFeature);
  const dbKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  return numeric((row as unknown as Record<string, unknown>)[dbKey]) ?? numeric(feature[key]) ?? numeric(rawFeature[key]) ?? numeric(careerStats[key]) ?? numeric(stats[key]);
}

function snapshotFromRow(row: FeatureRow, opponentId: string, modelVersion: string): UfcModelFeatureSnapshot {
  const payload = asRecord(row.payload_json);
  const feature = asRecord(row.feature_json);
  return {
    fightId: `active-what-if-${slug(row.full_name)}`,
    fightDate: new Date().toISOString(),
    fighterId: row.fighter_id,
    opponentFighterId: opponentId,
    snapshotAt: iso(row.feature_updated_at),
    modelVersion,
    age: featureValue(row, "age"),
    reachInches: featureValue(row, "reachInches"),
    heightInches: featureValue(row, "heightInches"),
    stance: typeof feature.stance === "string" ? feature.stance : typeof payload.stance === "string" ? payload.stance : null,
    weightClass: typeof feature.weightClass === "string" ? feature.weightClass : typeof payload.weightClass === "string" ? payload.weightClass : null,
    daysSinceLastFight: featureValue(row, "daysSinceLastFight"),
    proFights: row.pro_fights ?? featureValue(row, "proFights"),
    ufcFights: row.ufc_fights ?? featureValue(row, "ufcFights"),
    roundsFought: row.rounds_fought ?? featureValue(row, "roundsFought"),
    sigStrikesLandedPerMin: row.sig_strikes_landed_per_min ?? featureValue(row, "sigStrikesLandedPerMin"),
    sigStrikesAbsorbedPerMin: row.sig_strikes_absorbed_per_min ?? featureValue(row, "sigStrikesAbsorbedPerMin"),
    strikingDifferential: row.striking_differential ?? featureValue(row, "strikingDifferential"),
    sigStrikeAccuracyPct: featureValue(row, "sigStrikeAccuracyPct"),
    sigStrikeDefensePct: featureValue(row, "sigStrikeDefensePct"),
    knockdownsPer15: featureValue(row, "knockdownsPer15"),
    takedownsPer15: row.takedowns_per_15 ?? featureValue(row, "takedownsPer15"),
    takedownAccuracyPct: row.takedown_accuracy_pct ?? featureValue(row, "takedownAccuracyPct"),
    takedownDefensePct: row.takedown_defense_pct ?? featureValue(row, "takedownDefensePct"),
    submissionAttemptsPer15: row.submission_attempts_per_15 ?? featureValue(row, "submissionAttemptsPer15"),
    submissionDefensePct: featureValue(row, "submissionDefensePct"),
    controlTimePct: row.control_time_pct ?? featureValue(row, "controlTimePct"),
    controlEscapePct: featureValue(row, "controlEscapePct"),
    getUpRate: featureValue(row, "getUpRate"),
    reversalsPer15: featureValue(row, "reversalsPer15"),
    sweepRate: featureValue(row, "sweepRate"),
    legKicksLandedPer15: featureValue(row, "legKicksLandedPer15"),
    bodyKicksLandedPer15: featureValue(row, "bodyKicksLandedPer15"),
    headKicksLandedPer15: featureValue(row, "headKicksLandedPer15"),
    kickingAccuracyPct: featureValue(row, "kickingAccuracyPct"),
    kickingDefensePct: featureValue(row, "kickingDefensePct"),
    clinchStrikingScore: featureValue(row, "clinchStrikingScore"),
    pressureScore: featureValue(row, "pressureScore"),
    distanceManagementScore: featureValue(row, "distanceManagementScore"),
    recentFormScore: featureValue(row, "recentFormScore"),
    finishRate: featureValue(row, "finishRate"),
    lateRoundPerformance: featureValue(row, "lateRoundPerformance"),
    heartScore: featureValue(row, "heartScore"),
    staminaScore: featureValue(row, "staminaScore"),
    paceScore: featureValue(row, "paceScore"),
    chinScore: featureValue(row, "chinScore"),
    recoveryScore: featureValue(row, "recoveryScore"),
    fightIqScore: featureValue(row, "fightIqScore"),
    gamePlanScore: featureValue(row, "gamePlanScore"),
    opponentAdjustedStrength: row.opponent_adjusted_strength ?? featureValue(row, "opponentAdjustedStrength"),
    coldStartActive: Boolean(row.cold_start_active),
    feature: { ...payload, ...feature, fighterName: row.full_name, nickname: row.nickname, whatIfSource: "active-ufc-canonical-profile" }
  };
}

function readiness(row: FeatureRow) {
  const payload = asRecord(row.payload_json);
  const canonical = asRecord(payload.canonicalProfile);
  const completeness = asRecord(canonical.completeness);
  const activeRoster = evaluateActiveUfcRosterStatus({
    payload,
    hasUpcomingUfcFight: row.has_upcoming_ufc_fight,
    hasRecentUfcFight: row.has_recent_ufc_fight,
    recentUfcFightDate: row.recent_ufc_fight_date,
    ufcActivityCount: row.ufc_activity_count
  });
  const status = typeof canonical.status === "string" ? canonical.status : null;
  const score = numeric(completeness.score) ?? 0;
  const gate = canUseActiveUfcWhatIfProfile({ canonicalStatus: status, whatIfReady: Boolean(canonical.whatIfReady), activeRoster, completenessScore: score });
  return { payload, canonical, activeRoster, status, score, gate };
}

async function findFighter(identifier: string, modelVersion: string) {
  const q = slug(identifier);
  const rows = await prisma.$queryRaw<FeatureRow[]>`
    WITH latest_features AS (
      SELECT DISTINCT ON (mf.fighter_id)
        mf.fighter_id, mf.fight_id, mf.model_version, mf.feature_json, mf.pro_fights, mf.ufc_fights, mf.rounds_fought,
        mf.sig_strikes_landed_per_min, mf.sig_strikes_absorbed_per_min, mf.striking_differential,
        mf.takedowns_per_15, NULL::double precision AS takedown_accuracy_pct, mf.takedown_defense_pct, mf.submission_attempts_per_15,
        mf.control_time_pct, mf.opponent_adjusted_strength, mf.cold_start_active, mf.updated_at
      FROM ufc_model_features mf
      WHERE mf.model_version = ${modelVersion}
      ORDER BY mf.fighter_id, mf.updated_at DESC, mf.snapshot_at DESC
    ), latest_fights AS (
      SELECT DISTINCT ON (p.fighter_id) p.fighter_id, f.id AS fight_id, f.fight_date
      FROM (
        SELECT fighter_a_id AS fighter_id, id AS fight_id FROM ufc_fights
        UNION ALL
        SELECT fighter_b_id AS fighter_id, id AS fight_id FROM ufc_fights
      ) p
      JOIN ufc_fights f ON f.id = p.fight_id
      ORDER BY p.fighter_id, f.fight_date DESC NULLS LAST
    ), activity AS (
      SELECT fighter_id,
        BOOL_OR(fight_date >= now() - interval '12 hours' AND COALESCE(status, '') NOT IN ('CANCELED', 'VOID')) AS has_upcoming_ufc_fight,
        BOOL_OR(fight_date >= now() - interval '24 months' AND fight_date < now() AND COALESCE(status, '') NOT IN ('CANCELED', 'VOID')) AS has_recent_ufc_fight,
        MAX(CASE WHEN fight_date < now() AND COALESCE(status, '') NOT IN ('CANCELED', 'VOID') THEN fight_date ELSE NULL END) AS recent_ufc_fight_date,
        COUNT(*)::int AS ufc_activity_count
      FROM (
        SELECT fighter_a_id AS fighter_id, fight_date, status FROM ufc_fights
        UNION ALL
        SELECT fighter_b_id AS fighter_id, fight_date, status FROM ufc_fights
      ) p
      GROUP BY fighter_id
    )
    SELECT f.id AS fighter_id, f.full_name, COALESCE(f.payload_json->>'nickname', f.payload_json->>'nickName') AS nickname, f.payload_json,
      COALESCE(lf.fight_id, lft.fight_id) AS latest_fight_id,
      lft.fight_date AS latest_fight_date,
      lf.feature_json, lf.model_version, lf.pro_fights, lf.ufc_fights, lf.rounds_fought,
      lf.sig_strikes_landed_per_min, lf.sig_strikes_absorbed_per_min, lf.striking_differential,
      lf.takedowns_per_15, lf.takedown_accuracy_pct, lf.takedown_defense_pct, lf.submission_attempts_per_15,
      lf.control_time_pct, lf.opponent_adjusted_strength, lf.cold_start_active, lf.updated_at AS feature_updated_at,
      COALESCE(a.has_upcoming_ufc_fight, false) AS has_upcoming_ufc_fight,
      COALESCE(a.has_recent_ufc_fight, false) AS has_recent_ufc_fight,
      a.recent_ufc_fight_date,
      COALESCE(a.ufc_activity_count, 0) AS ufc_activity_count
    FROM ufc_fighters f
    LEFT JOIN latest_features lf ON lf.fighter_id = f.id
    LEFT JOIN latest_fights lft ON lft.fighter_id = f.id
    LEFT JOIN activity a ON a.fighter_id = f.id
    WHERE f.id = ${identifier}
      OR lower(f.full_name) = lower(${identifier})
      OR lower(regexp_replace(f.full_name, '[^a-zA-Z0-9]+', '-', 'g')) = ${q}
      OR lower(regexp_replace(COALESCE(f.payload_json->>'nickname', f.payload_json->>'nickName', ''), '[^a-zA-Z0-9]+', '-', 'g')) = ${q}
    ORDER BY COALESCE(lf.updated_at, f.updated_at) DESC NULLS LAST
    LIMIT 1
  `;
  return rows[0] ?? null;
}

function fighterSummary(row: FeatureRow, profile: UfcIndividualFighterProfile): ActiveUfcWhatIfFighterSummary {
  const ready = readiness(row);
  return {
    fighterId: row.fighter_id,
    fullName: row.full_name,
    status: ready.status,
    whatIfReady: ready.gate.ok,
    completenessScore: ready.score,
    activeRoster: ready.activeRoster,
    blockers: ready.gate.blockers,
    individualProfile: profile
  };
}

export async function runActiveUfcWhatIfSim(args: { fighterA: string; fighterB: string; modelVersion?: string; simulations?: number; scheduledRounds?: 3 | 5; seed?: number }): Promise<ActiveUfcWhatIfSimResult> {
  const generatedAt = new Date().toISOString();
  const modelVersion = args.modelVersion ?? "ufc-fight-iq-v1";
  const simulations = Math.max(250, Math.min(25_000, Math.round(args.simulations ?? 10_000)));
  const scheduledRounds = args.scheduledRounds ?? 3;
  const warnings: string[] = [];
  const errors: string[] = [];
  if (!hasUsableServerDatabaseUrl()) return { ok: false, generatedAt, modelVersion, scheduledRounds, simulations, fighterA: null, fighterB: null, sim: null, warnings, errors: ["No usable server database URL configured."] };

  const [rowA, rowB] = await Promise.all([findFighter(args.fighterA, modelVersion), findFighter(args.fighterB, modelVersion)]);
  if (!rowA) errors.push(`Fighter A not found: ${args.fighterA}`);
  if (!rowB) errors.push(`Fighter B not found: ${args.fighterB}`);
  if (!rowA || !rowB) return { ok: false, generatedAt, modelVersion, scheduledRounds, simulations, fighterA: null, fighterB: null, sim: null, warnings, errors };

  const rawA = snapshotFromRow(rowA, rowB.fighter_id, modelVersion);
  const rawB = snapshotFromRow(rowB, rowA.fighter_id, modelVersion);
  const bridgeA = applyIndividualUfcProfileToFeature({ feature: rawA, payload: rowA.payload_json, fighterName: rowA.full_name });
  const bridgeB = applyIndividualUfcProfileToFeature({ feature: rawB, payload: rowB.payload_json, fighterName: rowB.full_name });
  const summaryA = fighterSummary(rowA, bridgeA.profile);
  const summaryB = fighterSummary(rowB, bridgeB.profile);

  if (!summaryA.whatIfReady) errors.push(`${rowA.full_name} is not active-roster what-if ready: ${summaryA.blockers.join(", ")}`);
  if (!summaryB.whatIfReady) errors.push(`${rowB.full_name} is not active-roster what-if ready: ${summaryB.blockers.join(", ")}`);
  if (bridgeA.profile.noGenericEdge) warnings.push(`${rowA.full_name}: individual profile has no-generic-edge guard active.`);
  if (bridgeB.profile.noGenericEdge) warnings.push(`${rowB.full_name}: individual profile has no-generic-edge guard active.`);
  if (errors.length) return { ok: false, generatedAt, modelVersion, scheduledRounds, simulations, fighterA: summaryA, fighterB: summaryB, sim: null, warnings, errors };

  const sim = runUfcEnsembleSimFromFeatures(
    { ...bridgeA.feature, opponentFighterId: rowB.fighter_id },
    { ...bridgeB.feature, opponentFighterId: rowA.fighter_id },
    { simulations, seed: args.seed, scheduledRounds }
  );
  return { ok: true, generatedAt, modelVersion, scheduledRounds, simulations, fighterA: summaryA, fighterB: summaryB, sim, warnings, errors };
}
