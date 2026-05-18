import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { auditUfcFighterProfileCompleteness } from "@/services/ufc/fighter-profile-completeness";
import { buildUfcFighterSkillProfile, type UfcModelFeatureSnapshot } from "@/services/ufc/fighter-skill-profile";
import { findUfcCredentialPriors } from "@/services/ufc/fighter-credential-priors";

type FighterRow = {
  fighter_id: string;
  full_name: string;
  nickname: string | null;
  payload_json: unknown;
  latest_fight_id: string | null;
  latest_fight_date: Date | string | null;
  latest_model_version: string | null;
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
  feature_updated_at: Date | string | null;
};

export type CanonicalProfileResult = {
  ok: boolean;
  dryRun: boolean;
  modelVersion: string;
  scanned: number;
  updated: number;
  blockedGeneric: number;
  items: Array<{ fighterId: string; fighterName: string; grade: string; score: number; archetype: string; whatIfReady: boolean; blocked: boolean; missing: string[]; generic: string[] }>;
  errors: string[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function iso(value: Date | string | null | undefined) {
  if (!value) return new Date().toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function featureValue(row: FighterRow, key: string) {
  const feature = asRecord(row.feature_json);
  const history = asRecord(asRecord(row.payload_json).historyDerivedStats);
  const stats = asRecord(asRecord(row.payload_json).stats);
  const rawFeature = asRecord(feature.rawFeature);
  const dbKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  return numeric((row as unknown as Record<string, unknown>)[dbKey]) ?? numeric(feature[key]) ?? numeric(rawFeature[key]) ?? numeric(history[key]) ?? numeric(stats[key]);
}

function buildSnapshot(row: FighterRow, modelVersion: string): UfcModelFeatureSnapshot {
  const payload = asRecord(row.payload_json);
  const feature = asRecord(row.feature_json);
  return {
    fightId: row.latest_fight_id ?? `canonical-${row.fighter_id}`,
    fightDate: iso(row.latest_fight_date),
    fighterId: row.fighter_id,
    opponentFighterId: "canonical-opponent",
    snapshotAt: iso(row.feature_updated_at ?? row.latest_fight_date),
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
    feature: { ...payload, ...feature, fighterName: row.full_name, nickname: row.nickname }
  };
}

function archetypeFrom(skill: ReturnType<typeof buildUfcFighterSkillProfile>, credentialIds: string[]) {
  if (credentialIds.includes("gable-steveson") || credentialIds.includes("elite-freestyle-wrestler")) return "elite_wrestling_top_control";
  if (credentialIds.includes("bjj-black-belt-grappler")) return "submission_grappler";
  if (credentialIds.includes("elite-kickboxer-muay-thai")) return "technical_kickboxer";
  if (credentialIds.includes("elite-boxer")) return "boxing_counter_striker";
  const wrestling = (skill.wrestling.takedownOffense + skill.wrestling.control + skill.grappling.topGame) / 3;
  const striking = (skill.striking.offense + skill.striking.power + skill.striking.distanceManagement) / 3;
  const submissions = (skill.grappling.submissionThreat + skill.grappling.guardGame) / 2;
  if (wrestling >= striking + 8 && wrestling >= submissions) return "wrestling_control";
  if (submissions >= wrestling && submissions >= striking) return "submission_grappler";
  if (striking >= wrestling + 6) return skill.kicking.offense > 58 ? "kickboxing_striker" : "boxing_striker";
  return "balanced_mma";
}

function eraProfile(label: string, row: FighterRow, skill: ReturnType<typeof buildUfcFighterSkillProfile>, multiplier = 1) {
  return {
    label,
    weightClass: skill.weightClass,
    asOf: iso(row.feature_updated_at ?? row.latest_fight_date),
    rating: Math.round((skill.sampleReliability * 100 + skill.profileCompleteness!.score) / 2),
    attributes: {
      striking: Math.round((skill.striking.offense + skill.striking.defense + skill.striking.power) / 3 * multiplier),
      wrestling: Math.round((skill.wrestling.takedownOffense + skill.wrestling.takedownDefense + skill.wrestling.control) / 3 * multiplier),
      grappling: Math.round((skill.grappling.submissionThreat + skill.grappling.grapplingDefense + skill.grappling.topGame) / 3 * multiplier),
      durability: Math.round((skill.durability.koResistance + skill.durability.submissionResistance + skill.durability.heart) / 3 * multiplier),
      cardio: Math.round((skill.cardio.stamina + skill.cardio.latePace + skill.cardio.paceSustain) / 3 * multiplier),
      fightIq: Math.round((skill.intangibles.fightIq + skill.intangibles.gamePlan) / 2 * multiplier)
    }
  };
}

function buildCanonicalProfile(row: FighterRow, modelVersion: string) {
  const payload = asRecord(row.payload_json);
  const snapshot = buildSnapshot(row, modelVersion);
  const completeness = auditUfcFighterProfileCompleteness(snapshot);
  const skill = buildUfcFighterSkillProfile({ feature: snapshot });
  const credentials = findUfcCredentialPriors({ feature: snapshot, payloadRecord: payload });
  const credentialIds = credentials.map((credential) => credential.id);
  const archetype = archetypeFrom(skill, credentialIds);
  const whatIfReady = completeness.score >= 72 && !completeness.isGenericAvatar;
  const blocked = completeness.isGenericAvatar || completeness.score < 55;
  const careerStats = asRecord(payload.historyDerivedStats).source ? asRecord(payload.historyDerivedStats) : asRecord(payload.careerStats).source ? asRecord(payload.careerStats) : asRecord(payload.stats);
  return {
    version: "ufc-canonical-profile-v1",
    builtAt: new Date().toISOString(),
    modelVersion,
    identity: {
      fighterId: row.fighter_id,
      fullName: row.full_name,
      nickname: row.nickname,
      normalizedName: row.full_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
    },
    status: blocked ? "NEEDS_REPAIR" : whatIfReady ? "WHAT_IF_READY" : "RESEARCH_ONLY",
    whatIfReady,
    archetype,
    sources: {
      careerStats: typeof careerStats.source === "string" ? careerStats.source : null,
      featureSource: typeof asRecord(row.feature_json).source === "string" ? asRecord(row.feature_json).source : null,
      credentials: credentialIds,
      evidenceFlags: completeness.evidenceFlags
    },
    completeness,
    careerStats,
    ratings: skill,
    eras: [
      eraProfile("current", row, skill),
      eraProfile("prime-projection", row, skill, completeness.credentialPriorApplied ? 1.04 : 1.02)
    ],
    fantasySim: {
      canUseAsStandaloneFighter: whatIfReady,
      blockingReasons: blocked ? [...completeness.missingCore.map((key) => `missing:${key}`), ...completeness.genericDefaultFields.map((key) => `generic:${key}`)].slice(0, 20) : [],
      supportedWeightClasses: [skill.weightClass].filter(Boolean),
      notes: blocked ? "Canonical profile blocked because the underlying data is still generic or incomplete." : "Canonical profile can be reused outside a scheduled fight snapshot."
    }
  };
}

async function queryRows(modelVersion: string, limit: number, onlyNeedingRepair: boolean) {
  return prisma.$queryRaw<FighterRow[]>`
    WITH latest_features AS (
      SELECT DISTINCT ON (mf.fighter_id)
        mf.fighter_id,
        mf.fight_id,
        mf.model_version,
        mf.feature_json,
        mf.pro_fights,
        mf.ufc_fights,
        mf.rounds_fought,
        mf.sig_strikes_landed_per_min,
        mf.sig_strikes_absorbed_per_min,
        mf.striking_differential,
        mf.takedowns_per_15,
        mf.takedown_accuracy_pct,
        mf.takedown_defense_pct,
        mf.submission_attempts_per_15,
        mf.control_time_pct,
        mf.opponent_adjusted_strength,
        mf.cold_start_active,
        mf.updated_at
      FROM ufc_model_features mf
      WHERE mf.model_version = ${modelVersion}
      ORDER BY mf.fighter_id, mf.updated_at DESC, mf.snapshot_at DESC
    ), latest_fights AS (
      SELECT DISTINCT ON (p.fighter_id)
        p.fighter_id,
        f.id AS fight_id,
        f.fight_date
      FROM (
        SELECT fighter_a_id AS fighter_id, id AS fight_id FROM ufc_fights
        UNION ALL
        SELECT fighter_b_id AS fighter_id, id AS fight_id FROM ufc_fights
      ) p
      JOIN ufc_fights f ON f.id = p.fight_id
      ORDER BY p.fighter_id, f.fight_date DESC NULLS LAST
    )
    SELECT
      f.id AS fighter_id,
      f.full_name,
      f.nickname,
      f.payload_json,
      COALESCE(lf.fight_id, lft.fight_id) AS latest_fight_id,
      lft.fight_date AS latest_fight_date,
      lf.model_version AS latest_model_version,
      lf.feature_json,
      lf.pro_fights,
      lf.ufc_fights,
      lf.rounds_fought,
      lf.sig_strikes_landed_per_min,
      lf.sig_strikes_absorbed_per_min,
      lf.striking_differential,
      lf.takedowns_per_15,
      lf.takedown_accuracy_pct,
      lf.takedown_defense_pct,
      lf.submission_attempts_per_15,
      lf.control_time_pct,
      lf.opponent_adjusted_strength,
      lf.cold_start_active,
      lf.updated_at AS feature_updated_at
    FROM ufc_fighters f
    LEFT JOIN latest_features lf ON lf.fighter_id = f.id
    LEFT JOIN latest_fights lft ON lft.fighter_id = f.id
    WHERE (${onlyNeedingRepair} = false OR COALESCE(f.payload_json->'canonicalProfile'->>'status', 'NEEDS_REPAIR') <> 'WHAT_IF_READY')
    ORDER BY COALESCE(lf.updated_at, f.updated_at) DESC NULLS LAST, f.full_name ASC
    LIMIT ${Math.max(1, Math.min(5000, limit))}
  `;
}

export async function buildCanonicalUfcFighterProfiles(options: { modelVersion?: string; limit?: number; dryRun?: boolean; onlyNeedingRepair?: boolean } = {}): Promise<CanonicalProfileResult> {
  const modelVersion = options.modelVersion ?? "ufc-fight-iq-v1";
  const limit = Math.max(1, Math.min(5000, Math.round(options.limit ?? 500)));
  const dryRun = options.dryRun !== false;
  const onlyNeedingRepair = options.onlyNeedingRepair !== false;
  if (!hasUsableServerDatabaseUrl()) return { ok: false, dryRun, modelVersion, scanned: 0, updated: 0, blockedGeneric: 0, items: [], errors: ["No usable server database URL configured."] };
  const rows = await queryRows(modelVersion, limit, onlyNeedingRepair);
  let updated = 0;
  let blockedGeneric = 0;
  const items: CanonicalProfileResult["items"] = [];
  const errors: string[] = [];
  for (const row of rows) {
    try {
      const profile = buildCanonicalProfile(row, modelVersion);
      if (profile.status === "NEEDS_REPAIR") blockedGeneric += 1;
      items.push({ fighterId: row.fighter_id, fighterName: row.full_name, grade: profile.completeness.grade, score: profile.completeness.score, archetype: profile.archetype, whatIfReady: profile.whatIfReady, blocked: profile.status === "NEEDS_REPAIR", missing: profile.completeness.missingCore, generic: profile.completeness.genericDefaultFields });
      if (!dryRun) {
        await prisma.$executeRaw`
          UPDATE ufc_fighters
          SET payload_json = COALESCE(payload_json, '{}'::jsonb) || ${JSON.stringify({ canonicalProfile: profile })}::jsonb,
              updated_at = now()
          WHERE id = ${row.fighter_id}
        `;
      }
      updated += 1;
    } catch (error) {
      errors.push(`${row.full_name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { ok: errors.length === 0, dryRun, modelVersion, scanned: rows.length, updated, blockedGeneric, items: items.slice(0, 100), errors: errors.slice(0, 50) };
}
