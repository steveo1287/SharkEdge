import crypto from "node:crypto";

import { prisma } from "@/lib/db/prisma";

type CompletedFightRow = {
  id: string;
  fight_date: Date | string;
  winner_fighter_id: string | null;
  fighter_a_id: string;
  fighter_b_id: string;
};

type StatAggRow = {
  fighter_id: string;
  opponent_fighter_id: string;
  seconds_fought: number | null;
  sig_landed: number | bigint | null;
  sig_attempted: number | bigint | null;
  sig_absorbed: number | bigint | null;
  td_landed: number | bigint | null;
  td_attempted: number | bigint | null;
  sub_attempts: number | bigint | null;
  control_seconds: number | bigint | null;
  knockdowns: number | null;
  total_landed: number | null;
  total_attempted: number | null;
};

type RatingRow = {
  fighter_id: string;
  rating: number | null;
};

type FighterPayloadRow = {
  id: string;
  payload_json: unknown;
};

export type UfcOutcomeSkillAdjustmentResult = {
  ok: boolean;
  fightCount: number;
  adjustedFighters: number;
  opponentStrengthSnapshots: number;
  warnings: string[];
  samples: Array<{ fightId: string; fighterId: string; deltas: Record<string, number> }>;
};

const BASE_RATING = 1500;

function stableId(prefix: string, value: string) {
  return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function num(value: number | bigint | null | undefined) {
  if (typeof value === "bigint") return Number(value);
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function per15(value: number, seconds: number) {
  return seconds > 0 ? value / (seconds / 900) : 0;
}

function pct(value: number, total: number) {
  return total > 0 ? (value / total) * 100 : 0;
}

function ratingStrength(rating: number | null | undefined) {
  const safe = typeof rating === "number" && Number.isFinite(rating) ? rating : BASE_RATING;
  return clamp(50 + (safe - BASE_RATING) / 12, 20, 85);
}

function delta(value: number, baseline: number, scale: number, cap: number, opponentStrength: number) {
  const raw = ((value - baseline) / scale) * 4;
  const opponentBoost = (opponentStrength - 50) / 30;
  return round(clamp(raw + opponentBoost, -cap, cap), 3);
}

async function completedFights(limit: number) {
  return prisma.$queryRaw<CompletedFightRow[]>`
    SELECT id, fight_date, winner_fighter_id, fighter_a_id, fighter_b_id
    FROM ufc_fights
    WHERE winner_fighter_id IS NOT NULL
      AND fight_date <= now()
    ORDER BY fight_date DESC
    LIMIT ${limit}
  `;
}

async function statAgg(fightId: string) {
  return prisma.$queryRaw<StatAggRow[]>`
    SELECT fighter_id, opponent_fighter_id,
      SUM(COALESCE(seconds_fought, 300))::double precision AS seconds_fought,
      SUM(sig_strikes_landed) AS sig_landed,
      SUM(sig_strikes_attempted) AS sig_attempted,
      SUM(sig_strikes_absorbed) AS sig_absorbed,
      SUM(takedowns_landed) AS td_landed,
      SUM(takedowns_attempted) AS td_attempted,
      SUM(submission_attempts) AS sub_attempts,
      SUM(control_seconds) AS control_seconds,
      SUM(COALESCE((payload_json->>'knockdowns')::double precision, 0)) AS knockdowns,
      SUM(COALESCE((payload_json->>'totalStrikesLanded')::double precision, 0)) AS total_landed,
      SUM(COALESCE((payload_json->>'totalStrikesAttempted')::double precision, 0)) AS total_attempted
    FROM ufc_fight_stats_rounds
    WHERE fight_id = ${fightId}
    GROUP BY fighter_id, opponent_fighter_id
  `;
}

async function latestRatings(fighterIds: string[], asOf: Date | string) {
  if (!fighterIds.length) return new Map<string, number>();
  const rows = (await prisma.$queryRaw<RatingRow[]>`
    SELECT DISTINCT ON (fighter_id) fighter_id, COALESCE(post_fight_rating, pre_fight_rating) AS rating
    FROM ufc_fighter_ratings
    WHERE fighter_id = ANY(${fighterIds}::text[])
      AND as_of <= ${asOf}::timestamptz
    ORDER BY fighter_id, as_of DESC, updated_at DESC
  `) as RatingRow[];
  return new Map(rows.map((row) => [row.fighter_id, row.rating ?? BASE_RATING]));
}

async function payloads(fighterIds: string[]) {
  if (!fighterIds.length) return new Map<string, unknown>();
  const rows = (await prisma.$queryRaw<FighterPayloadRow[]>`
    SELECT id, payload_json
    FROM ufc_fighters
    WHERE id = ANY(${fighterIds}::text[])
  `) as FighterPayloadRow[];
  return new Map(rows.map((row) => [row.id, row.payload_json]));
}

function buildDeltas(row: StatAggRow, opponentRating: number, won: boolean) {
  const seconds = Math.max(1, num(row.seconds_fought));
  const sigLanded = num(row.sig_landed);
  const sigAttempted = num(row.sig_attempted);
  const sigAbsorbed = num(row.sig_absorbed);
  const tdLanded = num(row.td_landed);
  const tdAttempted = num(row.td_attempted);
  const subAttempts = num(row.sub_attempts);
  const control = num(row.control_seconds);
  const knockdowns = num(row.knockdowns);
  const opponentStrength = ratingStrength(opponentRating);
  const slpm = sigLanded / (seconds / 60);
  const sapm = sigAbsorbed / (seconds / 60);
  const strikeAccuracy = pct(sigLanded, sigAttempted);
  const tdPer15 = per15(tdLanded, seconds);
  const tdAccuracy = pct(tdLanded, tdAttempted);
  const subPer15 = per15(subAttempts, seconds);
  const controlPct = pct(control, seconds);
  const kdPer15 = per15(knockdowns, seconds);
  const winBonus = won ? 0.65 : -0.35;

  return {
    sigStrikesLandedPerMin: delta(slpm, 3.3, 2.2, 1.8, opponentStrength),
    sigStrikesAbsorbedPerMin: round(clamp(-delta(sapm, 3.3, 2.4, 1.5, 100 - opponentStrength), -1.5, 1.5), 3),
    sigStrikeAccuracyPct: delta(strikeAccuracy, 44, 18, 5, opponentStrength),
    knockdownsPer15: delta(kdPer15, 0.22, 0.65, 1.2, opponentStrength),
    takedownsPer15: delta(tdPer15, 1.2, 2.4, 1.5, opponentStrength),
    takedownAccuracyPct: delta(tdAccuracy, 35, 28, 5, opponentStrength),
    submissionAttemptsPer15: delta(subPer15, 0.45, 1.3, 1.2, opponentStrength),
    controlTimePct: delta(controlPct, 18, 25, 4.5, opponentStrength),
    recentFormScore: round(clamp(winBonus * 2.8 + (opponentStrength - 50) / 14, -4, 5), 3),
    fightIqScore: round(clamp(winBonus + (controlPct > 30 ? 0.8 : 0) + (sigAbsorbed < sigLanded ? 0.5 : -0.3), -2.5, 2.5), 3),
    heartScore: round(clamp(winBonus + (seconds >= 900 ? 0.7 : 0) + (won && sapm > 3.5 ? 0.5 : 0), -2, 2.5), 3),
    staminaScore: round(clamp((seconds >= 900 ? 1 : 0) + (controlPct > 25 ? 0.3 : 0) - (sapm > 5 ? 0.4 : 0), -1.5, 2), 3),
    opponentAdjustedStrength: round(opponentStrength, 3)
  };
}

function blendLearningPayload(payload: unknown, fightId: string, deltas: Record<string, number>) {
  const existing = asRecord(payload);
  const learning = asRecord(existing.outcomeLearning);
  const current = asRecord(learning.skillDeltas);
  const blended = { ...current };
  for (const [key, value] of Object.entries(deltas)) {
    if (key === "opponentAdjustedStrength") continue;
    const old = typeof blended[key] === "number" ? blended[key] as number : 0;
    blended[key] = round(old * 0.72 + value * 0.28, 4);
  }
  return {
    ...existing,
    outcomeLearning: {
      ...learning,
      source: "post-fight-opponent-adjusted-skill-learning",
      lastFightId: fightId,
      updatedAt: new Date().toISOString(),
      skillDeltas: blended,
      latestFightDeltas: deltas
    }
  };
}

async function updateFighterPayload(fighterId: string, payload: unknown) {
  await prisma.$executeRaw`
    UPDATE ufc_fighters
    SET payload_json = ${JSON.stringify(payload)}::jsonb,
        updated_at = now()
    WHERE id = ${fighterId}
  `;
}

async function writeOpponentStrength(fighterId: string, fightId: string, asOf: Date | string, opponentRating: number) {
  const score = ratingStrength(opponentRating);
  const id = stableId("ufcoss", `${fighterId}:${fightId}:outcome-learning-v1`);
  await prisma.$executeRaw`
    INSERT INTO ufc_opponent_strength_snapshots (id, fighter_id, as_of, fights_included, avg_opponent_rating, opponent_strength_score, payload_json, updated_at)
    VALUES (${id}, ${fighterId}, ${asOf}::timestamptz, 1, ${opponentRating}, ${score}, ${JSON.stringify({ source: "post-fight-result-learning", fightId })}::jsonb, now())
    ON CONFLICT (fighter_id, as_of)
    DO UPDATE SET avg_opponent_rating = EXCLUDED.avg_opponent_rating,
      opponent_strength_score = EXCLUDED.opponent_strength_score,
      payload_json = COALESCE(ufc_opponent_strength_snapshots.payload_json, '{}'::jsonb) || EXCLUDED.payload_json,
      updated_at = now()
  `;
}

export async function applyUfcOutcomeSkillLearning(options: { limit?: number } = {}): Promise<UfcOutcomeSkillAdjustmentResult> {
  const limit = Math.max(1, Math.min(500, Math.floor(options.limit ?? 100)));
  const fights = await completedFights(limit);
  const warnings: string[] = [];
  let adjustedFighters = 0;
  let opponentStrengthSnapshots = 0;
  const samples: UfcOutcomeSkillAdjustmentResult["samples"] = [];

  for (const fight of fights) {
    const rows = await statAgg(fight.id);
    if (rows.length < 2) {
      warnings.push(`${fight.id}: missing normalized fight stat rows.`);
      continue;
    }
    const fighterIds = rows.map((row) => row.fighter_id);
    const ratingById = await latestRatings(fighterIds, fight.fight_date);
    const payloadById = await payloads(fighterIds);

    for (const row of rows) {
      const opponentRating = ratingById.get(row.opponent_fighter_id) ?? BASE_RATING;
      const won = row.fighter_id === fight.winner_fighter_id;
      const deltas = buildDeltas(row, opponentRating, won);
      const nextPayload = blendLearningPayload(payloadById.get(row.fighter_id), fight.id, deltas);
      await updateFighterPayload(row.fighter_id, nextPayload);
      await writeOpponentStrength(row.fighter_id, fight.id, fight.fight_date, opponentRating);
      adjustedFighters += 1;
      opponentStrengthSnapshots += 1;
      if (samples.length < 12) samples.push({ fightId: fight.id, fighterId: row.fighter_id, deltas });
    }
  }

  return { ok: warnings.length === 0, fightCount: fights.length, adjustedFighters, opponentStrengthSnapshots, warnings, samples };
}
