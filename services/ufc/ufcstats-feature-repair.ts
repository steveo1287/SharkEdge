import crypto from "node:crypto";

import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

type FightRow = {
  fight_id: string;
  fight_date: Date | string;
  weight_class: string | null;
  scheduled_rounds: number;
  fighter_a_id: string;
  fighter_b_id: string;
  fighter_a_name: string;
  fighter_b_name: string;
  fighter_a_payload: unknown;
  fighter_b_payload: unknown;
};

type JsonRecord = Record<string, unknown>;

const DEFAULT_MODEL_VERSION = "ufc-fight-iq-v1";

function stableId(prefix: string, value: string) {
  return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function num(value: unknown, fallback: number | null = null) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/%$/, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function round(value: number | null | undefined, digits = 4) {
  return value == null || !Number.isFinite(value) ? null : Number(value.toFixed(digits));
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function stat(payload: JsonRecord, key: string, fallback: number | null = null) {
  const stats = asRecord(payload.stats);
  const profile = asRecord(payload.profile);
  const elite = asRecord(payload.eliteProfile);
  const career = asRecord(elite.careerStats);
  const direct = num(stats[key], null) ?? num(career[key], null) ?? num(payload[key], null) ?? num(profile[key], null);
  return direct ?? fallback;
}

function text(payload: JsonRecord, key: string, fallback: string | null = null) {
  const profile = asRecord(payload.profile);
  const direct = payload[key] ?? profile[key];
  return typeof direct === "string" && direct.trim() ? direct.trim() : fallback;
}

function buildFeature(args: {
  fight: FightRow;
  fighterId: string;
  fighterName: string;
  opponentId: string;
  opponentName: string;
  payload: JsonRecord;
  modelVersion: string;
}) {
  const wins = stat(args.payload, "recordWins", null);
  const losses = stat(args.payload, "recordLosses", null);
  const draws = stat(args.payload, "recordDraws", 0) ?? 0;
  const proFights = stat(args.payload, "proFights", wins != null && losses != null ? wins + losses + draws : null);
  const ufcFights = stat(args.payload, "ufcFights", proFights);
  const slpm = stat(args.payload, "sigStrikesLandedPerMin", null);
  const sapm = stat(args.payload, "sigStrikesAbsorbedPerMin", null);
  const strikeDiff = stat(args.payload, "strikingDifferential", slpm != null && sapm != null ? slpm - sapm : null);
  const strikeAcc = stat(args.payload, "sigStrikeAccuracyPct", null);
  const strikeDef = stat(args.payload, "sigStrikeDefensePct", null);
  const tdPer15 = stat(args.payload, "takedownsPer15", null);
  const tdAcc = stat(args.payload, "takedownAccuracyPct", null);
  const tdDef = stat(args.payload, "takedownDefensePct", null);
  const subPer15 = stat(args.payload, "submissionAttemptsPer15", null);
  const winPct = proFights && wins != null ? wins / Math.max(1, proFights) : 0.5;
  const estimatedRounds = proFights != null ? Math.max(1, Number((proFights * 2.25).toFixed(1))) : null;
  const opponentAdjustedStrength = clamp(50 + (winPct - 0.5) * 28 + Math.min(proFights ?? 0, 20) * 0.22);
  const controlTimePct = clamp((tdPer15 ?? 0) * 5 + (subPer15 ?? 0) * 2 + 12, 6, 45);
  const submissionDefensePct = clamp(58 + (tdDef ?? 62) * 0.18 - (subPer15 ?? 0) * 1.2, 45, 86);
  const controlEscapePct = clamp(48 + (tdDef ?? 62) * 0.32, 35, 86);
  const staminaScore = clamp(52 + Math.min(proFights ?? 0, 18) * 1.1 + (strikeDef ?? 54) * 0.12);
  const paceScore = clamp(45 + (slpm ?? 3.1) * 7 + (tdPer15 ?? 1.1) * 4);
  const chinScore = clamp(50 + (strikeDef ?? 54) * 0.32 - (sapm ?? 3.1) * 3);
  const fightIqScore = clamp(48 + Math.min(proFights ?? 0, 20) * 1.1 + (tdDef ?? 62) * 0.08 + (strikeDef ?? 54) * 0.08);
  const heartScore = clamp(50 + winPct * 15 + staminaScore * 0.12);
  const recoveryScore = clamp(heartScore * 0.36 + staminaScore * 0.34 + chinScore * 0.3);
  const recentFormScore = clamp(48 + (winPct - 0.5) * 25 + Math.min(proFights ?? 0, 12) * 0.6);
  const finishRate = stat(args.payload, "finishRate", 0.45);
  const fightDate = iso(args.fight.fight_date);
  const heightInches = stat(args.payload, "heightInches", null);
  const reachInches = stat(args.payload, "reachInches", null);
  const stance = text(args.payload, "stance", null);

  return {
    id: stableId("ufcmf", `${args.fight.fight_id}:${args.fighterId}:${args.modelVersion}:ufcstats-repair`),
    fightId: args.fight.fight_id,
    fightDate,
    fighterId: args.fighterId,
    opponentFighterId: args.opponentId,
    modelVersion: args.modelVersion,
    proFights: proFights == null ? null : Math.round(proFights),
    ufcFights: ufcFights == null ? null : Math.round(ufcFights),
    roundsFought: estimatedRounds,
    sigStrikesLandedPerMin: round(slpm),
    sigStrikesAbsorbedPerMin: round(sapm),
    strikingDifferential: round(strikeDiff),
    takedownsPer15: round(tdPer15),
    takedownDefensePct: round(tdDef),
    submissionAttemptsPer15: round(subPer15),
    controlTimePct: round(controlTimePct),
    opponentAdjustedStrength: round(opponentAdjustedStrength),
    coldStartActive: (ufcFights ?? 0) < 3 || (proFights ?? 0) < 8,
    feature: {
      source: "ufcstats-feature-repair",
      hydrationQuality: "ufcstats-profile-derived",
      fighterName: args.fighterName,
      opponentName: args.opponentName,
      weightClass: args.fight.weight_class,
      scheduledRounds: args.fight.scheduled_rounds,
      estimatedRoundsFought: true,
      rawRoundStatsInserted: false,
      heightInches,
      reachInches,
      stance,
      sigStrikeAccuracyPct: round(strikeAcc),
      sigStrikeDefensePct: round(strikeDef),
      knockdownsPer15: stat(args.payload, "knockdownsPer15", 0.22),
      takedownAccuracyPct: round(tdAcc),
      submissionDefensePct: round(submissionDefensePct),
      controlEscapePct: round(controlEscapePct),
      getUpRate: round(controlEscapePct),
      reversalsPer15: 0.15,
      sweepRate: 0.12,
      legKicksLandedPer15: 5.2,
      bodyKicksLandedPer15: 2.4,
      headKicksLandedPer15: 0.45,
      kickingAccuracyPct: 42,
      kickingDefensePct: 55,
      clinchStrikingScore: round(50 + controlTimePct * 0.25),
      pressureScore: round(clamp(50 + (slpm ?? 3.1) * 4 + Math.max(0, strikeDiff ?? 0) * 5)),
      distanceManagementScore: round(clamp(50 + (strikeDef ?? 54) * 0.45 + (strikeDiff ?? 0) * 6 - 24)),
      recentFormScore: round(recentFormScore),
      finishRate: round(finishRate),
      lateRoundPerformance: round(clamp(52 + staminaScore * 0.35 + controlTimePct * 0.2)),
      heartScore: round(heartScore),
      staminaScore: round(staminaScore),
      paceScore: round(paceScore),
      chinScore: round(chinScore),
      recoveryScore: round(recoveryScore),
      fightIqScore: round(fightIqScore),
      gamePlanScore: round(fightIqScore),
      shortNoticePenalty: 0,
      injuryLayoffRisk: 0,
      amateurSignal: 50,
      promotionTierSignal: 50,
      rawPayload: args.payload
    }
  };
}

async function upcomingFights(limit: number, horizonDays: number) {
  return prisma.$queryRaw<FightRow[]>`
    SELECT f.id AS fight_id, f.fight_date, f.weight_class, f.scheduled_rounds,
      f.fighter_a_id, f.fighter_b_id,
      fa.full_name AS fighter_a_name, fb.full_name AS fighter_b_name,
      fa.payload_json AS fighter_a_payload, fb.payload_json AS fighter_b_payload
    FROM ufc_fights f
    JOIN ufc_fighters fa ON fa.id = f.fighter_a_id
    JOIN ufc_fighters fb ON fb.id = f.fighter_b_id
    WHERE f.fight_date >= now() - interval '3 days'
      AND f.fight_date <= now() + (${horizonDays}::text || ' days')::interval
      AND f.status NOT IN ('CANCELED', 'VOID')
      AND COALESCE(f.payload_json->>'matchupQuality', '') <> 'FAKE_NAVIGATION'
      AND (fa.payload_json ? 'stats' OR fb.payload_json ? 'stats')
    ORDER BY f.fight_date ASC
    LIMIT ${Math.max(1, Math.min(200, limit))};
  `;
}

async function writeFeature(feature: ReturnType<typeof buildFeature>, dryRun: boolean) {
  if (dryRun) return;
  await prisma.$executeRaw`
    INSERT INTO ufc_model_features (id, fight_id, fight_date, fighter_id, opponent_fighter_id, snapshot_at, model_version, pro_fights, ufc_fights, rounds_fought, sig_strikes_landed_per_min, sig_strikes_absorbed_per_min, striking_differential, takedowns_per_15, takedown_defense_pct, submission_attempts_per_15, control_time_pct, opponent_adjusted_strength, cold_start_active, feature_json, updated_at)
    VALUES (${feature.id}, ${feature.fightId}, ${feature.fightDate}::timestamptz, ${feature.fighterId}, ${feature.opponentFighterId}, LEAST(now(), ${feature.fightDate}::timestamptz - interval '1 minute'), ${feature.modelVersion}, ${feature.proFights}, ${feature.ufcFights}, ${feature.roundsFought}, ${feature.sigStrikesLandedPerMin}, ${feature.sigStrikesAbsorbedPerMin}, ${feature.strikingDifferential}, ${feature.takedownsPer15}, ${feature.takedownDefensePct}, ${feature.submissionAttemptsPer15}, ${feature.controlTimePct}, ${feature.opponentAdjustedStrength}, ${feature.coldStartActive}, ${JSON.stringify(feature.feature)}::jsonb, now())
    ON CONFLICT (fight_id, fighter_id, model_version) DO UPDATE SET
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
      feature_json = EXCLUDED.feature_json,
      updated_at = now();
  `;
}

export async function repairUfcModelFeaturesFromUfcStats(options: { limit?: number; horizonDays?: number; modelVersion?: string; dryRun?: boolean } = {}) {
  if (!hasUsableServerDatabaseUrl()) return { ok: false, error: "No usable server database URL is configured.", fights: 0, features: 0 };
  const limit = Math.max(1, Math.min(200, Math.floor(options.limit ?? 100)));
  const horizonDays = Math.max(1, Math.min(365, Math.floor(options.horizonDays ?? 180)));
  const modelVersion = options.modelVersion ?? DEFAULT_MODEL_VERSION;
  const dryRun = Boolean(options.dryRun);
  const fights = await upcomingFights(limit, horizonDays);
  const features = fights.flatMap((fight) => [
    buildFeature({ fight, fighterId: fight.fighter_a_id, fighterName: fight.fighter_a_name, opponentId: fight.fighter_b_id, opponentName: fight.fighter_b_name, payload: asRecord(fight.fighter_a_payload), modelVersion }),
    buildFeature({ fight, fighterId: fight.fighter_b_id, fighterName: fight.fighter_b_name, opponentId: fight.fighter_a_id, opponentName: fight.fighter_a_name, payload: asRecord(fight.fighter_b_payload), modelVersion })
  ]);
  let writtenFeatures = 0;
  const errors: string[] = [];
  for (const feature of features) {
    try {
      await writeFeature(feature, dryRun);
      writtenFeatures += 1;
    } catch (error) {
      errors.push(`${feature.fightId}:${feature.fighterId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return {
    ok: errors.length === 0,
    mode: dryRun ? "dry-run" : "repair",
    source: "ufcstats-feature-repair",
    modelVersion,
    fights: fights.length,
    features: features.length,
    writtenFeatures,
    errors: errors.slice(0, 50),
    examples: features.slice(0, 10).map((feature) => ({ fightId: feature.fightId, fighterId: feature.fighterId, fighterName: feature.feature.fighterName, proFights: feature.proFights, slpm: feature.sigStrikesLandedPerMin, tdDef: feature.takedownDefensePct, source: feature.feature.source }))
  };
}
