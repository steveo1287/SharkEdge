import crypto from "node:crypto";

import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

const DEFAULT_MODEL_VERSION = "ufc-fight-iq-v1";

type FightProfileRow = {
  fight_id: string;
  fight_date: Date | string;
  event_label: string;
  weight_class: string | null;
  fighter_a_id: string;
  fighter_b_id: string;
  fighter_a_name: string | null;
  fighter_b_name: string | null;
  fighter_a_payload: unknown;
  fighter_b_payload: unknown;
};

type CompleteProfile = {
  fighterId?: string;
  fullName?: string;
  modelVersion?: string;
  confidence?: number;
  dataQuality?: string;
  sourceSummary?: Record<string, number>;
  audit?: { estimatedFields?: string[] };
  sample?: Record<string, { value?: number }>;
  physical?: Record<string, { value?: number } | string>;
  careerStats?: Record<string, { value?: number }>;
  ratings?: Record<string, Record<string, { value?: number }>>;
};

function stableId(prefix: string, value: string) {
  return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/%/g, "").replace(/[^0-9.+-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function statValue(profile: CompleteProfile, key: string, fallback: number) {
  const value = numberValue(profile.careerStats?.[key]?.value);
  return value ?? fallback;
}

function sampleValue(profile: CompleteProfile, key: string, fallback: number) {
  const value = numberValue(profile.sample?.[key]?.value);
  return value ?? fallback;
}

function ratingValue(profile: CompleteProfile, group: string, key: string, fallback: number) {
  const value = numberValue(profile.ratings?.[group]?.[key]?.value);
  return value ?? fallback;
}

function physicalValue(profile: CompleteProfile, key: string, fallback: number | null) {
  const physical = asRecord(profile.physical?.[key]);
  const value = numberValue(physical.value ?? profile.physical?.[key]);
  return value ?? fallback;
}

function getCompleteProfile(payload: unknown): CompleteProfile | null {
  const root = asRecord(payload);
  const profile = asRecord(root.completeProfile);
  return profile && profile.noMissingData === true ? profile as CompleteProfile : null;
}

function getProfileIntelligence(payload: unknown) {
  const root = asRecord(payload);
  const intelligence = asRecord(root.profileIntelligence);
  return Object.keys(intelligence).length ? intelligence : null;
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function featureJson(profile: CompleteProfile, intelligence: Record<string, unknown> | null, row: FightProfileRow, fighterId: string, opponentId: string) {
  return {
    source: "complete-profile-feature-sync",
    noMissingData: true,
    completeProfileVersion: profile.modelVersion ?? "ufc-complete-fighter-profile-v1",
    dataQuality: profile.dataQuality ?? "C",
    confidence: numberValue(profile.confidence) ?? 0.5,
    sourceSummary: profile.sourceSummary ?? null,
    estimatedFields: profile.audit?.estimatedFields ?? [],
    profileIntelligence: intelligence,
    profileIntelligenceReadiness: intelligence ? asRecord(intelligence.readiness) : null,
    opponentStrength: intelligence ? asRecord(intelligence.opponentStrength) : null,
    recentForm: intelligence ? asRecord(intelligence.recentForm) : null,
    stanceStyle: intelligence ? asRecord(intelligence.stanceStyle) : null,
    contextFlags: intelligence ? asRecord(intelligence.contextFlags) : null,
    fallbackReferences: intelligence ? asRecord(intelligence.fallbackReferences) : null,
    completeProfile: profile,
    ratings: profile.ratings ?? {},
    rawFeature: {
      sigStrikeDefensePct: statValue(profile, "sigStrikeDefensePct", 55),
      takedownDefensePct: statValue(profile, "takedownDefensePct", 63),
      submissionDefensePct: statValue(profile, "submissionDefensePct", 64),
      controlEscapePct: statValue(profile, "controlEscapePct", 52),
      staminaScore: ratingValue(profile, "core", "cardio", 55),
      fightIqScore: ratingValue(profile, "core", "fightIq", 55),
      chinScore: ratingValue(profile, "core", "durability", 55),
      paceScore: ratingValue(profile, "striking", "volume", 55),
      pressureScore: ratingValue(profile, "striking", "offense", 55),
      gamePlanScore: ratingValue(profile, "core", "fightIq", 55),
      reachInches: physicalValue(profile, "reachInches", 72),
      heightInches: physicalValue(profile, "heightInches", 70),
      age: physicalValue(profile, "age", 29)
    },
    fightContext: {
      fightId: row.fight_id,
      eventLabel: row.event_label,
      weightClass: row.weight_class,
      fighterId,
      opponentId
    }
  };
}

async function upsertFeature(args: {
  row: FightProfileRow;
  profile: CompleteProfile;
  intelligence: Record<string, unknown> | null;
  fighterId: string;
  opponentId: string;
  modelVersion: string;
  dryRun: boolean;
}) {
  const fightDate = toIso(args.row.fight_date);
  const snapshotAt = new Date(Math.min(Date.now(), new Date(fightDate).getTime() - 60_000)).toISOString();
  const id = stableId("ufcmf", `${args.row.fight_id}:${args.fighterId}:complete-sync:${args.modelVersion}`);
  const slpm = statValue(args.profile, "slpm", 3.65);
  const sapm = statValue(args.profile, "sapm", 3.2);
  const payload = featureJson(args.profile, args.intelligence, args.row, args.fighterId, args.opponentId);
  if (args.dryRun) return;
  await prisma.$executeRaw`
    INSERT INTO ufc_model_features (id, fight_id, fight_date, fighter_id, opponent_fighter_id, snapshot_at, model_version, pro_fights, ufc_fights, rounds_fought, sig_strikes_landed_per_min, sig_strikes_absorbed_per_min, striking_differential, takedowns_per_15, takedown_defense_pct, submission_attempts_per_15, control_time_pct, opponent_adjusted_strength, cold_start_active, feature_json, updated_at)
    VALUES (${id}, ${args.row.fight_id}, ${fightDate}::timestamptz, ${args.fighterId}, ${args.opponentId}, ${snapshotAt}::timestamptz, ${args.modelVersion}, ${Math.round(sampleValue(args.profile, "proFights", 8))}, ${Math.round(sampleValue(args.profile, "ufcFights", 3))}, ${sampleValue(args.profile, "roundsFought", 18)}, ${slpm}, ${sapm}, ${statValue(args.profile, "strikingDifferential", slpm - sapm)}, ${statValue(args.profile, "takedownsPer15", 1.15)}, ${statValue(args.profile, "takedownDefensePct", 63)}, ${statValue(args.profile, "submissionAttemptsPer15", 0.45)}, ${statValue(args.profile, "controlTimePct", 18)}, ${ratingValue(args.profile, "core", "overall", 55)}, false, ${JSON.stringify(payload)}::jsonb, now())
    ON CONFLICT (fight_id, fighter_id, model_version)
    DO UPDATE SET
      snapshot_at = EXCLUDED.snapshot_at,
      pro_fights = EXCLUDED.pro_fights,
      ufc_fights = EXCLUDED.ufc_fights,
      rounds_fought = EXCLUDED.rounds_fought,
      sig_strikes_landed_per_min = EXCLUDED.sig_strikes_landed_per_min,
      sig_strikes_absorbed_per_min = EXCLUDED.sig_strikes_absorbed_per_min,
      striking_differential = EXCLUDED.striking_differential,
      takedowns_per_15 = EXCLUDED.takedowns_per_15,
      takedown_defense_pct = EXCLUDED.takedown_defense_pct,
      submission_attempts_per_15 = EXCLUDED.submission_attempts_per_15,
      control_time_pct = EXCLUDED.control_time_pct,
      opponent_adjusted_strength = EXCLUDED.opponent_adjusted_strength,
      cold_start_active = EXCLUDED.cold_start_active,
      feature_json = COALESCE(ufc_model_features.feature_json, '{}'::jsonb) || EXCLUDED.feature_json,
      updated_at = now()
  `;
}

export async function syncCompleteUfcProfilesToSimFeatures(options: { modelVersion?: string; horizonDays?: number; limit?: number; dryRun?: boolean } = {}) {
  if (!hasUsableServerDatabaseUrl()) return { ok: false, mode: options.dryRun ? "dry-run" : "write", error: "No usable server database URL is configured." };
  const modelVersion = options.modelVersion ?? DEFAULT_MODEL_VERSION;
  const horizonDays = Math.max(1, Math.min(365, Math.floor(options.horizonDays ?? 180)));
  const limit = Math.max(1, Math.min(500, Math.floor(options.limit ?? 100)));
  const dryRun = Boolean(options.dryRun);
  const rows = await prisma.$queryRaw<FightProfileRow[]>`
    SELECT f.id AS fight_id, f.fight_date, f.event_label, f.weight_class, f.fighter_a_id, f.fighter_b_id,
      fa.full_name AS fighter_a_name, fb.full_name AS fighter_b_name,
      fa.payload_json AS fighter_a_payload, fb.payload_json AS fighter_b_payload
    FROM ufc_fights f
    JOIN ufc_fighters fa ON fa.id = f.fighter_a_id
    JOIN ufc_fighters fb ON fb.id = f.fighter_b_id
    WHERE f.fight_date >= now() - interval '12 hours'
      AND f.fight_date <= now() + (${horizonDays}::text || ' days')::interval
      AND f.status NOT IN ('CANCELED', 'VOID')
      AND COALESCE(f.payload_json->>'matchupQuality', '') <> 'FAKE_NAVIGATION'
    ORDER BY f.fight_date ASC
    LIMIT ${limit}
  `;
  let writtenFeatures = 0;
  const missingProfiles: string[] = [];
  const missingIntelligence: string[] = [];
  const errors: string[] = [];
  for (const row of rows) {
    const a = getCompleteProfile(row.fighter_a_payload);
    const b = getCompleteProfile(row.fighter_b_payload);
    const aIntelligence = getProfileIntelligence(row.fighter_a_payload);
    const bIntelligence = getProfileIntelligence(row.fighter_b_payload);
    if (!a) missingProfiles.push(row.fighter_a_name ?? row.fighter_a_id);
    if (!b) missingProfiles.push(row.fighter_b_name ?? row.fighter_b_id);
    if (!aIntelligence) missingIntelligence.push(row.fighter_a_name ?? row.fighter_a_id);
    if (!bIntelligence) missingIntelligence.push(row.fighter_b_name ?? row.fighter_b_id);
    try {
      if (a) { await upsertFeature({ row, profile: a, intelligence: aIntelligence, fighterId: row.fighter_a_id, opponentId: row.fighter_b_id, modelVersion, dryRun }); writtenFeatures += 1; }
      if (b) { await upsertFeature({ row, profile: b, intelligence: bIntelligence, fighterId: row.fighter_b_id, opponentId: row.fighter_a_id, modelVersion, dryRun }); writtenFeatures += 1; }
    } catch (error) {
      errors.push(`${row.event_label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return {
    ok: errors.length === 0,
    mode: dryRun ? "dry-run" : "write",
    modelVersion,
    fightCount: rows.length,
    writtenFeatures,
    missingProfiles: Array.from(new Set(missingProfiles)).slice(0, 50),
    missingIntelligence: Array.from(new Set(missingIntelligence)).slice(0, 50),
    noMissingFeatureRows: missingProfiles.length === 0,
    noMissingIntelligence: missingIntelligence.length === 0,
    errors: errors.slice(0, 50)
  };
}
