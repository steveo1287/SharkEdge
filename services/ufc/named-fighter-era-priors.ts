import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { ACTIVE_UFC_NAMED_FIGHTER_PRIOR_BATCH_1 } from "@/services/ufc/active-named-fighter-prior-batch1";
import { ACTIVE_UFC_NAMED_FIGHTER_PRIOR_BATCH_1B } from "@/services/ufc/active-named-fighter-prior-batch1b";

export type NamedUfcFighterEraPrior = {
  id: string;
  aliases: string[];
  confidence: "A" | "B" | "C";
  label: string;
  sourceUrl: string;
  evidence: string[];
  profile: Record<string, number>;
  metadata: {
    combatBase: string;
    projectedWeightClass: string;
    styleOverride: string;
    activeUfcOnly?: boolean;
    eraProfiles: Array<Record<string, unknown>>;
    tendencyPrior: Record<string, unknown>;
  };
};

export type NamedUfcPriorApplyResult = {
  ok: boolean;
  dryRun: boolean;
  activeOnly: boolean;
  scanned: number;
  matched: number;
  applied: number;
  skippedInactive: number;
  priorsApplied: string[];
  items: Array<{ fighterId: string; fighterName: string; priorId: string; changedKeys: string[]; activeSignals: string[] }>;
  skipped: Array<{ fighterId: string; fighterName: string; priorId: string; reason: string; activeSignals: string[] }>;
  errors: string[];
};

type FighterRow = {
  fighter_id: string;
  full_name: string;
  nickname: string | null;
  payload_json: unknown;
  has_upcoming_ufc_fight: boolean | null;
  has_recent_ufc_fight: boolean | null;
  recent_ufc_fight_date: Date | string | null;
  ufc_activity_count: number | null;
};

const ACTIVE_RECENT_MONTHS = 24;

const DB_KEY_MAP: Record<string, string> = {
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

function slug(value: string | null | undefined) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function boolish(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["true", "yes", "active", "current", "1"].includes(value.toLowerCase());
  return false;
}

function activeSignals(row: FighterRow) {
  const payload = asRecord(row.payload_json);
  const canonical = asRecord(payload.canonicalProfile);
  const roster = asRecord(payload.roster);
  const contract = asRecord(payload.contract);
  const signals: string[] = [];
  if (row.has_upcoming_ufc_fight) signals.push("upcoming_ufc_fight");
  if (row.has_recent_ufc_fight) signals.push(`recent_ufc_fight_${ACTIVE_RECENT_MONTHS}mo`);
  if (row.recent_ufc_fight_date) signals.push(`last_ufc_fight:${new Date(row.recent_ufc_fight_date).toISOString().slice(0, 10)}`);
  if (boolish(payload.activeUfcFighter) || boolish(payload.active) || boolish(payload.isActive) || boolish(payload.ufcActive)) signals.push("payload_active_flag");
  if (boolish(roster.active) || boolish(roster.current) || boolish(roster.underContract)) signals.push("roster_active_flag");
  if (boolish(contract.active) || boolish(contract.underContract)) signals.push("contract_active_flag");
  if (String(canonical.status ?? "") === "WHAT_IF_READY" && (row.has_recent_ufc_fight || row.has_upcoming_ufc_fight)) signals.push("canonical_current_with_activity");
  return [...new Set(signals)];
}

function isActiveUfcFighter(row: FighterRow) {
  const signals = activeSignals(row);
  return signals.includes("upcoming_ufc_fight") || signals.some((signal) => signal.startsWith("recent_ufc_fight")) || signals.includes("payload_active_flag") || signals.includes("roster_active_flag") || signals.includes("contract_active_flag");
}

const MAX_HOLLOWAY_ACTIVE_PRIOR: NamedUfcFighterEraPrior = {
  id: "max-holloway-prime-volume-boxer",
  aliases: ["max-holloway", "jerome-max-keli-i-holloway", "blessed", "max-blessed-holloway"],
  confidence: "A",
  label: "Active UFC Max Holloway volume-boxer profile",
  sourceUrl: "manual:active-ufc-fighter-era-priors/max-holloway-volume-boxer",
  evidence: [
    "Holloway is modeled as an elite high-volume pressure boxer with layered combinations, body-head work, and exceptional pace durability.",
    "Core strengths are striking volume, cardio, durability, anti-wrestling survivability, round-to-round pressure, and decision/late-fight reliability.",
    "Known limitations are lower one-shot KO volatility than pure power punchers, limited offensive wrestling, and exposure to elite calf-kick/range-control game plans."
  ],
  profile: {
    sigStrikesLandedPerMin: 7.15,
    sigStrikesAbsorbedPerMin: 4.8,
    strikingDifferential: 2.35,
    sigStrikeAccuracyPct: 49,
    sigStrikeDefensePct: 59,
    knockdownsPer15: 0.34,
    takedownsPer15: 0.32,
    takedownAccuracyPct: 42,
    takedownDefensePct: 84,
    submissionAttemptsPer15: 0.08,
    submissionDefensePct: 75,
    controlTimePct: 10,
    controlEscapePct: 78,
    getUpRate: 82,
    reversalsPer15: 0.18,
    sweepRate: 0.12,
    legKicksLandedPer15: 6.1,
    bodyKicksLandedPer15: 3.3,
    headKicksLandedPer15: 0.55,
    kickingAccuracyPct: 45,
    kickingDefensePct: 57,
    clinchStrikingScore: 70,
    pressureScore: 91,
    distanceManagementScore: 79,
    recentFormScore: 82,
    heartScore: 94,
    staminaScore: 96,
    paceScore: 97,
    chinScore: 89,
    recoveryScore: 86,
    fightIqScore: 88,
    gamePlanScore: 86,
    opponentAdjustedStrength: 91,
    amateurSignal: 78,
    promotionTierSignal: 98
  },
  metadata: {
    combatBase: "elite_volume_boxing",
    projectedWeightClass: "Featherweight",
    styleOverride: "elite_pressure_volume_boxer",
    activeUfcOnly: true,
    eraProfiles: [{ id: "active_145_155", label: "Active UFC Holloway featherweight/lightweight version", status: "WHAT_IF_READY", activeUfcOnly: true, weightClasses: ["Featherweight", "Lightweight"] }],
    tendencyPrior: {
      archetype: "elite_pressure_volume_boxer",
      pressure: 92,
      counterStriking: 70,
      volume: 98,
      powerHunting: 59,
      legKickUsage: 55,
      bodyWork: 87,
      headKickThreat: 44,
      takedownInitiation: 22,
      chainWrestling: 18,
      clinchEngagement: 55,
      cageControl: 42,
      topControlPreference: 18,
      groundAndPound: 22,
      submissionHunting: 16,
      backTakeHunting: 12,
      getUpUrgency: 88,
      scrambleChaos: 65,
      earlyRoundUrgency: 78,
      roundThreeDurability: 96,
      championshipRoundTrust: 95,
      comebackRiskTaking: 82,
      safeLeadManagement: 84,
      paceCrashRisk: 18,
      preferredWinConditions: ["DECISION_VOLUME", "late_round_tko", "attritional_boxing_pressure"],
      dangerZones: ["low-kick attrition", "elite distance kicker", "one-shot power exchange", "wrestling-heavy control if trapped cold"],
      opponentTriggers: ["opponent low cardio", "opponent shells on fence", "opponent cannot match combination volume", "opponent backs up in straight lines"]
    }
  }
};

export const NAMED_UFC_FIGHTER_ERA_PRIORS: NamedUfcFighterEraPrior[] = [
  MAX_HOLLOWAY_ACTIVE_PRIOR,
  ...ACTIVE_UFC_NAMED_FIGHTER_PRIOR_BATCH_1,
  ...ACTIVE_UFC_NAMED_FIGHTER_PRIOR_BATCH_1B
];

function matchPrior(row: FighterRow, only?: string | null) {
  const tokens = [row.fighter_id, row.full_name, row.nickname, asRecord(row.payload_json).slug, asRecord(row.payload_json).fighterSlug].map((value) => slug(typeof value === "string" ? value : null)).filter(Boolean);
  return NAMED_UFC_FIGHTER_ERA_PRIORS.find((prior) => {
    if (only && prior.id !== only && !prior.aliases.includes(slug(only))) return false;
    return prior.aliases.some((alias) => tokens.includes(slug(alias)));
  }) ?? null;
}

function tendencyPayload(prior: NamedUfcFighterEraPrior, signals: string[]) {
  const tendencyPrior = prior.metadata.tendencyPrior;
  const generatedAt = new Date().toISOString();
  const tendencies = Object.fromEntries(Object.entries(tendencyPrior).filter(([, value]) => typeof value === "number"));
  const preferredWinConditions = Array.isArray(tendencyPrior.preferredWinConditions) ? tendencyPrior.preferredWinConditions : [];
  const dangerZones = Array.isArray(tendencyPrior.dangerZones) ? tendencyPrior.dangerZones : [];
  const opponentTriggers = Array.isArray(tendencyPrior.opponentTriggers) ? tendencyPrior.opponentTriggers : [];
  return {
    namedFighterPriors: { [prior.id]: { id: prior.id, label: prior.label, scope: "active_ufc_only", activeSignals: signals, confidence: prior.confidence, sourceUrl: prior.sourceUrl, evidence: prior.evidence, profile: prior.profile, metadata: prior.metadata, appliedAt: generatedAt } },
    fighterTendencies: {
      version: "ufc-fighter-tendencies-v1",
      generatedAt,
      source: "active-ufc-named-fighter-era-prior",
      namedPriorIds: [prior.id],
      archetype: { primary: String(tendencyPrior.archetype ?? prior.metadata.styleOverride), secondary: ["Pressure Boxer", "Low Output Technician"], confidence: 0.94 },
      tendencies,
      tacticalRules: {
        preferredWinConditions,
        dangerZones,
        opponentTriggers,
        simModifiers: { exchangeVolume: 0.48, attritionalPressure: 0.42, latePaceBoost: 0.38, koVolatility: 0.12, takedownPressure: -0.22, lateFade: -0.27, decisionVolume: 0.44 }
      },
      evidence: { sourceQuality: "A", statsUsed: [`active UFC named fighter era prior:${prior.id}`], activeSignals: signals, missingSignals: [], fallbackUsed: false }
    },
    tendencyProfile: { source: "active-ufc-named-fighter-era-prior", generatedAt, archetype: String(tendencyPrior.archetype ?? prior.metadata.styleOverride), confidence: 0.94, sourceQuality: "A", fallbackUsed: false, missingSignals: [], namedPriorIds: [prior.id], activeSignals: signals }
  };
}

function featureJsonPayload(prior: NamedUfcFighterEraPrior, signals: string[]) {
  const generatedAt = new Date().toISOString();
  return {
    ...prior.profile,
    combatBase: prior.metadata.combatBase,
    weightClass: prior.metadata.projectedWeightClass,
    namedFighterPrior: { id: prior.id, label: prior.label, scope: "active_ufc_only", activeSignals: signals, confidence: prior.confidence, sourceUrl: prior.sourceUrl, evidence: prior.evidence, metadata: prior.metadata, appliedAt: generatedAt },
    eliteCombatCredentialPrior: { source: "active-ufc-named-fighter-era-prior", confidence: prior.confidence, sourceUrl: prior.sourceUrl, appliedPriors: [{ id: prior.id, confidence: prior.confidence, sourceUrl: prior.sourceUrl, appliedWeight: 1, changedKeys: Object.keys(prior.profile), evidence: prior.evidence, metadata: prior.metadata, activeSignals: signals }], evidence: prior.evidence }
  };
}

async function queryRows(limit: number, only?: string | null) {
  const q = slug(only ?? "");
  return prisma.$queryRaw<FighterRow[]>`
    WITH participation AS (
      SELECT fighter_a_id AS fighter_id, fight_date, status FROM ufc_fights
      UNION ALL
      SELECT fighter_b_id AS fighter_id, fight_date, status FROM ufc_fights
    ), activity AS (
      SELECT
        fighter_id,
        BOOL_OR(fight_date >= now() - interval '12 hours' AND COALESCE(status, '') NOT IN ('CANCELED', 'VOID')) AS has_upcoming_ufc_fight,
        BOOL_OR(fight_date >= now() - (${ACTIVE_RECENT_MONTHS}::text || ' months')::interval AND fight_date < now() AND COALESCE(status, '') NOT IN ('CANCELED', 'VOID')) AS has_recent_ufc_fight,
        MAX(CASE WHEN fight_date < now() AND COALESCE(status, '') NOT IN ('CANCELED', 'VOID') THEN fight_date ELSE NULL END) AS recent_ufc_fight_date,
        COUNT(*)::int AS ufc_activity_count
      FROM participation
      GROUP BY fighter_id
    )
    SELECT f.id AS fighter_id, f.full_name, f.nickname, f.payload_json,
      COALESCE(a.has_upcoming_ufc_fight, false) AS has_upcoming_ufc_fight,
      COALESCE(a.has_recent_ufc_fight, false) AS has_recent_ufc_fight,
      a.recent_ufc_fight_date,
      COALESCE(a.ufc_activity_count, 0) AS ufc_activity_count
    FROM ufc_fighters f
    LEFT JOIN activity a ON a.fighter_id = f.id
    WHERE ${q}::text = ''
      OR lower(regexp_replace(f.full_name, '[^a-zA-Z0-9]+', '-', 'g')) = ${q}
      OR lower(regexp_replace(COALESCE(f.nickname, ''), '[^a-zA-Z0-9]+', '-', 'g')) = ${q}
      OR f.id = ${q}
    ORDER BY f.full_name ASC
    LIMIT ${Math.max(1, Math.min(5000, limit))}
  `;
}

async function applyPrior(row: FighterRow, prior: NamedUfcFighterEraPrior, modelVersion: string, signals: string[]) {
  const payload = { ...tendencyPayload(prior, signals), canonicalEraPriors: { [prior.id]: { id: prior.id, label: prior.label, scope: "active_ufc_only", activeSignals: signals, profile: prior.profile, metadata: prior.metadata, evidence: prior.evidence, appliedAt: new Date().toISOString() } } };
  const featureJson = featureJsonPayload(prior, signals);
  const db = Object.fromEntries(Object.entries(prior.profile).filter(([key]) => DB_KEY_MAP[key]).map(([key, value]) => [DB_KEY_MAP[key], value]));
  await prisma.$executeRaw`
    UPDATE ufc_fighters
    SET payload_json = COALESCE(payload_json, '{}'::jsonb) || ${JSON.stringify(payload)}::jsonb,
        updated_at = now()
    WHERE id = ${row.fighter_id}
  `;
  await prisma.$executeRaw`
    UPDATE ufc_model_features
    SET feature_json = COALESCE(feature_json, '{}'::jsonb) || ${JSON.stringify(featureJson)}::jsonb,
        sig_strikes_landed_per_min = COALESCE(${db.sig_strikes_landed_per_min ?? null}, sig_strikes_landed_per_min),
        sig_strikes_absorbed_per_min = COALESCE(${db.sig_strikes_absorbed_per_min ?? null}, sig_strikes_absorbed_per_min),
        striking_differential = COALESCE(${db.striking_differential ?? null}, striking_differential),
        takedowns_per_15 = COALESCE(${db.takedowns_per_15 ?? null}, takedowns_per_15),
        takedown_accuracy_pct = COALESCE(${db.takedown_accuracy_pct ?? null}, takedown_accuracy_pct),
        takedown_defense_pct = COALESCE(${db.takedown_defense_pct ?? null}, takedown_defense_pct),
        submission_attempts_per_15 = COALESCE(${db.submission_attempts_per_15 ?? null}, submission_attempts_per_15),
        control_time_pct = COALESCE(${db.control_time_pct ?? null}, control_time_pct),
        opponent_adjusted_strength = COALESCE(${db.opponent_adjusted_strength ?? null}, opponent_adjusted_strength),
        cold_start_active = false,
        updated_at = now()
    WHERE fighter_id = ${row.fighter_id}
      AND model_version = ${modelVersion}
  `;
  return Object.keys(prior.profile);
}

export async function applyNamedUfcFighterEraPriors(options: { modelVersion?: string; limit?: number; dryRun?: boolean; only?: string | null; activeOnly?: boolean } = {}): Promise<NamedUfcPriorApplyResult> {
  const modelVersion = options.modelVersion ?? "ufc-fight-iq-v1";
  const limit = Math.max(1, Math.min(5000, Math.round(options.limit ?? 500)));
  const dryRun = options.dryRun !== false;
  const activeOnly = options.activeOnly !== false;
  if (!hasUsableServerDatabaseUrl()) return { ok: false, dryRun, activeOnly, scanned: 0, matched: 0, applied: 0, skippedInactive: 0, priorsApplied: [], items: [], skipped: [], errors: ["No usable server database URL configured."] };
  const rows = await queryRows(limit, options.only);
  const items: NamedUfcPriorApplyResult["items"] = [];
  const skipped: NamedUfcPriorApplyResult["skipped"] = [];
  const priorsApplied = new Set<string>();
  const errors: string[] = [];
  let matched = 0;
  for (const row of rows) {
    const prior = matchPrior(row, options.only);
    if (!prior) continue;
    matched += 1;
    const signals = activeSignals(row);
    if (activeOnly && !isActiveUfcFighter(row)) {
      skipped.push({ fighterId: row.fighter_id, fighterName: row.full_name, priorId: prior.id, reason: "inactive_or_unproven_active_ufc_contract", activeSignals: signals });
      continue;
    }
    try {
      const changedKeys = dryRun ? Object.keys(prior.profile) : await applyPrior(row, prior, modelVersion, signals);
      priorsApplied.add(prior.id);
      items.push({ fighterId: row.fighter_id, fighterName: row.full_name, priorId: prior.id, changedKeys, activeSignals: signals });
    } catch (error) {
      errors.push(`${row.full_name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { ok: errors.length === 0, dryRun, activeOnly, scanned: rows.length, matched, applied: items.length, skippedInactive: skipped.length, priorsApplied: [...priorsApplied], items, skipped: skipped.slice(0, 100), errors };
}
