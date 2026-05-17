import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { findUfcCredentialPriors } from "@/services/ufc/fighter-credential-priors";
import type { UfcModelFeatureSnapshot } from "@/services/ufc/fighter-skill-profile";
import { auditUfcProfileTruth } from "@/services/ufc/profile-truth-audit";

type QaRow = {
  fight_id: string;
  event_label: string;
  event_name: string | null;
  fight_date: Date | string;
  side: string;
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
  takedowns_per_15: number | null;
  takedown_defense_pct: number | null;
  submission_attempts_per_15: number | null;
  control_time_pct: number | null;
  opponent_adjusted_strength: number | null;
  cold_start_active: boolean | null;
  feature_updated_at: Date | string | null;
};

export type UfcFighterProfileQaItem = {
  fightId: string;
  eventLabel: string;
  eventName: string | null;
  fightDate: string;
  side: string;
  fighterId: string;
  fighterName: string;
  opponentId: string;
  opponentName: string;
  profileStatus: "OK" | "WATCH" | "CREDENTIAL_READY_RERUN" | "REPAIR_NOW" | "NO_FEATURE";
  profileScore: number;
  profileGrade: string;
  confidenceCap: string;
  source: string | null;
  dataQuality: string | null;
  coldStartActive: boolean;
  sample: {
    proFights: number | null;
    ufcFights: number | null;
    roundsFought: number | null;
  };
  keyStats: {
    slpm: number | null;
    sapm: number | null;
    takedownsPer15: number | null;
    takedownDefensePct: number | null;
    submissionAttemptsPer15: number | null;
    controlTimePct: number | null;
    opponentAdjustedStrength: number | null;
  };
  missingCritical: string[];
  genericDefaultFields: string[];
  matchedCredentialPriors: Array<{ id: string; confidence: string; evidence: string[]; keys: string[] }>;
  appliedCredentialPriors: Array<{ id: string | null; confidence: string | null; changedKeys: string[] }>;
  recommendedAction: string;
  evidence: string[];
  featureUpdatedAt: string | null;
};

export type UfcFighterProfileQaReport = {
  ok: boolean;
  modelVersion: string;
  horizonDays: number;
  checkedAt: string;
  fightCount: number;
  fighterSides: number;
  statusCounts: Record<string, number>;
  gradeCounts: Record<string, number>;
  credentialMatchCount: number;
  credentialAppliedCount: number;
  genericAvatarCount: number;
  noFeatureCount: number;
  repairQueue: UfcFighterProfileQaItem[];
  credentialQueue: UfcFighterProfileQaItem[];
  items: UfcFighterProfileQaItem[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function numeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function featureValue(row: QaRow, key: string) {
  const feature = asRecord(row.feature_json);
  const rawFeature = asRecord(feature.rawFeature);
  const direct = numeric((row as unknown as Record<string, unknown>)[key]);
  if (direct != null) return direct;
  const json = numeric(feature[key]);
  if (json != null) return json;
  return numeric(rawFeature[key]);
}

function missingCritical(row: QaRow) {
  const missing: string[] = [];
  if (row.feature_json == null) return ["modelFeatureSnapshot"];
  if (row.pro_fights == null) missing.push("proFights");
  if (row.ufc_fights == null) missing.push("ufcFights");
  if (row.rounds_fought == null) missing.push("roundsFought");
  if (row.sig_strikes_landed_per_min == null) missing.push("sigStrikesLandedPerMin");
  if (row.sig_strikes_absorbed_per_min == null) missing.push("sigStrikesAbsorbedPerMin");
  if (row.takedowns_per_15 == null) missing.push("takedownsPer15");
  if (row.takedown_defense_pct == null) missing.push("takedownDefensePct");
  if (row.control_time_pct == null) missing.push("controlTimePct");
  if (row.opponent_adjusted_strength == null) missing.push("opponentAdjustedStrength");
  return missing;
}

function genericDefaultFields(row: QaRow) {
  const checks: Array<[string, number | null, number[]]> = [
    ["sigStrikesLandedPerMin", row.sig_strikes_landed_per_min, [2.4, 2.5, 3, 3.2]],
    ["sigStrikesAbsorbedPerMin", row.sig_strikes_absorbed_per_min, [2.5, 3, 3.2]],
    ["takedownsPer15", row.takedowns_per_15, [0.8, 1, 1.2]],
    ["takedownDefensePct", row.takedown_defense_pct, [45, 46, 50, 55]],
    ["submissionAttemptsPer15", row.submission_attempts_per_15, [0.2, 0.3, 0.4]],
    ["controlTimePct", row.control_time_pct, [39, 40, 45, 46, 50]],
    ["opponentAdjustedStrength", row.opponent_adjusted_strength, [45, 50, 52]]
  ];
  const feature = asRecord(row.feature_json);
  const more: Array<[string, number | null, number[]]> = [
    ["power", numeric(feature.powerScore), [43, 45, 50]],
    ["cardio", numeric(feature.staminaScore), [49, 50]],
    ["amateurSignal", numeric(feature.amateurSignal), [50]],
    ["promotionTierSignal", numeric(feature.promotionTierSignal), [50]]
  ];
  return [...checks, ...more]
    .filter(([, value, defaults]) => value != null && defaults.some((defaultValue) => Math.abs((value as number) - defaultValue) < 0.001))
    .map(([key]) => key);
}

function buildFeatureSnapshot(row: QaRow): UfcModelFeatureSnapshot {
  const feature = asRecord(row.feature_json);
  return {
    fightId: row.fight_id,
    fightDate: iso(row.fight_date) ?? new Date().toISOString(),
    fighterId: row.fighter_id,
    opponentFighterId: row.opponent_id,
    snapshotAt: iso(row.feature_updated_at) ?? new Date().toISOString(),
    modelVersion: "ufc-fight-iq-v1",
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
    strikingDifferential: featureValue(row, "strikingDifferential"),
    sigStrikeAccuracyPct: featureValue(row, "sigStrikeAccuracyPct"),
    sigStrikeDefensePct: featureValue(row, "sigStrikeDefensePct"),
    knockdownsPer15: featureValue(row, "knockdownsPer15"),
    takedownsPer15: row.takedowns_per_15,
    takedownAccuracyPct: featureValue(row, "takedownAccuracyPct"),
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

function appliedCredentialPriors(featureJson: Record<string, unknown>) {
  const prior = asRecord(featureJson.eliteCombatCredentialPrior);
  const applied = asArray(prior.appliedPriors);
  if (applied.length) {
    return applied.map((item) => {
      const record = asRecord(item);
      return {
        id: typeof record.id === "string" ? record.id : null,
        confidence: typeof record.confidence === "string" ? record.confidence : null,
        changedKeys: asArray(record.changedKeys).map(String).slice(0, 12)
      };
    });
  }
  if (typeof prior.source === "string") {
    return [{ id: typeof prior.sourceUrl === "string" ? prior.sourceUrl : prior.source, confidence: typeof prior.confidence === "string" ? prior.confidence : null, changedKeys: asArray(prior.changedKeys).map(String).slice(0, 12) }];
  }
  return [];
}

function recommend(args: { noFeature: boolean; score: number; missing: string[]; generic: string[]; matched: number; applied: number; coldStart: boolean }) {
  if (args.noFeature) return "Run upcoming feature hydration/precompute; no model feature snapshot exists.";
  if (args.matched > 0 && args.applied === 0) return "Credential prior matched but is not applied yet. Rerun UFC precompute after credential-prior deployment.";
  if (args.matched > 0 && args.generic.length > 3) return "Credential prior applied/available, but profile still looks generic. Inspect source merge and rerun fighter profile builder.";
  if (args.missing.length >= 4) return "Backfill profile stats from UFCStats/Tapology/Sherdog/FightMatrix before trusting sim.";
  if (args.coldStart) return "Cold-start still active. Add scouting/background priors or real fight history.";
  if (args.score < 72) return "Profile usable for research only. Add missing fields before promotion.";
  return "Profile is usable. Monitor calibration and settlement.";
}

function status(args: { noFeature: boolean; score: number; matched: number; applied: number; generic: string[]; missing: string[]; coldStart: boolean }): UfcFighterProfileQaItem["profileStatus"] {
  if (args.noFeature) return "NO_FEATURE";
  if (args.matched > 0 && args.applied === 0) return "CREDENTIAL_READY_RERUN";
  if (args.score < 55 || args.missing.length >= 5 || args.generic.length >= 6) return "REPAIR_NOW";
  if (args.score < 75 || args.coldStart || args.generic.length >= 3) return "WATCH";
  return "OK";
}

function mapRow(row: QaRow): UfcFighterProfileQaItem {
  const feature = asRecord(row.feature_json);
  const snapshot = buildFeatureSnapshot(row);
  const truth = row.feature_json ? auditUfcProfileTruth(feature) : null;
  const matched = findUfcCredentialPriors({ feature: snapshot, payloadRecord: asRecord(row.fighter_payload_json) });
  const applied = appliedCredentialPriors(feature);
  const missing = missingCritical(row);
  const generic = genericDefaultFields(row);
  const noFeature = row.feature_json == null;
  const profileScore = noFeature ? 0 : truth?.score ?? 0;
  const profileStatus = status({ noFeature, score: profileScore, matched: matched.length, applied: applied.length, generic, missing, coldStart: Boolean(row.cold_start_active) });
  return {
    fightId: row.fight_id,
    eventLabel: row.event_label,
    eventName: row.event_name,
    fightDate: iso(row.fight_date) ?? "",
    side: row.side,
    fighterId: row.fighter_id,
    fighterName: row.fighter_name,
    opponentId: row.opponent_id,
    opponentName: row.opponent_name,
    profileStatus,
    profileScore,
    profileGrade: noFeature ? "D" : truth?.grade ?? "D",
    confidenceCap: noFeature ? "LOW" : truth?.confidenceCap ?? "LOW",
    source: typeof feature.source === "string" ? feature.source : null,
    dataQuality: noFeature ? "D" : truth?.dataQuality ?? null,
    coldStartActive: Boolean(row.cold_start_active),
    sample: { proFights: row.pro_fights, ufcFights: row.ufc_fights, roundsFought: row.rounds_fought },
    keyStats: {
      slpm: row.sig_strikes_landed_per_min,
      sapm: row.sig_strikes_absorbed_per_min,
      takedownsPer15: row.takedowns_per_15,
      takedownDefensePct: row.takedown_defense_pct,
      submissionAttemptsPer15: row.submission_attempts_per_15,
      controlTimePct: row.control_time_pct,
      opponentAdjustedStrength: row.opponent_adjusted_strength
    },
    missingCritical: missing,
    genericDefaultFields: generic,
    matchedCredentialPriors: matched.map((prior) => ({ id: prior.id, confidence: prior.confidence, evidence: prior.evidence.slice(0, 3), keys: Object.keys(prior.priors).slice(0, 12) })),
    appliedCredentialPriors: applied,
    recommendedAction: recommend({ noFeature, score: profileScore, missing, generic, matched: matched.length, applied: applied.length, coldStart: Boolean(row.cold_start_active) }),
    evidence: [...matched.flatMap((prior) => prior.evidence), ...(truth?.reasonCodes ?? [])].slice(0, 8),
    featureUpdatedAt: iso(row.feature_updated_at)
  };
}

async function queryRows(modelVersion: string, horizonDays: number, limit: number) {
  return prisma.$queryRaw<QaRow[]>`
    WITH fight_scope AS (
      SELECT f.id, f.event_label, f.fight_date, f.fighter_a_id, f.fighter_b_id, e.event_name
      FROM ufc_fights f
      LEFT JOIN ufc_events e ON e.id = f.event_id
      WHERE f.fight_date >= now() - interval '12 hours'
        AND f.fight_date <= now() + (${horizonDays}::text || ' days')::interval
        AND f.status NOT IN ('CANCELED', 'VOID')
        AND COALESCE(f.payload_json->>'matchupQuality', '') <> 'FAKE_NAVIGATION'
      ORDER BY f.fight_date ASC, f.bout_order NULLS LAST, f.event_label ASC
      LIMIT ${Math.max(1, Math.min(500, limit))}
    ), sides AS (
      SELECT fs.id AS fight_id, fs.event_label, fs.event_name, fs.fight_date, 'A'::text AS side, fs.fighter_a_id AS fighter_id, fs.fighter_b_id AS opponent_id FROM fight_scope fs
      UNION ALL
      SELECT fs.id AS fight_id, fs.event_label, fs.event_name, fs.fight_date, 'B'::text AS side, fs.fighter_b_id AS fighter_id, fs.fighter_a_id AS opponent_id FROM fight_scope fs
    )
    SELECT s.fight_id, s.event_label, s.event_name, s.fight_date, s.side, s.fighter_id, ftr.full_name AS fighter_name,
      s.opponent_id, opp.full_name AS opponent_name, ftr.payload_json AS fighter_payload_json,
      mf.feature_json, mf.pro_fights, mf.ufc_fights, mf.rounds_fought,
      mf.sig_strikes_landed_per_min, mf.sig_strikes_absorbed_per_min, mf.takedowns_per_15,
      mf.takedown_defense_pct, mf.submission_attempts_per_15, mf.control_time_pct,
      mf.opponent_adjusted_strength, mf.cold_start_active, mf.updated_at AS feature_updated_at
    FROM sides s
    JOIN ufc_fighters ftr ON ftr.id = s.fighter_id
    JOIN ufc_fighters opp ON opp.id = s.opponent_id
    LEFT JOIN LATERAL (
      SELECT * FROM ufc_model_features mf
      WHERE mf.fight_id = s.fight_id AND mf.fighter_id = s.fighter_id AND mf.model_version = ${modelVersion} AND mf.snapshot_at <= mf.fight_date
      ORDER BY mf.updated_at DESC, mf.snapshot_at DESC
      LIMIT 1
    ) mf ON true
    ORDER BY s.fight_date ASC, s.event_label ASC, s.side ASC
  `;
}

export async function getUfcFighterProfileQaReport(options: { modelVersion?: string; horizonDays?: number; limit?: number } = {}): Promise<UfcFighterProfileQaReport> {
  const modelVersion = options.modelVersion ?? "ufc-fight-iq-v1";
  const horizonDays = Math.max(1, Math.min(365, Math.round(options.horizonDays ?? 180)));
  const limit = Math.max(1, Math.min(500, Math.round(options.limit ?? 200)));
  if (!hasUsableServerDatabaseUrl()) {
    return { ok: false, modelVersion, horizonDays, checkedAt: new Date().toISOString(), fightCount: 0, fighterSides: 0, statusCounts: {}, gradeCounts: {}, credentialMatchCount: 0, credentialAppliedCount: 0, genericAvatarCount: 0, noFeatureCount: 0, repairQueue: [], credentialQueue: [], items: [] };
  }
  const items = (await queryRows(modelVersion, horizonDays, limit)).map(mapRow);
  const fightCount = new Set(items.map((item) => item.fightId)).size;
  const statusCounts = countBy(items.map((item) => item.profileStatus));
  const gradeCounts = countBy(items.map((item) => item.profileGrade));
  const repairQueue = items.filter((item) => item.profileStatus === "REPAIR_NOW" || item.profileStatus === "NO_FEATURE").sort((a, b) => a.profileScore - b.profileScore || b.genericDefaultFields.length - a.genericDefaultFields.length).slice(0, 100);
  const credentialQueue = items.filter((item) => item.matchedCredentialPriors.length > 0 || item.appliedCredentialPriors.length > 0).sort((a, b) => a.profileScore - b.profileScore || a.fighterName.localeCompare(b.fighterName)).slice(0, 100);
  return {
    ok: true,
    modelVersion,
    horizonDays,
    checkedAt: new Date().toISOString(),
    fightCount,
    fighterSides: items.length,
    statusCounts,
    gradeCounts,
    credentialMatchCount: items.filter((item) => item.matchedCredentialPriors.length > 0).length,
    credentialAppliedCount: items.filter((item) => item.appliedCredentialPriors.length > 0).length,
    genericAvatarCount: items.filter((item) => item.genericDefaultFields.length >= 4).length,
    noFeatureCount: items.filter((item) => item.profileStatus === "NO_FEATURE").length,
    repairQueue,
    credentialQueue,
    items: items.slice(0, 250)
  };
}
