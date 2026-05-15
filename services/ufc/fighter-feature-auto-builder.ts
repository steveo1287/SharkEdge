import crypto from "node:crypto";

import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

type FighterRow = {
  id: string;
  full_name: string;
  stance: string | null;
  height_inches: number | null;
  reach_inches: number | null;
  combat_base: string | null;
  payload_json: unknown;
};

type FightRow = {
  id: string;
  event_label: string;
  fight_date: Date | string;
  scheduled_rounds: number;
  fighter_a_id: string;
  fighter_b_id: string;
};

type RatingRow = {
  fighter_id: string;
  pre_fight_rating: number | null;
  as_of: Date | string;
};

type StrengthRow = {
  fighter_id: string;
  opponent_strength_score: number | null;
  as_of: Date | string;
};

type RoundAggRow = {
  fighter_id: string;
  fights: number | bigint;
  rounds: number | bigint;
  seconds: number | null;
  sig_landed: number | null;
  sig_absorbed: number | null;
  takedowns: number | null;
  submission_attempts: number | null;
  control_seconds: number | null;
};

type JsonRecord = Record<string, unknown>;

const DEFAULT_MODEL_VERSION = "ufc-fight-iq-v1";

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function nested(record: JsonRecord, key: string) {
  return asRecord(record[key]);
}

function num(record: JsonRecord, keys: string[], fallback: number | null = null) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  }
  return fallback;
}

function bool(record: JsonRecord, keys: string[], fallback = false) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return ["true", "yes", "1"].includes(value.toLowerCase());
  }
  return fallback;
}

function int(value: unknown, fallback = 0) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && Number.isFinite(Number(value))) return Math.round(Number(value));
  return fallback;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number | null, digits = 4) {
  return value == null || !Number.isFinite(value) ? null : Number(value.toFixed(digits));
}

function stableId(prefix: string, value: string) {
  return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function safeJson(value: unknown) {
  return JSON.stringify(value ?? {});
}

function snapshotAt(fightDate: Date | string) {
  const time = new Date(fightDate).getTime();
  if (!Number.isFinite(time)) return new Date().toISOString();
  return new Date(Math.min(Date.now(), time - 60_000)).toISOString();
}

function latestBefore<T extends { fighter_id: string; as_of: Date | string }>(rows: T[], fighterId: string, fightDate: Date | string) {
  const fightTime = new Date(fightDate).getTime();
  return rows
    .filter((row) => row.fighter_id === fighterId && new Date(row.as_of).getTime() <= fightTime)
    .sort((a, b) => new Date(b.as_of).getTime() - new Date(a.as_of).getTime())[0] ?? null;
}

function buildStatsFromPayload(fighter: FighterRow) {
  const payload = asRecord(fighter.payload_json);
  const stats = nested(payload, "stats");
  const profile = nested(payload, "profile");
  const history = nested(payload, "history");
  return { payload, stats, profile, history };
}

function featureFromWarehouse(args: {
  fighter: FighterRow;
  opponent: FighterRow;
  fight: FightRow;
  agg: RoundAggRow | null;
  rating: RatingRow | null;
  strength: StrengthRow | null;
}) {
  const { payload, stats, profile, history } = buildStatsFromPayload(args.fighter);
  const rounds = int(args.agg?.rounds, int(stats.roundsFought, int(history.roundsFought, 0)));
  const seconds = Number(args.agg?.seconds ?? 0);
  const minutes = seconds > 0 ? seconds / 60 : rounds > 0 ? rounds * 5 : null;
  const sigLanded = Number(args.agg?.sig_landed ?? 0);
  const sigAbsorbed = Number(args.agg?.sig_absorbed ?? 0);
  const takedowns = Number(args.agg?.takedowns ?? 0);
  const subs = Number(args.agg?.submission_attempts ?? 0);
  const control = Number(args.agg?.control_seconds ?? 0);
  const proFights = int(stats.proFights, int(history.proFights, int(args.agg?.fights, 0)));
  const ufcFights = int(stats.ufcFights, int(history.ufcFights, int(args.agg?.fights, 0)));
  const sigLpm = num(stats, ["sigStrikesLandedPerMin", "slpm"], minutes ? sigLanded / minutes : null);
  const sigApm = num(stats, ["sigStrikesAbsorbedPerMin", "sapm"], minutes ? sigAbsorbed / minutes : null);
  const tdPer15 = num(stats, ["takedownsPer15", "tdAvg"], minutes ? takedowns * 15 / minutes : null);
  const subPer15 = num(stats, ["submissionAttemptsPer15", "submissionAverage"], minutes ? subs * 15 / minutes : null);
  const controlPct = num(stats, ["controlTimePct", "control_pct"], seconds ? clamp((control / seconds) * 100) : null);
  const opponentStrength = num(stats, ["opponentAdjustedStrength", "opponentStrength"], args.strength?.opponent_strength_score ?? (args.rating?.pre_fight_rating ? clamp((args.rating.pre_fight_rating - 1200) / 6) : null));
  const daysSinceLastFight = num(stats, ["daysSinceLastFight", "layoffDays"], null);
  const shortNotice = bool(payload, ["shortNotice", "short_notice"], bool(profile, ["shortNotice", "short_notice"], false));

  return {
    proFights: proFights || null,
    ufcFights: ufcFights || null,
    roundsFought: rounds || null,
    sigStrikesLandedPerMin: round(sigLpm),
    sigStrikesAbsorbedPerMin: round(sigApm),
    strikingDifferential: round(sigLpm != null && sigApm != null ? sigLpm - sigApm : num(stats, ["strikingDifferential"], null)),
    takedownsPer15: round(tdPer15),
    takedownDefensePct: round(num(stats, ["takedownDefensePct", "tdDefense"], null)),
    submissionAttemptsPer15: round(subPer15),
    controlTimePct: round(controlPct),
    opponentAdjustedStrength: round(opponentStrength),
    coldStartActive: ufcFights < 3 || proFights < 8,
    feature: {
      autoBuiltFrom: "ufc_fighters + ufc_fight_stats_rounds + ratings/strength snapshots",
      fighterName: args.fighter.full_name,
      opponentName: args.opponent.full_name,
      age: num(profile, ["age"], num(payload, ["age"], null)),
      heightInches: args.fighter.height_inches ?? num(profile, ["heightInches", "height_inches"], null),
      reachInches: args.fighter.reach_inches ?? num(profile, ["reachInches", "reach_inches"], null),
      stance: args.fighter.stance ?? String(profile.stance ?? payload.stance ?? "") || null,
      weightClass: args.fight.event_label ? num(profile, ["weightClass"], null) : null,
      daysSinceLastFight,
      shortNotice,
      sigStrikeAccuracyPct: num(stats, ["sigStrikeAccuracyPct", "strikeAccuracyPct"], null),
      sigStrikeDefensePct: num(stats, ["sigStrikeDefensePct", "strikeDefensePct"], null),
      knockdownsPer15: num(stats, ["knockdownsPer15", "knockdowns_per_15"], null),
      takedownAccuracyPct: num(stats, ["takedownAccuracyPct", "tdAccuracy"], null),
      recentFormScore: num(stats, ["recentFormScore", "recent_form_score"], null),
      finishRate: num(stats, ["finishRate", "finish_rate"], null),
      lateRoundPerformance: num(stats, ["lateRoundPerformance", "late_round_performance"], null),
      amateurSignal: num(profile, ["amateurSignal"], null),
      promotionTierSignal: num(profile, ["promotionTierSignal"], null),
      rawPayload: payload
    }
  };
}

async function upcomingFights(limit: number) {
  return prisma.$queryRaw<FightRow[]>`
    SELECT id, event_label, fight_date, scheduled_rounds, fighter_a_id, fighter_b_id
    FROM ufc_fights
    WHERE fight_date >= now() - interval '3 days'
      AND status NOT IN ('CANCELED', 'VOID')
    ORDER BY fight_date ASC
    LIMIT ${Math.max(1, Math.min(200, limit))};
  `;
}

async function fightersFor(ids: string[]) {
  if (!ids.length) return [];
  return prisma.$queryRaw<FighterRow[]>`
    SELECT id, full_name, stance, height_inches, reach_inches, combat_base, payload_json
    FROM ufc_fighters
    WHERE id = ANY(${ids}::text[]);
  `;
}

async function aggregatesFor(ids: string[]) {
  if (!ids.length) return [];
  return prisma.$queryRaw<RoundAggRow[]>`
    SELECT fighter_id,
      COUNT(DISTINCT fight_id) AS fights,
      COUNT(*) AS rounds,
      SUM(COALESCE(seconds_fought, 300))::double precision AS seconds,
      SUM(sig_strikes_landed)::double precision AS sig_landed,
      SUM(sig_strikes_absorbed)::double precision AS sig_absorbed,
      SUM(takedowns_landed)::double precision AS takedowns,
      SUM(submission_attempts)::double precision AS submission_attempts,
      SUM(control_seconds)::double precision AS control_seconds
    FROM ufc_fight_stats_rounds
    WHERE fighter_id = ANY(${ids}::text[])
    GROUP BY fighter_id;
  `;
}

async function ratingsFor(ids: string[]) {
  if (!ids.length) return [];
  return prisma.$queryRaw<RatingRow[]>`
    SELECT fighter_id, pre_fight_rating, as_of
    FROM ufc_fighter_ratings
    WHERE fighter_id = ANY(${ids}::text[])
    ORDER BY fighter_id, as_of DESC;
  `;
}

async function strengthsFor(ids: string[]) {
  if (!ids.length) return [];
  return prisma.$queryRaw<StrengthRow[]>`
    SELECT fighter_id, opponent_strength_score, as_of
    FROM ufc_opponent_strength_snapshots
    WHERE fighter_id = ANY(${ids}::text[])
    ORDER BY fighter_id, as_of DESC;
  `;
}

async function upsertFeature(args: {
  fight: FightRow;
  fighter: FighterRow;
  opponent: FighterRow;
  agg: RoundAggRow | null;
  rating: RatingRow | null;
  strength: StrengthRow | null;
  modelVersion: string;
}) {
  const built = featureFromWarehouse(args);
  const snap = snapshotAt(args.fight.fight_date);
  const id = stableId("ufcmf", `${args.fight.id}:${args.fighter.id}:${args.modelVersion}`);
  await prisma.$executeRaw`
    INSERT INTO ufc_model_features (id, fight_id, fight_date, fighter_id, opponent_fighter_id, snapshot_at, model_version, pro_fights, ufc_fights, rounds_fought, sig_strikes_landed_per_min, sig_strikes_absorbed_per_min, striking_differential, takedowns_per_15, takedown_defense_pct, submission_attempts_per_15, control_time_pct, opponent_adjusted_strength, cold_start_active, feature_json, updated_at)
    VALUES (${id}, ${args.fight.id}, ${iso(args.fight.fight_date)}, ${args.fighter.id}, ${args.opponent.id}, ${snap}, ${args.modelVersion}, ${built.proFights}, ${built.ufcFights}, ${built.roundsFought}, ${built.sigStrikesLandedPerMin}, ${built.sigStrikesAbsorbedPerMin}, ${built.strikingDifferential}, ${built.takedownsPer15}, ${built.takedownDefensePct}, ${built.submissionAttemptsPer15}, ${built.controlTimePct}, ${built.opponentAdjustedStrength}, ${built.coldStartActive}, ${safeJson(built.feature)}::jsonb, now())
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
  return { fightId: args.fight.id, fighterId: args.fighter.id, fighterName: args.fighter.full_name, coldStartActive: built.coldStartActive };
}

export async function buildUfcModelFeaturesFromWarehouse(options: { limit?: number; modelVersion?: string } = {}) {
  if (!hasUsableServerDatabaseUrl()) return { ok: false, error: "No usable server database URL is configured.", fights: 0, features: 0 };
  const modelVersion = options.modelVersion ?? DEFAULT_MODEL_VERSION;
  const fights = await upcomingFights(options.limit ?? 50);
  const ids = Array.from(new Set(fights.flatMap((fight) => [fight.fighter_a_id, fight.fighter_b_id])));
  const [fighters, aggs, ratings, strengths] = await Promise.all([
    fightersFor(ids),
    aggregatesFor(ids),
    ratingsFor(ids),
    strengthsFor(ids)
  ]);
  const fighterMap = new Map(fighters.map((fighter) => [fighter.id, fighter]));
  const aggMap = new Map(aggs.map((row) => [row.fighter_id, row]));
  const results = [];
  const missing = [];

  for (const fight of fights) {
    const a = fighterMap.get(fight.fighter_a_id);
    const b = fighterMap.get(fight.fighter_b_id);
    if (!a || !b) {
      missing.push(fight.id);
      continue;
    }
    results.push(await upsertFeature({ fight, fighter: a, opponent: b, agg: aggMap.get(a.id) ?? null, rating: latestBefore(ratings, a.id, fight.fight_date), strength: latestBefore(strengths, a.id, fight.fight_date), modelVersion }));
    results.push(await upsertFeature({ fight, fighter: b, opponent: a, agg: aggMap.get(b.id) ?? null, rating: latestBefore(ratings, b.id, fight.fight_date), strength: latestBefore(strengths, b.id, fight.fight_date), modelVersion }));
  }

  return {
    ok: true,
    source: "auto-ufc-warehouse",
    modelVersion,
    fights: fights.length,
    features: results.length,
    missingFights: missing.length,
    missingFightIds: missing.slice(0, 20),
    results: results.slice(0, 20)
  };
}
