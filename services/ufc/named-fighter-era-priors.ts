import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

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
    eraProfiles: Array<Record<string, unknown>>;
    tendencyPrior: Record<string, unknown>;
  };
};

export type NamedUfcPriorApplyResult = {
  ok: boolean;
  dryRun: boolean;
  scanned: number;
  applied: number;
  priorsApplied: string[];
  items: Array<{ fighterId: string; fighterName: string; priorId: string; changedKeys: string[] }>;
  errors: string[];
};

type FighterRow = {
  fighter_id: string;
  full_name: string;
  nickname: string | null;
  payload_json: unknown;
};

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

export const NAMED_UFC_FIGHTER_ERA_PRIORS: NamedUfcFighterEraPrior[] = [
  {
    id: "max-holloway-prime-volume-boxer",
    aliases: ["max-holloway", "jerome-max-keli-i-holloway", "blessed", "max-blessed-holloway"],
    confidence: "A",
    label: "Prime featherweight/lightweight Max Holloway",
    sourceUrl: "manual:fighter-era-priors/max-holloway-prime-volume-boxer",
    evidence: [
      "Prime Holloway is modeled as an elite high-volume pressure boxer with layered combinations, body-head work, and exceptional pace durability.",
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
      eraProfiles: [
        {
          id: "prime_145",
          label: "Prime featherweight Holloway",
          status: "WHAT_IF_READY",
          weightClasses: ["Featherweight"],
          strengths: ["historic striking volume", "elite cardio", "durability", "anti-wrestling survival", "late-round pace", "combination boxing"],
          weaknesses: ["limited offensive wrestling", "not a pure one-shot power profile", "can be touched in exchanges", "calf-kick/range-control vulnerability"]
        },
        {
          id: "lightweight_bmf_version",
          label: "Lightweight/BMF Holloway",
          status: "RESEARCH_ONLY",
          weightClasses: ["Lightweight"],
          adjustments: ["slightly higher power translation", "higher durability tax", "less size-control advantage than featherweight"]
        }
      ],
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
  }
];

function matchPrior(row: FighterRow, only?: string | null) {
  const tokens = [row.fighter_id, row.full_name, row.nickname, asRecord(row.payload_json).slug, asRecord(row.payload_json).fighterSlug].map((value) => slug(typeof value === "string" ? value : null)).filter(Boolean);
  return NAMED_UFC_FIGHTER_ERA_PRIORS.find((prior) => {
    if (only && prior.id !== only && !prior.aliases.includes(slug(only))) return false;
    return prior.aliases.some((alias) => tokens.includes(slug(alias)));
  }) ?? null;
}

function tendencyPayload(prior: NamedUfcFighterEraPrior) {
  const tendencyPrior = prior.metadata.tendencyPrior;
  const generatedAt = new Date().toISOString();
  const tendencies = Object.fromEntries(Object.entries(tendencyPrior).filter(([, value]) => typeof value === "number"));
  const preferredWinConditions = Array.isArray(tendencyPrior.preferredWinConditions) ? tendencyPrior.preferredWinConditions : [];
  const dangerZones = Array.isArray(tendencyPrior.dangerZones) ? tendencyPrior.dangerZones : [];
  const opponentTriggers = Array.isArray(tendencyPrior.opponentTriggers) ? tendencyPrior.opponentTriggers : [];
  return {
    namedFighterPriors: {
      [prior.id]: {
        id: prior.id,
        label: prior.label,
        confidence: prior.confidence,
        sourceUrl: prior.sourceUrl,
        evidence: prior.evidence,
        profile: prior.profile,
        metadata: prior.metadata,
        appliedAt: generatedAt
      }
    },
    fighterTendencies: {
      version: "ufc-fighter-tendencies-v1",
      generatedAt,
      source: "named-fighter-era-prior",
      namedPriorIds: [prior.id],
      archetype: { primary: String(tendencyPrior.archetype ?? prior.metadata.styleOverride), secondary: ["Pressure Boxer", "Low Output Technician"], confidence: 0.94 },
      tendencies,
      tacticalRules: {
        preferredWinConditions,
        dangerZones,
        opponentTriggers,
        simModifiers: {
          exchangeVolume: 0.48,
          attritionalPressure: 0.42,
          latePaceBoost: 0.38,
          koVolatility: 0.12,
          takedownPressure: -0.22,
          lateFade: -0.27,
          decisionVolume: 0.44
        }
      },
      evidence: { sourceQuality: "A", statsUsed: [`named fighter era prior:${prior.id}`], missingSignals: [], fallbackUsed: false }
    },
    tendencyProfile: {
      source: "named-fighter-era-prior",
      generatedAt,
      archetype: String(tendencyPrior.archetype ?? prior.metadata.styleOverride),
      confidence: 0.94,
      sourceQuality: "A",
      fallbackUsed: false,
      missingSignals: [],
      namedPriorIds: [prior.id]
    }
  };
}

function featureJsonPayload(prior: NamedUfcFighterEraPrior) {
  const generatedAt = new Date().toISOString();
  return {
    ...prior.profile,
    combatBase: prior.metadata.combatBase,
    weightClass: prior.metadata.projectedWeightClass,
    namedFighterPrior: {
      id: prior.id,
      label: prior.label,
      confidence: prior.confidence,
      sourceUrl: prior.sourceUrl,
      evidence: prior.evidence,
      metadata: prior.metadata,
      appliedAt: generatedAt
    },
    eliteCombatCredentialPrior: {
      source: "named-fighter-era-prior",
      confidence: prior.confidence,
      sourceUrl: prior.sourceUrl,
      appliedPriors: [{ id: prior.id, confidence: prior.confidence, sourceUrl: prior.sourceUrl, appliedWeight: 1, changedKeys: Object.keys(prior.profile), evidence: prior.evidence, metadata: prior.metadata }],
      evidence: prior.evidence
    }
  };
}

async function queryRows(limit: number, only?: string | null) {
  const q = slug(only ?? "");
  return prisma.$queryRaw<FighterRow[]>`
    SELECT id AS fighter_id, full_name, nickname, payload_json
    FROM ufc_fighters
    WHERE ${q}::text = ''
      OR lower(regexp_replace(full_name, '[^a-zA-Z0-9]+', '-', 'g')) = ${q}
      OR lower(regexp_replace(COALESCE(nickname, ''), '[^a-zA-Z0-9]+', '-', 'g')) = ${q}
      OR id = ${q}
    ORDER BY full_name ASC
    LIMIT ${Math.max(1, Math.min(5000, limit))}
  `;
}

async function applyPrior(row: FighterRow, prior: NamedUfcFighterEraPrior, modelVersion: string) {
  const payload = { ...tendencyPayload(prior), canonicalEraPriors: { [prior.id]: { id: prior.id, label: prior.label, profile: prior.profile, metadata: prior.metadata, evidence: prior.evidence, appliedAt: new Date().toISOString() } } };
  const featureJson = featureJsonPayload(prior);
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

export async function applyNamedUfcFighterEraPriors(options: { modelVersion?: string; limit?: number; dryRun?: boolean; only?: string | null } = {}): Promise<NamedUfcPriorApplyResult> {
  const modelVersion = options.modelVersion ?? "ufc-fight-iq-v1";
  const limit = Math.max(1, Math.min(5000, Math.round(options.limit ?? 500)));
  const dryRun = options.dryRun !== false;
  if (!hasUsableServerDatabaseUrl()) return { ok: false, dryRun, scanned: 0, applied: 0, priorsApplied: [], items: [], errors: ["No usable server database URL configured."] };
  const rows = await queryRows(limit, options.only);
  const items: NamedUfcPriorApplyResult["items"] = [];
  const priorsApplied = new Set<string>();
  const errors: string[] = [];
  for (const row of rows) {
    const prior = matchPrior(row, options.only);
    if (!prior) continue;
    try {
      const changedKeys = dryRun ? Object.keys(prior.profile) : await applyPrior(row, prior, modelVersion);
      priorsApplied.add(prior.id);
      items.push({ fighterId: row.fighter_id, fighterName: row.full_name, priorId: prior.id, changedKeys });
    } catch (error) {
      errors.push(`${row.full_name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { ok: errors.length === 0, dryRun, scanned: rows.length, applied: items.length, priorsApplied: [...priorsApplied], items, errors };
}
