import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { findUfcCredentialPriors } from "@/services/ufc/fighter-credential-priors";
import { buildUfcFighterSkillProfile, type UfcModelFeatureSnapshot } from "@/services/ufc/fighter-skill-profile";
import { buildUfcFighterStyleGenome, type UfcFighterStyleGenome, type UfcStyleArchetype } from "@/services/ufc/fighter-style-genome";

type TendencyRow = {
  fighter_id: string;
  full_name: string;
  nickname: string | null;
  stance: string | null;
  height_inches: number | null;
  reach_inches: number | null;
  payload_json: unknown;
  fight_id: string | null;
  fight_date: Date | string | null;
  model_version: string | null;
  opponent_fighter_id: string | null;
  snapshot_at: Date | string | null;
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

export type UfcFighterTendencyFillResult = {
  ok: boolean;
  dryRun: boolean;
  modelVersion: string;
  scanned: number;
  filled: number;
  blocked: number;
  sourceCounts: Record<string, number>;
  archetypeCounts: Record<string, number>;
  qualityCounts: Record<string, number>;
  items: Array<{
    fighterId: string;
    fighterName: string;
    archetype: string;
    confidence: number;
    sourceQuality: string;
    fallbackUsed: boolean;
    blocked: boolean;
    missingSignals: string[];
  }>;
  errors: string[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function toIso(value: Date | string | null | undefined, fallback = new Date().toISOString()) {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function safeFightDate(row: TendencyRow) {
  const featureDate = toIso(row.fight_date, new Date(Date.now() + 60_000).toISOString());
  const snapshot = toIso(row.snapshot_at ?? row.feature_updated_at, new Date().toISOString());
  if (new Date(snapshot).getTime() <= new Date(featureDate).getTime()) return featureDate;
  return new Date(new Date(snapshot).getTime() + 60_000).toISOString();
}

function featureNumber(row: TendencyRow, key: string) {
  const feature = asRecord(row.feature_json);
  const payload = asRecord(row.payload_json);
  const canonical = asRecord(payload.canonicalProfile);
  const careerStats = asRecord(canonical.careerStats);
  const payloadStats = asRecord(payload.careerStats);
  const stats = asRecord(payload.stats);
  const rawFeature = asRecord(feature.rawFeature);
  const dbKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  return asNumber((row as unknown as Record<string, unknown>)[dbKey]) ?? asNumber(feature[key]) ?? asNumber(rawFeature[key]) ?? asNumber(careerStats[key]) ?? asNumber(payloadStats[key]) ?? asNumber(stats[key]);
}

function buildSnapshot(row: TendencyRow, modelVersion: string): UfcModelFeatureSnapshot {
  const payload = asRecord(row.payload_json);
  const canonical = asRecord(payload.canonicalProfile);
  const ratings = asRecord(canonical.ratings);
  const profileFeature = asRecord(row.feature_json);
  const feature = { ...payload, ...profileFeature, fighterName: row.full_name, nickname: row.nickname };
  return {
    fightId: row.fight_id ?? `tendency-${row.fighter_id}`,
    fightDate: safeFightDate(row),
    fighterId: row.fighter_id,
    opponentFighterId: row.opponent_fighter_id ?? "tendency-opponent",
    snapshotAt: toIso(row.snapshot_at ?? row.feature_updated_at, new Date().toISOString()),
    modelVersion,
    age: featureNumber(row, "age"),
    reachInches: row.reach_inches ?? featureNumber(row, "reachInches"),
    heightInches: row.height_inches ?? featureNumber(row, "heightInches"),
    stance: row.stance ?? (typeof profileFeature.stance === "string" ? profileFeature.stance : typeof payload.stance === "string" ? payload.stance : null),
    weightClass: typeof ratings.weightClass === "string" ? ratings.weightClass : typeof canonical.weightClass === "string" ? canonical.weightClass : typeof payload.weightClass === "string" ? payload.weightClass : null,
    daysSinceLastFight: featureNumber(row, "daysSinceLastFight"),
    proFights: row.pro_fights ?? featureNumber(row, "proFights"),
    ufcFights: row.ufc_fights ?? featureNumber(row, "ufcFights"),
    roundsFought: row.rounds_fought ?? featureNumber(row, "roundsFought"),
    sigStrikesLandedPerMin: row.sig_strikes_landed_per_min ?? featureNumber(row, "sigStrikesLandedPerMin"),
    sigStrikesAbsorbedPerMin: row.sig_strikes_absorbed_per_min ?? featureNumber(row, "sigStrikesAbsorbedPerMin"),
    strikingDifferential: row.striking_differential ?? featureNumber(row, "strikingDifferential"),
    sigStrikeAccuracyPct: featureNumber(row, "sigStrikeAccuracyPct"),
    sigStrikeDefensePct: featureNumber(row, "sigStrikeDefensePct"),
    knockdownsPer15: featureNumber(row, "knockdownsPer15"),
    takedownsPer15: row.takedowns_per_15 ?? featureNumber(row, "takedownsPer15"),
    takedownAccuracyPct: row.takedown_accuracy_pct ?? featureNumber(row, "takedownAccuracyPct"),
    takedownDefensePct: row.takedown_defense_pct ?? featureNumber(row, "takedownDefensePct"),
    submissionAttemptsPer15: row.submission_attempts_per_15 ?? featureNumber(row, "submissionAttemptsPer15"),
    submissionDefensePct: featureNumber(row, "submissionDefensePct"),
    controlTimePct: row.control_time_pct ?? featureNumber(row, "controlTimePct"),
    controlEscapePct: featureNumber(row, "controlEscapePct"),
    getUpRate: featureNumber(row, "getUpRate"),
    reversalsPer15: featureNumber(row, "reversalsPer15"),
    sweepRate: featureNumber(row, "sweepRate"),
    legKicksLandedPer15: featureNumber(row, "legKicksLandedPer15"),
    bodyKicksLandedPer15: featureNumber(row, "bodyKicksLandedPer15"),
    headKicksLandedPer15: featureNumber(row, "headKicksLandedPer15"),
    kickingAccuracyPct: featureNumber(row, "kickingAccuracyPct"),
    kickingDefensePct: featureNumber(row, "kickingDefensePct"),
    clinchStrikingScore: featureNumber(row, "clinchStrikingScore"),
    pressureScore: featureNumber(row, "pressureScore"),
    distanceManagementScore: featureNumber(row, "distanceManagementScore"),
    recentFormScore: featureNumber(row, "recentFormScore"),
    finishRate: featureNumber(row, "finishRate"),
    lateRoundPerformance: featureNumber(row, "lateRoundPerformance"),
    heartScore: featureNumber(row, "heartScore"),
    staminaScore: featureNumber(row, "staminaScore"),
    paceScore: featureNumber(row, "paceScore"),
    chinScore: featureNumber(row, "chinScore"),
    recoveryScore: featureNumber(row, "recoveryScore"),
    fightIqScore: featureNumber(row, "fightIqScore"),
    gamePlanScore: featureNumber(row, "gamePlanScore"),
    shortNoticePenalty: featureNumber(row, "shortNoticePenalty"),
    injuryLayoffRisk: featureNumber(row, "injuryLayoffRisk"),
    opponentAdjustedStrength: row.opponent_adjusted_strength ?? featureNumber(row, "opponentAdjustedStrength"),
    coldStartActive: Boolean(row.cold_start_active),
    feature
  };
}

function profileIntelligence(row: TendencyRow) {
  const payload = asRecord(row.payload_json);
  const feature = asRecord(row.feature_json);
  return asRecord(feature.profileIntelligence).readiness || asRecord(payload.profileIntelligence).readiness ? { ...asRecord(payload.profileIntelligence), ...asRecord(feature.profileIntelligence) } : null;
}

function completeProfile(row: TendencyRow) {
  const payload = asRecord(row.payload_json);
  const feature = asRecord(row.feature_json);
  return Object.keys(asRecord(feature.completeProfile)).length ? asRecord(feature.completeProfile) : Object.keys(asRecord(payload.completeProfile)).length ? asRecord(payload.completeProfile) : null;
}

function archetypeFromPrior(value: unknown): UfcStyleArchetype | null {
  const text = String(value ?? "").toLowerCase();
  if (!text) return null;
  if (text.includes("counter")) return "Power Counterstriker";
  if (text.includes("kickbox") || text.includes("muay")) return "Volume Kickboxer";
  if (text.includes("wrestl")) return "Chain Wrestler";
  if (text.includes("control")) return "Control Grappler";
  if (text.includes("submission")) return "Submission Hunter";
  if (text.includes("box")) return "Pressure Boxer";
  return null;
}

function conditionFromText(value: string): UfcFighterStyleGenome["tacticalRules"]["preferredWinConditions"][number] | null {
  const text = value.toLowerCase();
  if (text.includes("ko") || text.includes("tko") || text.includes("counter")) return "KO_TKO";
  if (text.includes("submission") || text.includes("sub")) return "SUBMISSION";
  if (text.includes("control") || text.includes("wrestl")) return "DECISION_CONTROL";
  if (text.includes("volume") || text.includes("decision")) return "DECISION_VOLUME";
  return null;
}

function applyNamedTendencyPriors(genome: UfcFighterStyleGenome, snapshot: UfcModelFeatureSnapshot, payloadRecord: Record<string, unknown>) {
  const priors = findUfcCredentialPriors({ feature: snapshot, payloadRecord });
  const named = priors
    .map((prior) => ({ prior, tendencyPrior: asRecord(prior.metadata?.tendencyPrior) }))
    .filter((item) => Object.keys(item.tendencyPrior).length > 0);
  if (!named.length) return { genome, sourceSuffix: "", priorIds: [] as string[] };

  let next: UfcFighterStyleGenome = { ...genome, tendencies: { ...genome.tendencies }, tacticalRules: { ...genome.tacticalRules, simModifiers: { ...genome.tacticalRules.simModifiers } }, evidence: { ...genome.evidence, statsUsed: [...genome.evidence.statsUsed], missingSignals: [...genome.evidence.missingSignals] }, archetype: { ...genome.archetype, secondary: [...genome.archetype.secondary] } };
  const priorIds: string[] = [];
  for (const item of named) {
    priorIds.push(item.prior.id);
    for (const key of Object.keys(next.tendencies) as Array<keyof UfcFighterStyleGenome["tendencies"]>) {
      const value = asNumber(item.tendencyPrior[key]);
      if (value != null) next.tendencies[key] = value;
    }
    const primary = archetypeFromPrior(item.tendencyPrior.archetype ?? item.prior.metadata?.styleOverride);
    if (primary) {
      const secondary = ["Low Output Technician", "Wild Finisher", "Pressure Boxer"].filter((value): value is UfcStyleArchetype => value !== primary);
      next.archetype = { primary, secondary: [...new Set([...secondary, ...next.archetype.secondary])].slice(0, 3), confidence: Math.max(next.archetype.confidence, 0.91) };
    }
    const conditions = asStringArray(item.tendencyPrior.preferredWinConditions).map(conditionFromText).filter((value): value is NonNullable<ReturnType<typeof conditionFromText>> => Boolean(value));
    if (conditions.length) next.tacticalRules.preferredWinConditions = [...new Set([...conditions, ...next.tacticalRules.preferredWinConditions])];
    const dangerZones = asStringArray(item.tendencyPrior.dangerZones);
    if (dangerZones.length) next.tacticalRules.dangerZones = [...new Set([...dangerZones, ...next.tacticalRules.dangerZones])];
    const opponentTriggers = asStringArray(item.tendencyPrior.opponentTriggers);
    if (opponentTriggers.length) next.tacticalRules.opponentTriggers = [...new Set([...opponentTriggers, ...next.tacticalRules.opponentTriggers])];
  }
  next.tacticalRules.simModifiers = {
    ...next.tacticalRules.simModifiers,
    namedPriorBoost: 0.2,
    counterStrikeVolatility: Math.max(next.tacticalRules.simModifiers.koVolatility ?? 0, 0.38),
    lateFade: Math.max(next.tacticalRules.simModifiers.lateFade ?? 0, (next.tendencies.paceCrashRisk - 50) / 120)
  };
  next.evidence = {
    sourceQuality: "A",
    statsUsed: [...new Set([...next.evidence.statsUsed, ...priorIds.map((id) => `named tendency prior:${id}`)])],
    missingSignals: next.evidence.missingSignals.filter((signal) => signal !== "profile intelligence"),
    fallbackUsed: false
  };
  return { genome: next, sourceSuffix: "+named-tendency-prior", priorIds };
}

function tendencyPayload(genome: UfcFighterStyleGenome, source: string, priorIds: string[] = []) {
  return {
    fighterTendencies: {
      version: "ufc-fighter-tendencies-v1",
      generatedAt: genome.generatedAt,
      source,
      namedPriorIds: priorIds,
      archetype: genome.archetype,
      tendencies: genome.tendencies,
      tacticalRules: genome.tacticalRules,
      evidence: genome.evidence
    },
    styleGenome: genome,
    tendencyProfile: {
      source,
      generatedAt: genome.generatedAt,
      archetype: genome.archetype.primary,
      confidence: genome.archetype.confidence,
      sourceQuality: genome.evidence.sourceQuality,
      fallbackUsed: genome.evidence.fallbackUsed,
      missingSignals: genome.evidence.missingSignals,
      namedPriorIds: priorIds
    }
  };
}

async function queryRows(modelVersion: string, limit: number, onlyMissing: boolean) {
  return prisma.$queryRaw<TendencyRow[]>`
    WITH latest_features AS (
      SELECT DISTINCT ON (mf.fighter_id)
        mf.fighter_id,
        mf.fight_id,
        mf.fight_date,
        mf.model_version,
        mf.opponent_fighter_id,
        mf.snapshot_at,
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
    )
    SELECT
      f.id AS fighter_id,
      f.full_name,
      f.nickname,
      f.stance,
      f.height_inches,
      f.reach_inches,
      f.payload_json,
      lf.fight_id,
      lf.fight_date,
      lf.model_version,
      lf.opponent_fighter_id,
      lf.snapshot_at,
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
    WHERE (${onlyMissing} = false OR NOT (COALESCE(f.payload_json, '{}'::jsonb) ? 'fighterTendencies'))
    ORDER BY CASE WHEN lf.feature_json IS NULL THEN 1 ELSE 0 END, COALESCE(lf.updated_at, f.updated_at) DESC NULLS LAST, f.full_name ASC
    LIMIT ${Math.max(1, Math.min(5000, limit))}
  `;
}

function inc(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

async function updateTendencies(row: TendencyRow, genome: UfcFighterStyleGenome, source: string, modelVersion: string, priorIds: string[] = []) {
  const payload = tendencyPayload(genome, source, priorIds);
  await prisma.$executeRaw`
    UPDATE ufc_fighters
    SET payload_json = COALESCE(payload_json, '{}'::jsonb) || ${JSON.stringify(payload)}::jsonb,
        updated_at = now()
    WHERE id = ${row.fighter_id}
  `;
  if (row.fight_id) {
    await prisma.$executeRaw`
      UPDATE ufc_model_features
      SET feature_json = COALESCE(feature_json, '{}'::jsonb) || ${JSON.stringify(payload)}::jsonb,
          updated_at = now()
      WHERE fight_id = ${row.fight_id}
        AND fighter_id = ${row.fighter_id}
        AND model_version = ${modelVersion}
    `;
  }
}

export async function fillUfcFighterTendencies(options: { modelVersion?: string; limit?: number; dryRun?: boolean; onlyMissing?: boolean } = {}): Promise<UfcFighterTendencyFillResult> {
  const modelVersion = options.modelVersion ?? "ufc-fight-iq-v1";
  const limit = Math.max(1, Math.min(5000, Math.round(options.limit ?? 500)));
  const dryRun = Boolean(options.dryRun);
  const onlyMissing = options.onlyMissing !== false;
  if (!hasUsableServerDatabaseUrl()) {
    return { ok: false, dryRun, modelVersion, scanned: 0, filled: 0, blocked: 0, sourceCounts: {}, archetypeCounts: {}, qualityCounts: {}, items: [], errors: ["No usable server database URL configured."] };
  }

  const rows = await queryRows(modelVersion, limit, onlyMissing);
  const sourceCounts: Record<string, number> = {};
  const archetypeCounts: Record<string, number> = {};
  const qualityCounts: Record<string, number> = {};
  const items: UfcFighterTendencyFillResult["items"] = [];
  const errors: string[] = [];
  let filled = 0;
  let blocked = 0;

  for (const row of rows) {
    try {
      const snapshot = buildSnapshot(row, modelVersion);
      const skillProfile = buildUfcFighterSkillProfile({ feature: snapshot });
      const intelligence = profileIntelligence(row);
      const complete = completeProfile(row);
      const baseGenome = buildUfcFighterStyleGenome({ fighterId: row.fighter_id, skillProfile, profileIntelligence: intelligence, completeProfile: complete, feature: snapshot });
      const priorApplied = applyNamedTendencyPriors(baseGenome, snapshot, asRecord(row.payload_json));
      const genome = priorApplied.genome;
      const blockedByData = skillProfile.profileCompleteness?.isGenericAvatar === true || skillProfile.profileCompleteness?.score === 0;
      const baseSource = complete ? "complete-profile-style-genome" : row.feature_json ? "feature-derived-style-genome" : "payload-derived-style-genome";
      const source = `${baseSource}${priorApplied.sourceSuffix}`;
      if (!dryRun) await updateTendencies(row, genome, source, modelVersion, priorApplied.priorIds);
      filled += 1;
      if (blockedByData) blocked += 1;
      inc(sourceCounts, source);
      inc(archetypeCounts, genome.archetype.primary);
      inc(qualityCounts, genome.evidence.sourceQuality);
      items.push({
        fighterId: row.fighter_id,
        fighterName: row.full_name,
        archetype: genome.archetype.primary,
        confidence: genome.archetype.confidence,
        sourceQuality: genome.evidence.sourceQuality,
        fallbackUsed: genome.evidence.fallbackUsed,
        blocked: blockedByData,
        missingSignals: genome.evidence.missingSignals
      });
    } catch (error) {
      errors.push(`${row.full_name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { ok: errors.length === 0, dryRun, modelVersion, scanned: rows.length, filled, blocked, sourceCounts, archetypeCounts, qualityCounts, items: items.slice(0, 100), errors: errors.slice(0, 50) };
}
