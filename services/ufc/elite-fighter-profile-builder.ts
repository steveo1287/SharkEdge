import crypto from "node:crypto";

import { prisma } from "@/lib/db/prisma";
import { buildUfcFighterSkillProfile, type UfcModelFeatureSnapshot } from "@/services/ufc/fighter-skill-profile";

const DEFAULT_MODEL_VERSION = "ufc-fight-iq-v1";
const BASELINE_RATING = 1500;

type FighterRow = {
  id: string;
  full_name: string;
  stance: string | null;
  height_inches: number | null;
  reach_inches: number | null;
  combat_base: string | null;
  payload_json: unknown;
};

type AggregateStatsRow = {
  fighter_id: string;
  fight_count: number | bigint | null;
  wins: number | bigint | null;
  losses: number | bigint | null;
  ko_tko_wins: number | bigint | null;
  submission_wins: number | bigint | null;
  decision_wins: number | bigint | null;
  ko_tko_losses: number | bigint | null;
  submission_losses: number | bigint | null;
  decision_losses: number | bigint | null;
  rounds_fought: number | null;
  seconds_fought: number | null;
  sig_landed: number | bigint | null;
  sig_attempted: number | bigint | null;
  sig_absorbed: number | bigint | null;
  opp_sig_attempted: number | bigint | null;
  opp_sig_landed: number | bigint | null;
  td_landed: number | bigint | null;
  td_attempted: number | bigint | null;
  opp_td_landed: number | bigint | null;
  opp_td_attempted: number | bigint | null;
  sub_attempts: number | bigint | null;
  opp_sub_attempts: number | bigint | null;
  control_seconds: number | bigint | null;
  opp_control_seconds: number | bigint | null;
  last_fight_date: Date | string | null;
  avg_opponent_rating: number | null;
  rating_count: number | bigint | null;
};

type AmateurRow = {
  fighter_id: string;
  amateur_count: number | bigint | null;
  amateur_wins: number | bigint | null;
  amateur_losses: number | bigint | null;
  amateur_finishes: number | bigint | null;
  avg_amateur_opponent_strength: number | null;
  best_promotion_tier: string | null;
};

type ProspectRow = {
  fighter_id: string;
  latest_combat_base: string | null;
  latest_promotion_tier: string | null;
  latest_confidence_cap: number | null;
  note_count: number | bigint | null;
  tags_json: unknown;
  payload_json: unknown;
};

type UpcomingFightRow = {
  fight_id: string;
  fight_date: Date | string;
  weight_class: string | null;
  scheduled_rounds: number;
  fighter_a_id: string;
  fighter_b_id: string;
  fighter_a_name: string | null;
  fighter_b_name: string | null;
  a_feature_count: number | bigint;
  b_feature_count: number | bigint;
};

type FighterProfile = {
  fighterId: string;
  fullName: string;
  generatedAt: string;
  modelVersion: string;
  dataQuality: "A" | "B" | "C" | "D";
  sample: {
    proFights: number;
    ufcFights: number;
    amateurFights: number;
    roundsFought: number;
    minutesFought: number;
    wins: number;
    losses: number;
  };
  careerStats: {
    slpm: number;
    sapm: number;
    strikingDifferential: number;
    sigStrikeAccuracyPct: number;
    sigStrikeDefensePct: number;
    knockdownsPer15: number;
    takedownsPer15: number;
    takedownAccuracyPct: number;
    takedownDefensePct: number;
    submissionAttemptsPer15: number;
    submissionDefensePct: number;
    controlTimePct: number;
    controlEscapePct: number;
    getUpRate: number;
    reversalsPer15: number;
    sweepRate: number;
    finishRate: number;
    koLossRate: number;
    submissionLossRate: number;
    daysSinceLastFight: number | null;
  };
  background: {
    stance: string | null;
    combatBase: string | null;
    camp: string | null;
    amateurSignal: number;
    promotionTierSignal: number;
    opponentStrengthSignal: number;
  };
  spiderSkills: ReturnType<typeof buildUfcFighterSkillProfile>;
  diagnostics: {
    profileSource: string;
    opponentAdjusted: boolean;
    historyWeighted: boolean;
    missing: string[];
  };
};

function stableId(prefix: string, value: string) {
  return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function toIso(value: Date | string | null | undefined) {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function num(value: number | bigint | null | undefined, fallback = 0) {
  if (typeof value === "bigint") return Number(value);
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function pct(numerator: number, denominator: number, fallback = 0) {
  return denominator > 0 ? round((numerator / denominator) * 100, 2) : fallback;
}

function perMinute(value: number, seconds: number, fallback = 0) {
  return seconds > 0 ? round(value / (seconds / 60), 3) : fallback;
}

function per15(value: number, seconds: number, fallback = 0) {
  return seconds > 0 ? round(value / (seconds / 900), 3) : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function skill(value: number) {
  return round(clamp(value, 0, 100), 2);
}

function ratingToStrength(rating: number | null | undefined) {
  const safe = typeof rating === "number" && Number.isFinite(rating) ? rating : BASELINE_RATING;
  return skill(50 + (safe - BASELINE_RATING) / 12);
}

function normalize(value: number, min: number, max: number) {
  return max <= min ? 50 : skill(((value - min) / (max - min)) * 100);
}

function normalizeTier(value: string | null | undefined) {
  const text = (value ?? "").toLowerCase();
  if (text.includes("ufc") || text.includes("major") || text.includes("a")) return 72;
  if (text.includes("contender") || text.includes("lfa") || text.includes("bellator") || text.includes("pfl") || text.includes("b")) return 62;
  if (text.includes("regional") || text.includes("c")) return 52;
  return 50;
}

function payloadNumber(payload: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const direct = payload[key];
    if (typeof direct === "number" && Number.isFinite(direct)) return direct;
    if (typeof direct === "string" && direct.trim()) {
      const parsed = Number(direct.replace(/%$/, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  for (const nestedKey of ["spiderSkills", "careerStats", "rawFeature", "rawPayload", "stats", "background", "camp"] as const) {
    const nested = asRecord(payload[nestedKey]);
    for (const key of keys) {
      const value = nested[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && value.trim()) {
        const parsed = Number(value.replace(/%$/, ""));
        if (Number.isFinite(parsed)) return parsed;
      }
    }
  }
  return null;
}

function payloadString(payload: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const direct = payload[key];
    if (typeof direct === "string" && direct.trim()) return direct.trim();
  }
  for (const nestedKey of ["background", "camp", "rawPayload", "rawFeature"] as const) {
    const nested = asRecord(payload[nestedKey]);
    for (const key of keys) {
      const value = nested[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return null;
}

function profileQuality(stats: AggregateStatsRow | undefined, payload: Record<string, unknown>, amateur: AmateurRow | undefined) {
  const ufc = num(stats?.fight_count);
  const amateurCount = num(amateur?.amateur_count);
  const signals = [
    ufc >= 8,
    num(stats?.seconds_fought) >= 2700,
    payloadNumber(payload, "slpm", "sigStrikesLandedPerMin") != null,
    payloadNumber(payload, "tdDefense", "takedownDefensePct") != null,
    amateurCount >= 3,
    payloadString(payload, "camp", "gym", "team") != null
  ].filter(Boolean).length;
  if (ufc >= 8 && signals >= 4) return "A" as const;
  if (ufc >= 4 && signals >= 3) return "B" as const;
  if (ufc >= 1 || signals >= 2) return "C" as const;
  return "D" as const;
}

async function loadFighters(limit: number) {
  return prisma.$queryRaw<FighterRow[]>`
    SELECT id, full_name, stance, height_inches, reach_inches, combat_base, payload_json
    FROM ufc_fighters
    ORDER BY updated_at DESC, full_name
    LIMIT ${limit}
  `;
}

async function loadAggregateStats(fighterIds: string[]) {
  if (!fighterIds.length) return new Map<string, AggregateStatsRow>();
  const rows = await prisma.$queryRaw<AggregateStatsRow[]>`
    WITH fighter_fights AS (
      SELECT
        f.id AS fight_id,
        f.fight_date,
        f.winner_fighter_id,
        f.status,
        x.fighter_id,
        CASE WHEN x.fighter_id = f.fighter_a_id THEN f.fighter_b_id ELSE f.fighter_a_id END AS opponent_fighter_id,
        CASE WHEN f.winner_fighter_id = x.fighter_id THEN 1 ELSE 0 END AS win,
        CASE WHEN f.winner_fighter_id IS NOT NULL AND f.winner_fighter_id <> x.fighter_id THEN 1 ELSE 0 END AS loss,
        lower(coalesce(f.payload_json->>'method', f.payload_json->>'resultMethod', f.payload_json->>'finishMethod', '')) AS method
      FROM ufc_fights f
      CROSS JOIN LATERAL (VALUES (f.fighter_a_id), (f.fighter_b_id)) AS x(fighter_id)
      WHERE x.fighter_id = ANY(${fighterIds}::text[])
        AND f.fight_date <= now()
    ), round_rows AS (
      SELECT
        fr.fighter_id,
        fr.fight_id,
        COALESCE(fr.seconds_fought, 300) AS seconds_fought,
        fr.sig_strikes_landed,
        fr.sig_strikes_attempted,
        fr.sig_strikes_absorbed,
        fr.takedowns_landed,
        fr.takedowns_attempted,
        fr.submission_attempts,
        fr.control_seconds,
        COALESCE(opp.sig_strikes_landed, fr.sig_strikes_absorbed, 0) AS opp_sig_landed,
        COALESCE(opp.sig_strikes_attempted, 0) AS opp_sig_attempted,
        COALESCE(opp.takedowns_landed, 0) AS opp_td_landed,
        COALESCE(opp.takedowns_attempted, 0) AS opp_td_attempted,
        COALESCE(opp.submission_attempts, 0) AS opp_sub_attempts,
        COALESCE(opp.control_seconds, 0) AS opp_control_seconds
      FROM ufc_fight_stats_rounds fr
      LEFT JOIN ufc_fight_stats_rounds opp ON opp.fight_id = fr.fight_id
        AND opp.round_number = fr.round_number
        AND opp.fighter_id = fr.opponent_fighter_id
      WHERE fr.fighter_id = ANY(${fighterIds}::text[])
    ), stat_agg AS (
      SELECT
        fighter_id,
        COUNT(DISTINCT fight_id) AS stat_fights,
        COUNT(*)::double precision AS rounds_fought,
        SUM(seconds_fought)::double precision AS seconds_fought,
        SUM(sig_strikes_landed) AS sig_landed,
        SUM(sig_strikes_attempted) AS sig_attempted,
        SUM(sig_strikes_absorbed) AS sig_absorbed,
        SUM(opp_sig_attempted) AS opp_sig_attempted,
        SUM(opp_sig_landed) AS opp_sig_landed,
        SUM(takedowns_landed) AS td_landed,
        SUM(takedowns_attempted) AS td_attempted,
        SUM(opp_td_landed) AS opp_td_landed,
        SUM(opp_td_attempted) AS opp_td_attempted,
        SUM(submission_attempts) AS sub_attempts,
        SUM(opp_sub_attempts) AS opp_sub_attempts,
        SUM(control_seconds) AS control_seconds,
        SUM(opp_control_seconds) AS opp_control_seconds
      FROM round_rows
      GROUP BY fighter_id
    ), rating_agg AS (
      SELECT fighter_id, AVG(pre_fight_rating) AS avg_opponent_rating, COUNT(*) AS rating_count
      FROM ufc_fighter_ratings
      WHERE fighter_id = ANY(${fighterIds}::text[])
      GROUP BY fighter_id
    )
    SELECT
      ff.fighter_id,
      COUNT(DISTINCT ff.fight_id) AS fight_count,
      SUM(ff.win) AS wins,
      SUM(ff.loss) AS losses,
      SUM(CASE WHEN ff.win = 1 AND (ff.method LIKE '%ko%' OR ff.method LIKE '%tko%') THEN 1 ELSE 0 END) AS ko_tko_wins,
      SUM(CASE WHEN ff.win = 1 AND ff.method LIKE '%sub%' THEN 1 ELSE 0 END) AS submission_wins,
      SUM(CASE WHEN ff.win = 1 AND ff.method NOT LIKE '%ko%' AND ff.method NOT LIKE '%tko%' AND ff.method NOT LIKE '%sub%' THEN 1 ELSE 0 END) AS decision_wins,
      SUM(CASE WHEN ff.loss = 1 AND (ff.method LIKE '%ko%' OR ff.method LIKE '%tko%') THEN 1 ELSE 0 END) AS ko_tko_losses,
      SUM(CASE WHEN ff.loss = 1 AND ff.method LIKE '%sub%' THEN 1 ELSE 0 END) AS submission_losses,
      SUM(CASE WHEN ff.loss = 1 AND ff.method NOT LIKE '%ko%' AND ff.method NOT LIKE '%tko%' AND ff.method NOT LIKE '%sub%' THEN 1 ELSE 0 END) AS decision_losses,
      MAX(sa.rounds_fought) AS rounds_fought,
      MAX(sa.seconds_fought) AS seconds_fought,
      MAX(sa.sig_landed) AS sig_landed,
      MAX(sa.sig_attempted) AS sig_attempted,
      MAX(sa.sig_absorbed) AS sig_absorbed,
      MAX(sa.opp_sig_attempted) AS opp_sig_attempted,
      MAX(sa.opp_sig_landed) AS opp_sig_landed,
      MAX(sa.td_landed) AS td_landed,
      MAX(sa.td_attempted) AS td_attempted,
      MAX(sa.opp_td_landed) AS opp_td_landed,
      MAX(sa.opp_td_attempted) AS opp_td_attempted,
      MAX(sa.sub_attempts) AS sub_attempts,
      MAX(sa.opp_sub_attempts) AS opp_sub_attempts,
      MAX(sa.control_seconds) AS control_seconds,
      MAX(sa.opp_control_seconds) AS opp_control_seconds,
      MAX(ff.fight_date) AS last_fight_date,
      MAX(ra.avg_opponent_rating) AS avg_opponent_rating,
      MAX(ra.rating_count) AS rating_count
    FROM fighter_fights ff
    LEFT JOIN stat_agg sa ON sa.fighter_id = ff.fighter_id
    LEFT JOIN rating_agg ra ON ra.fighter_id = ff.fighter_id
    GROUP BY ff.fighter_id
  `;
  return new Map(rows.map((row) => [row.fighter_id, row]));
}

async function loadAmateurRows(fighterIds: string[]) {
  if (!fighterIds.length) return new Map<string, AmateurRow>();
  const rows = await prisma.$queryRaw<AmateurRow[]>`
    SELECT fighter_id,
      COUNT(*) AS amateur_count,
      SUM(CASE WHEN lower(coalesce(result, '')) LIKE '%win%' OR lower(coalesce(result, '')) = 'w' THEN 1 ELSE 0 END) AS amateur_wins,
      SUM(CASE WHEN lower(coalesce(result, '')) LIKE '%loss%' OR lower(coalesce(result, '')) = 'l' THEN 1 ELSE 0 END) AS amateur_losses,
      SUM(CASE WHEN lower(coalesce(method, '')) LIKE '%ko%' OR lower(coalesce(method, '')) LIKE '%tko%' OR lower(coalesce(method, '')) LIKE '%sub%' THEN 1 ELSE 0 END) AS amateur_finishes,
      AVG(opponent_strength_score) AS avg_amateur_opponent_strength,
      MAX(promotion_tier) AS best_promotion_tier
    FROM ufc_amateur_results
    WHERE fighter_id = ANY(${fighterIds}::text[])
    GROUP BY fighter_id
  `;
  return new Map(rows.map((row) => [row.fighter_id, row]));
}

async function loadProspectRows(fighterIds: string[]) {
  if (!fighterIds.length) return new Map<string, ProspectRow>();
  const rows = await prisma.$queryRaw<ProspectRow[]>`
    SELECT DISTINCT ON (fighter_id)
      fighter_id,
      combat_base AS latest_combat_base,
      promotion_tier AS latest_promotion_tier,
      confidence_cap AS latest_confidence_cap,
      COUNT(*) OVER (PARTITION BY fighter_id) AS note_count,
      tags_json,
      payload_json
    FROM ufc_prospect_notes
    WHERE fighter_id = ANY(${fighterIds}::text[])
    ORDER BY fighter_id, note_date DESC
  `;
  return new Map(rows.map((row) => [row.fighter_id, row]));
}

function buildProfileFeatureSnapshot(input: {
  fighter: FighterRow;
  stats?: AggregateStatsRow;
  amateur?: AmateurRow;
  prospect?: ProspectRow;
  generatedAt: string;
  modelVersion: string;
}): { snapshot: UfcModelFeatureSnapshot; profile: FighterProfile } {
  const payload = asRecord(input.fighter.payload_json);
  const stats = input.stats;
  const amateur = input.amateur;
  const prospect = input.prospect;
  const seconds = Math.max(0, num(stats?.seconds_fought));
  const minutes = seconds / 60;
  const fightCount = num(stats?.fight_count);
  const wins = num(stats?.wins);
  const losses = num(stats?.losses);
  const ufcFights = fightCount;
  const amateurCount = num(amateur?.amateur_count);
  const proFights = Math.max(fightCount, num(payloadNumber(payload, "proFights", "pro_fights"), fightCount + amateurCount));
  const roundsFought = num(stats?.rounds_fought, num(payloadNumber(payload, "roundsFought", "rounds_fought"), 0));
  const slpm = payloadNumber(payload, "slpm", "sigStrikesLandedPerMin") ?? perMinute(num(stats?.sig_landed), seconds, 3.3);
  const sapm = payloadNumber(payload, "sapm", "sigStrikesAbsorbedPerMin") ?? perMinute(Math.max(num(stats?.sig_absorbed), num(stats?.opp_sig_landed)), seconds, 3.3);
  const strikeAcc = payloadNumber(payload, "sigStrikeAccuracyPct", "strikeAccuracyPct") ?? pct(num(stats?.sig_landed), num(stats?.sig_attempted), 44);
  const strikeDef = payloadNumber(payload, "sigStrikeDefensePct", "strikeDefensePct") ?? skill(100 - pct(Math.max(num(stats?.opp_sig_landed), num(stats?.sig_absorbed)), num(stats?.opp_sig_attempted), 46));
  const tdPer15 = payloadNumber(payload, "takedownsPer15", "tdAvg") ?? per15(num(stats?.td_landed), seconds, 1.2);
  const tdAcc = payloadNumber(payload, "takedownAccuracyPct", "tdAccuracy") ?? pct(num(stats?.td_landed), num(stats?.td_attempted), 35);
  const tdDef = payloadNumber(payload, "takedownDefensePct", "tdDefense") ?? skill(100 - pct(num(stats?.opp_td_landed), num(stats?.opp_td_attempted), 38));
  const subPer15 = payloadNumber(payload, "submissionAttemptsPer15", "subAvg") ?? per15(num(stats?.sub_attempts), seconds, 0.45);
  const subDefense = payloadNumber(payload, "submissionDefensePct", "subDefense") ?? skill(100 - pct(num(stats?.opp_sub_attempts), Math.max(1, num(stats?.opp_control_seconds) / 60), 38));
  const controlTimePct = payloadNumber(payload, "controlTimePct") ?? pct(num(stats?.control_seconds), seconds, 18);
  const controlEscapePct = payloadNumber(payload, "controlEscapePct", "escapePct") ?? skill(100 - pct(num(stats?.opp_control_seconds), seconds, 18));
  const finishWins = num(stats?.ko_tko_wins) + num(stats?.submission_wins);
  const finishRate = payloadNumber(payload, "finishRate") ?? (wins > 0 ? round(finishWins / wins, 3) : 0.42);
  const koLossRate = losses > 0 ? round(num(stats?.ko_tko_losses) / losses, 3) : 0;
  const submissionLossRate = losses > 0 ? round(num(stats?.submission_losses) / losses, 3) : 0;
  const lastFight = toIso(stats?.last_fight_date);
  const daysSinceLastFight = lastFight ? Math.max(0, Math.round((Date.now() - new Date(lastFight).getTime()) / 86_400_000)) : null;
  const opponentStrength = ratingToStrength(num(stats?.avg_opponent_rating, BASELINE_RATING));
  const amateurWinPct = pct(num(amateur?.amateur_wins), Math.max(1, amateurCount), 50);
  const amateurFinishPct = pct(num(amateur?.amateur_finishes), Math.max(1, amateurCount), 40);
  const amateurSignal = skill(amateurCount ? amateurWinPct * 0.62 + amateurFinishPct * 0.22 + ratingToStrength(num(amateur?.avg_amateur_opponent_strength, 50) <= 100 ? 1500 + (num(amateur?.avg_amateur_opponent_strength, 50) - 50) * 12 : num(amateur?.avg_amateur_opponent_strength, BASELINE_RATING)) * 0.16 : 50);
  const promotionTierSignal = skill(normalizeTier(prospect?.latest_promotion_tier ?? amateur?.best_promotion_tier ?? payloadString(payload, "promotionTier", "promotion_tier")));
  const camp = payloadString(payload, "camp", "gym", "team", "trainingCamp");
  const combatBase = prospect?.latest_combat_base ?? input.fighter.combat_base ?? payloadString(payload, "combatBase", "combat_base", "base");
  const pressureScore = payloadNumber(payload, "pressureScore") ?? skill(normalize(slpm + tdPer15 * 0.45, 1.5, 8.5) * 0.58 + normalize(controlTimePct, 0, 55) * 0.22 + normalize(amateurFinishPct, 0, 85) * 0.2);
  const staminaScore = payloadNumber(payload, "staminaScore", "cardioScore") ?? skill(normalize(roundsFought, 0, 65) * 0.32 + normalize(minutes, 0, 240) * 0.26 + normalize(controlEscapePct, 20, 90) * 0.22 + normalize(daysSinceLastFight ?? 180, 650, 45) * 0.2);
  const heartScore = payloadNumber(payload, "heartScore") ?? skill(normalize(wins + losses, 0, 22) * 0.22 + normalize(staminaScore, 20, 90) * 0.28 + normalize(controlEscapePct, 20, 90) * 0.18 + normalize(opponentStrength, 25, 80) * 0.18 + normalize(100 - koLossRate * 100, 40, 100) * 0.14);
  const chinScore = payloadNumber(payload, "chinScore") ?? skill(normalize(100 - koLossRate * 100, 35, 100) * 0.45 + normalize(strikeDef, 35, 75) * 0.25 + normalize(100 - sapm * 10, 20, 90) * 0.3);
  const recoveryScore = payloadNumber(payload, "recoveryScore") ?? skill(heartScore * 0.42 + staminaScore * 0.34 + chinScore * 0.24);
  const fightIqScore = payloadNumber(payload, "fightIqScore", "fightIQ") ?? skill(normalize(proFights, 0, 28) * 0.3 + normalize(roundsFought, 0, 75) * 0.26 + normalize(strikeDef + tdDef + subDefense, 110, 230) * 0.26 + normalize(opponentStrength, 30, 80) * 0.18);
  const gamePlanScore = payloadNumber(payload, "gamePlanScore") ?? skill(fightIqScore * 0.52 + normalize(camp ? 70 : 50, 30, 80) * 0.18 + normalize(opponentStrength, 30, 80) * 0.3);
  const layoffRisk = payloadNumber(payload, "injuryLayoffRisk", "layoffRisk") ?? (daysSinceLastFight == null ? 8 : skill(Math.max(0, daysSinceLastFight - 365) / 10));
  const shortNoticePenalty = payloadNumber(payload, "shortNoticePenalty", "shortNoticeRisk") ?? 0;
  const legKicks = payloadNumber(payload, "legKicksLandedPer15", "lowKicksPer15") ?? skill(normalize(payloadNumber(payload, "kickVolume", "kickingVolume") ?? 50, 0, 100) * 0.18 + normalize(slpm, 1.2, 6.8) * 0.1);
  const bodyKicks = payloadNumber(payload, "bodyKicksLandedPer15") ?? round(legKicks * 0.38, 3);
  const headKicks = payloadNumber(payload, "headKicksLandedPer15") ?? round((payloadNumber(payload, "headKickThreat") ?? normalize(num(stats?.ko_tko_wins), 0, 8)) / 22, 3);
  const kickingAccuracy = payloadNumber(payload, "kickingAccuracyPct", "kickAccuracyPct") ?? skill(strikeAcc * 0.65 + fightIqScore * 0.18 + normalize(input.fighter.reach_inches ?? 72, 64, 82) * 0.17);
  const kickingDefense = payloadNumber(payload, "kickingDefensePct", "kickDefensePct") ?? skill(strikeDef * 0.58 + normalize(input.fighter.reach_inches ?? 72, 64, 82) * 0.18 + fightIqScore * 0.24);
  const recentForm = payloadNumber(payload, "recentFormScore") ?? skill(50 + (wins - losses) * 3 + (daysSinceLastFight != null && daysSinceLastFight < 365 ? 4 : 0) - layoffRisk * 0.2);
  const feature: UfcModelFeatureSnapshot = {
    fightId: `profile:${input.fighter.id}`,
    fighterId: input.fighter.id,
    opponentFighterId: "field-average",
    fightDate: input.generatedAt,
    snapshotAt: input.generatedAt,
    modelVersion: input.modelVersion,
    age: payloadNumber(payload, "age"),
    reachInches: input.fighter.reach_inches ?? payloadNumber(payload, "reachInches", "reach_inches"),
    heightInches: input.fighter.height_inches ?? payloadNumber(payload, "heightInches", "height_inches"),
    stance: input.fighter.stance,
    weightClass: payloadString(payload, "weightClass", "weight_class"),
    daysSinceLastFight,
    proFights,
    ufcFights,
    roundsFought,
    sigStrikesLandedPerMin: slpm,
    sigStrikesAbsorbedPerMin: sapm,
    strikingDifferential: round(slpm - sapm, 3),
    sigStrikeAccuracyPct: strikeAcc,
    sigStrikeDefensePct: strikeDef,
    knockdownsPer15: payloadNumber(payload, "knockdownsPer15") ?? per15(num(stats?.ko_tko_wins), seconds || 900, 0.25),
    takedownsPer15: tdPer15,
    takedownAccuracyPct: tdAcc,
    takedownDefensePct: tdDef,
    submissionAttemptsPer15: subPer15,
    submissionDefensePct: subDefense,
    controlTimePct,
    controlEscapePct,
    getUpRate: payloadNumber(payload, "getUpRate") ?? controlEscapePct,
    reversalsPer15: payloadNumber(payload, "reversalsPer15") ?? per15(num(stats?.opp_td_landed) * 0.08, seconds, 0.18),
    sweepRate: payloadNumber(payload, "sweepRate") ?? per15(num(stats?.sub_attempts) * 0.06, seconds, 0.15),
    legKicksLandedPer15: legKicks,
    bodyKicksLandedPer15: bodyKicks,
    headKicksLandedPer15: headKicks,
    kickingAccuracyPct: kickingAccuracy,
    kickingDefensePct: kickingDefense,
    clinchStrikingScore: payloadNumber(payload, "clinchStrikingScore") ?? skill(controlTimePct * 0.35 + strikeAcc * 0.3 + pressureScore * 0.35),
    pressureScore,
    distanceManagementScore: payloadNumber(payload, "distanceManagementScore") ?? skill(strikeDef * 0.36 + kickingDefense * 0.24 + fightIqScore * 0.24 + normalize(input.fighter.reach_inches ?? 72, 64, 82) * 0.16),
    recentFormScore: recentForm,
    finishRate,
    lateRoundPerformance: payloadNumber(payload, "lateRoundPerformance") ?? skill(staminaScore * 0.48 + heartScore * 0.28 + normalize(roundsFought, 0, 55) * 0.24),
    heartScore,
    staminaScore,
    paceScore: payloadNumber(payload, "paceScore") ?? skill(normalize(slpm + tdPer15 * 0.55, 1.5, 8.5) * 0.58 + staminaScore * 0.24 + pressureScore * 0.18),
    chinScore,
    recoveryScore,
    fightIqScore,
    gamePlanScore,
    shortNoticePenalty,
    injuryLayoffRisk: layoffRisk,
    opponentAdjustedStrength: opponentStrength,
    coldStartActive: ufcFights < 3 || proFights < 8,
    feature: {
      source: "elite-fighter-profile-builder",
      camp,
      combatBase,
      amateurSignal,
      promotionTierSignal,
      opponentStrengthSignal: opponentStrength,
      koLossRate,
      submissionLossRate,
      profileDiagnostics: { seconds, fightCount, amateurCount, ratingCount: num(stats?.rating_count), dataQuality: profileQuality(stats, payload, amateur) },
      rawPayload: payload
    }
  };
  const spiderSkills = buildUfcFighterSkillProfile({ feature });
  const profile: FighterProfile = {
    fighterId: input.fighter.id,
    fullName: input.fighter.full_name,
    generatedAt: input.generatedAt,
    modelVersion: input.modelVersion,
    dataQuality: profileQuality(stats, payload, amateur),
    sample: { proFights, ufcFights, amateurFights: amateurCount, roundsFought, minutesFought: round(minutes, 2), wins, losses },
    careerStats: {
      slpm, sapm, strikingDifferential: round(slpm - sapm, 3), sigStrikeAccuracyPct: strikeAcc, sigStrikeDefensePct: strikeDef,
      knockdownsPer15: feature.knockdownsPer15 ?? 0, takedownsPer15: tdPer15, takedownAccuracyPct: tdAcc, takedownDefensePct: tdDef,
      submissionAttemptsPer15: subPer15, submissionDefensePct: subDefense, controlTimePct, controlEscapePct,
      getUpRate: feature.getUpRate ?? controlEscapePct, reversalsPer15: feature.reversalsPer15 ?? 0, sweepRate: feature.sweepRate ?? 0,
      finishRate, koLossRate, submissionLossRate, daysSinceLastFight
    },
    background: { stance: input.fighter.stance, combatBase, camp, amateurSignal, promotionTierSignal, opponentStrengthSignal: opponentStrength },
    spiderSkills,
    diagnostics: {
      profileSource: "warehouse-history+fighter-payload+amateur+prospect-notes",
      opponentAdjusted: true,
      historyWeighted: true,
      missing: [
        seconds <= 0 ? "round_stats" : null,
        amateurCount <= 0 ? "amateur_results" : null,
        !camp ? "camp" : null,
        !combatBase ? "combat_base" : null
      ].filter((item): item is string => Boolean(item))
    }
  };
  return { snapshot: feature, profile };
}

async function updateFighterProfile(profile: FighterProfile) {
  await prisma.$executeRaw`
    UPDATE ufc_fighters
    SET payload_json = COALESCE(payload_json, '{}'::jsonb) || ${JSON.stringify({
      eliteProfile: profile,
      spiderSkills: profile.spiderSkills,
      careerStats: profile.careerStats,
      background: profile.background,
      dataQuality: profile.dataQuality,
      lastProfileBuildAt: profile.generatedAt
    })}::jsonb,
      updated_at = now()
    WHERE id = ${profile.fighterId}
  `;
}

async function loadUpcomingFights(modelVersion: string, horizonDays: number, limit: number) {
  return prisma.$queryRaw<UpcomingFightRow[]>`
    SELECT f.id AS fight_id, f.fight_date, f.weight_class, f.scheduled_rounds,
      f.fighter_a_id, f.fighter_b_id,
      fa.full_name AS fighter_a_name, fb.full_name AS fighter_b_name,
      COUNT(DISTINCT af.id) AS a_feature_count,
      COUNT(DISTINCT bf.id) AS b_feature_count
    FROM ufc_fights f
    LEFT JOIN ufc_fighters fa ON fa.id = f.fighter_a_id
    LEFT JOIN ufc_fighters fb ON fb.id = f.fighter_b_id
    LEFT JOIN ufc_model_features af ON af.fight_id = f.id AND af.fighter_id = f.fighter_a_id AND af.model_version = ${modelVersion}
    LEFT JOIN ufc_model_features bf ON bf.fight_id = f.id AND bf.fighter_id = f.fighter_b_id AND bf.model_version = ${modelVersion}
    WHERE f.fight_date >= now() - interval '12 hours'
      AND f.fight_date <= now() + (${horizonDays}::text || ' days')::interval
    GROUP BY f.id, f.fight_date, f.weight_class, f.scheduled_rounds, f.fighter_a_id, f.fighter_b_id, fa.full_name, fb.full_name
    ORDER BY f.fight_date ASC
    LIMIT ${limit}
  `;
}

function featureForFight(base: UfcModelFeatureSnapshot, input: { fightId: string; fightDate: string; opponentFighterId: string; weightClass: string | null }) {
  return {
    ...base,
    id: stableId("ufcmf", `${input.fightId}:${base.fighterId}:${base.modelVersion}:elite-profile`),
    fightId: input.fightId,
    fightDate: input.fightDate,
    opponentFighterId: input.opponentFighterId,
    snapshotAt: new Date(Math.min(Date.now(), new Date(input.fightDate).getTime() - 60_000)).toISOString(),
    weightClass: input.weightClass,
    feature: {
      ...asRecord(base.feature),
      source: "elite-fighter-profile-builder-fight-snapshot",
      reusedFromProfileFightId: base.fightId
    }
  };
}

async function insertModelFeature(feature: UfcModelFeatureSnapshot) {
  await prisma.$executeRaw`
    INSERT INTO ufc_model_features (id, fight_id, fight_date, fighter_id, opponent_fighter_id, snapshot_at, model_version, pro_fights, ufc_fights, rounds_fought, sig_strikes_landed_per_min, sig_strikes_absorbed_per_min, striking_differential, takedowns_per_15, takedown_defense_pct, submission_attempts_per_15, control_time_pct, opponent_adjusted_strength, cold_start_active, feature_json, updated_at)
    VALUES (${(feature as any).id}, ${feature.fightId}, ${feature.fightDate}, ${feature.fighterId}, ${feature.opponentFighterId}, ${feature.snapshotAt}, ${feature.modelVersion}, ${feature.proFights ?? null}, ${feature.ufcFights ?? null}, ${feature.roundsFought ?? null}, ${feature.sigStrikesLandedPerMin ?? null}, ${feature.sigStrikesAbsorbedPerMin ?? null}, ${feature.strikingDifferential ?? null}, ${feature.takedownsPer15 ?? null}, ${feature.takedownDefensePct ?? null}, ${feature.submissionAttemptsPer15 ?? null}, ${feature.controlTimePct ?? null}, ${feature.opponentAdjustedStrength ?? null}, ${Boolean(feature.coldStartActive)}, ${JSON.stringify(feature.feature ?? {})}::jsonb, now())
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

export async function buildEliteUfcFighterProfiles(options: { modelVersion?: string; limit?: number; horizonDays?: number; dryRun?: boolean } = {}) {
  const modelVersion = options.modelVersion ?? DEFAULT_MODEL_VERSION;
  const limit = Math.max(1, Math.min(5000, Math.floor(options.limit ?? 2500)));
  const horizonDays = Math.max(1, Math.min(365, Math.floor(options.horizonDays ?? 180)));
  const generatedAt = new Date().toISOString();
  const fighters = await loadFighters(limit);
  const fighterIds = fighters.map((fighter) => fighter.id);
  const [statsById, amateurById, prospectById] = await Promise.all([
    loadAggregateStats(fighterIds),
    loadAmateurRows(fighterIds),
    loadProspectRows(fighterIds)
  ]);
  const baseFeatureByFighter = new Map<string, UfcModelFeatureSnapshot>();
  const qualityCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
  let updatedFighters = 0;
  const errors: string[] = [];

  for (const fighter of fighters) {
    try {
      const { snapshot, profile } = buildProfileFeatureSnapshot({ fighter, stats: statsById.get(fighter.id), amateur: amateurById.get(fighter.id), prospect: prospectById.get(fighter.id), generatedAt, modelVersion });
      baseFeatureByFighter.set(fighter.id, snapshot);
      qualityCounts[profile.dataQuality] = (qualityCounts[profile.dataQuality] ?? 0) + 1;
      if (!options.dryRun) await updateFighterProfile(profile);
      updatedFighters += 1;
    } catch (error) {
      errors.push(`${fighter.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const upcoming = await loadUpcomingFights(modelVersion, horizonDays, 300);
  let writtenFightFeatures = 0;
  for (const fight of upcoming) {
    const fightDate = toIso(fight.fight_date) ?? generatedAt;
    const aBase = baseFeatureByFighter.get(fight.fighter_a_id);
    const bBase = baseFeatureByFighter.get(fight.fighter_b_id);
    const features = [
      aBase ? featureForFight(aBase, { fightId: fight.fight_id, fightDate, opponentFighterId: fight.fighter_b_id, weightClass: fight.weight_class }) : null,
      bBase ? featureForFight(bBase, { fightId: fight.fight_id, fightDate, opponentFighterId: fight.fighter_a_id, weightClass: fight.weight_class }) : null
    ];
    for (const feature of features) {
      if (!feature) continue;
      if (!options.dryRun) await insertModelFeature(feature);
      writtenFightFeatures += 1;
    }
  }

  return {
    ok: errors.length === 0,
    mode: options.dryRun ? "dry-run" : "build",
    modelVersion,
    generatedAt,
    fighterCount: fighters.length,
    updatedFighters,
    upcomingFightCount: upcoming.length,
    writtenFightFeatures,
    qualityCounts,
    errors: errors.slice(0, 50)
  };
}
