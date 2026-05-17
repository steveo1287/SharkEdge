import crypto from "node:crypto";

import { prisma } from "@/lib/db/prisma";
import { buildEliteUfcFighterProfiles } from "@/services/ufc/elite-fighter-profile-builder";
import { persistUfcCalibrationSnapshot } from "@/services/ufc/calibration";
import { persistUfcStatsFightStatsFromDetail, type UfcFightStatPersistenceResult } from "@/services/ufc/fight-stat-extractor";
import { applyUfcOutcomeSkillLearning } from "@/services/ufc/outcome-skill-adjuster";
import { persistUfcStyleCalibrationSnapshot } from "@/services/ufc/style-calibration-store";
import { discoverCompletedUfcStatsEvents } from "@/services/ufc/ufcstats-event-discovery";
import { fetchUfcStatsSnapshotWithDiagnostics } from "@/services/ufc/ufcstats-fetcher";

type Options = {
  eventUrl?: string | null;
  modelVersion?: string;
  rebuildProfiles?: boolean;
  profileLimit?: number;
  horizonDays?: number;
  discoverCompleted?: boolean;
  eventLimit?: number;
  learningLimit?: number;
};

type FightRow = {
  id: string;
  external_fight_id: string | null;
  event_label: string;
  fight_date: Date | string;
  fighter_a_id: string;
  fighter_b_id: string;
  fighter_a_name: string;
  fighter_b_name: string;
};

type RatingFightRow = FightRow & {
  winner_fighter_id: string | null;
};

type LatestRatingRow = {
  fighter_id: string;
  rating: number;
};

const DEFAULT_MODEL_VERSION = "ufc-fight-iq-v1";
const BASE_RATING = 1500;
const K_FACTOR = 28;

function stableId(prefix: string, value: string) {
  return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

function normalizeName(value: string | null | undefined) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function methodKind(method: string | null | undefined) {
  const value = normalizeName(method);
  if (value.includes("sub")) return "SUBMISSION";
  if (value.includes("ko") || value.includes("tko")) return "KO_TKO";
  if (value.includes("decision")) return "DECISION";
  if (value.includes("dq") || value.includes("disqualification")) return "DQ";
  return value ? "OTHER" : null;
}

function expectedScore(rating: number, opponentRating: number) {
  return 1 / (1 + Math.pow(10, (opponentRating - rating) / 400));
}

async function findInternalFight(input: { externalFightId: string; fighterAName: string; fighterBName: string; eventDate?: string | null }) {
  const exact = await prisma.$queryRaw<FightRow[]>`
    SELECT f.id, f.external_fight_id, f.event_label, f.fight_date, f.fighter_a_id, f.fighter_b_id, fa.full_name AS fighter_a_name, fb.full_name AS fighter_b_name
    FROM ufc_fights f
    JOIN ufc_fighters fa ON fa.id = f.fighter_a_id
    JOIN ufc_fighters fb ON fb.id = f.fighter_b_id
    WHERE f.external_fight_id = ${input.externalFightId}
    LIMIT 1
  `;
  if (exact[0]) return { fight: exact[0], matchType: "external_fight_id" as const };

  const candidates = await prisma.$queryRaw<FightRow[]>`
    SELECT f.id, f.external_fight_id, f.event_label, f.fight_date, f.fighter_a_id, f.fighter_b_id, fa.full_name AS fighter_a_name, fb.full_name AS fighter_b_name
    FROM ufc_fights f
    JOIN ufc_fighters fa ON fa.id = f.fighter_a_id
    JOIN ufc_fighters fb ON fb.id = f.fighter_b_id
    WHERE f.fight_date >= COALESCE(${input.eventDate}::timestamptz, now() - interval '14 days') - interval '3 days'
      AND f.fight_date <= COALESCE(${input.eventDate}::timestamptz, now() + interval '1 day') + interval '3 days'
    ORDER BY abs(extract(epoch from (f.fight_date - COALESCE(${input.eventDate}::timestamptz, f.fight_date)))) ASC
    LIMIT 80
  `;
  const a = normalizeName(input.fighterAName);
  const b = normalizeName(input.fighterBName);
  const matched = candidates.find((fight) => {
    const fa = normalizeName(fight.fighter_a_name);
    const fb = normalizeName(fight.fighter_b_name);
    return (fa === a && fb === b) || (fa === b && fb === a);
  });
  return matched ? { fight: matched, matchType: "fighter_names_date_window" as const } : null;
}

function winnerIdFromName(fight: FightRow, winnerName: string | null | undefined) {
  const winner = normalizeName(winnerName);
  if (!winner) return null;
  if (winner === normalizeName(fight.fighter_a_name)) return fight.fighter_a_id;
  if (winner === normalizeName(fight.fighter_b_name)) return fight.fighter_b_id;
  return null;
}

async function updateFightResult(args: { fight: FightRow; winnerFighterId: string; winnerName: string; loserName?: string | null; method?: string | null; round?: number | null; time?: string | null; sourceFightId: string; sourceUrl: string; matchType: string; eventName?: string | null; eventUrl?: string | null }) {
  await prisma.$executeRaw`
    UPDATE ufc_fights
    SET winner_fighter_id = ${args.winnerFighterId},
        status = 'COMPLETED',
        external_fight_id = COALESCE(external_fight_id, ${args.sourceFightId}),
        payload_json = COALESCE(payload_json, '{}'::jsonb) || ${JSON.stringify({
          resultSource: "ufcstats",
          resultSourceUrl: args.sourceUrl,
          resultEventName: args.eventName ?? null,
          resultEventUrl: args.eventUrl ?? null,
          resultMatchType: args.matchType,
          winnerName: args.winnerName,
          loserName: args.loserName ?? null,
          method: args.method ?? null,
          methodKind: methodKind(args.method),
          round: args.round ?? null,
          time: args.time ?? null,
          resultSyncedAt: new Date().toISOString()
        })}::jsonb,
        updated_at = now()
    WHERE id = ${args.fight.id}
  `;
}

async function settleShadowPredictions(modelVersion: string) {
  const result = await prisma.$executeRaw`
    UPDATE ufc_shadow_predictions s
    SET actual_winner_fighter_id = f.winner_fighter_id,
        result_correct = CASE WHEN s.pick_fighter_id IS NULL OR f.winner_fighter_id IS NULL THEN NULL ELSE s.pick_fighter_id = f.winner_fighter_id END,
        status = 'RESOLVED',
        updated_at = now(),
        payload_json = COALESCE(s.payload_json, '{}'::jsonb) || jsonb_build_object(
          'settledAt', now(),
          'settlementSource', 'ufc-result-settlement',
          'settlement', jsonb_build_object(
            'status', 'RESOLVED',
            'actualWinnerFighterId', f.winner_fighter_id,
            'resultCorrect', CASE WHEN s.pick_fighter_id IS NULL OR f.winner_fighter_id IS NULL THEN NULL ELSE s.pick_fighter_id = f.winner_fighter_id END
          )
        )
    FROM ufc_fights f
    WHERE s.fight_id = f.id
      AND s.model_version = ${modelVersion}
      AND f.winner_fighter_id IS NOT NULL
      AND COALESCE(s.status, 'PENDING') = 'PENDING'
  `;
  return Number(result ?? 0);
}

async function latestRating(fighterId: string, before: Date | string) {
  const rows = await prisma.$queryRaw<LatestRatingRow[]>`
    SELECT fighter_id, COALESCE(post_fight_rating, pre_fight_rating) AS rating
    FROM ufc_fighter_ratings
    WHERE fighter_id = ${fighterId}
      AND as_of <= ${toIso(before)}::timestamptz
    ORDER BY as_of DESC, updated_at DESC
    LIMIT 1
  `;
  return rows[0]?.rating ?? BASE_RATING;
}

async function updateRatingsFromCompletedResults(limit = 200) {
  const fights = await prisma.$queryRaw<RatingFightRow[]>`
    SELECT f.id, f.external_fight_id, f.event_label, f.fight_date, f.fighter_a_id, f.fighter_b_id, f.winner_fighter_id,
      fa.full_name AS fighter_a_name, fb.full_name AS fighter_b_name
    FROM ufc_fights f
    JOIN ufc_fighters fa ON fa.id = f.fighter_a_id
    JOIN ufc_fighters fb ON fb.id = f.fighter_b_id
    WHERE f.winner_fighter_id IS NOT NULL
      AND f.fight_date <= now()
    ORDER BY f.fight_date ASC
    LIMIT ${limit}
  `;
  let updated = 0;
  for (const fight of fights) {
    if (!fight.winner_fighter_id) continue;
    const aPre = await latestRating(fight.fighter_a_id, fight.fight_date);
    const bPre = await latestRating(fight.fighter_b_id, fight.fight_date);
    const expectedA = expectedScore(aPre, bPre);
    const actualA = fight.winner_fighter_id === fight.fighter_a_id ? 1 : 0;
    const actualB = 1 - actualA;
    const aPost = Number((aPre + K_FACTOR * (actualA - expectedA)).toFixed(2));
    const bPost = Number((bPre + K_FACTOR * (actualB - (1 - expectedA))).toFixed(2));
    const asOf = toIso(fight.fight_date) ?? new Date().toISOString();
    const aId = stableId("ufcrating", `${fight.id}:${fight.fighter_a_id}:result-settlement-v1`);
    const bId = stableId("ufcrating", `${fight.id}:${fight.fighter_b_id}:result-settlement-v1`);
    await prisma.$executeRaw`
      INSERT INTO ufc_fighter_ratings (id, fighter_id, fight_id, rating_system, as_of, pre_fight_rating, post_fight_rating, expected_win_probability, actual_result, payload_json, updated_at)
      VALUES (${aId}, ${fight.fighter_a_id}, ${fight.id}, 'elo_bradley_terry', ${asOf}::timestamptz, ${aPre}, ${aPost}, ${expectedA}, ${actualA}, ${JSON.stringify({ source: "ufc-result-settlement", opponentFighterId: fight.fighter_b_id })}::jsonb, now())
      ON CONFLICT (id) DO UPDATE SET pre_fight_rating = EXCLUDED.pre_fight_rating, post_fight_rating = EXCLUDED.post_fight_rating, expected_win_probability = EXCLUDED.expected_win_probability, actual_result = EXCLUDED.actual_result, payload_json = EXCLUDED.payload_json, updated_at = now()
    `;
    await prisma.$executeRaw`
      INSERT INTO ufc_fighter_ratings (id, fighter_id, fight_id, rating_system, as_of, pre_fight_rating, post_fight_rating, expected_win_probability, actual_result, payload_json, updated_at)
      VALUES (${bId}, ${fight.fighter_b_id}, ${fight.id}, 'elo_bradley_terry', ${asOf}::timestamptz, ${bPre}, ${bPost}, ${1 - expectedA}, ${actualB}, ${JSON.stringify({ source: "ufc-result-settlement", opponentFighterId: fight.fighter_a_id })}::jsonb, now())
      ON CONFLICT (id) DO UPDATE SET pre_fight_rating = EXCLUDED.pre_fight_rating, post_fight_rating = EXCLUDED.post_fight_rating, expected_win_probability = EXCLUDED.expected_win_probability, actual_result = EXCLUDED.actual_result, payload_json = EXCLUDED.payload_json, updated_at = now()
    `;
    updated += 2;
  }
  return { completedFightCount: fights.length, ratingRowsUpserted: updated };
}

async function syncEventResults(args: { eventUrl: string; modelVersion: string }) {
  const warnings: string[] = [];
  const synced: Array<{ fightId: string; winnerFighterId: string; matchType: string; method: string | null; round: number | null; time: string | null; eventUrl: string }> = [];
  const stats: UfcFightStatPersistenceResult[] = [];
  const fetched = await fetchUfcStatsSnapshotWithDiagnostics({ eventUrl: args.eventUrl, modelVersion: args.modelVersion, snapshotAt: new Date().toISOString() });
  for (const detail of fetched.fights) {
    if (!detail.winnerName) {
      warnings.push(`No winner parsed for ${detail.fighterAName} vs ${detail.fighterBName}`);
      continue;
    }
    const match = await findInternalFight({ externalFightId: detail.sourceFightId, fighterAName: detail.fighterAName, fighterBName: detail.fighterBName, eventDate: fetched.event.eventDate });
    if (!match) {
      warnings.push(`No internal fight match for ${detail.fighterAName} vs ${detail.fighterBName}`);
      continue;
    }
    const winnerFighterId = winnerIdFromName(match.fight, detail.winnerName);
    if (!winnerFighterId) {
      warnings.push(`Winner name did not match internal fighters for ${match.fight.id}: ${detail.winnerName}`);
      continue;
    }
    await updateFightResult({
      fight: match.fight,
      winnerFighterId,
      winnerName: detail.winnerName,
      loserName: detail.loserName,
      method: detail.method,
      round: detail.round,
      time: detail.time,
      sourceFightId: detail.sourceFightId,
      sourceUrl: detail.url,
      matchType: match.matchType,
      eventName: fetched.event.eventName,
      eventUrl: args.eventUrl
    });
    const statResult = await persistUfcStatsFightStatsFromDetail({ detail, fight: match.fight });
    stats.push(statResult);
    if (!statResult.ok) warnings.push(...statResult.warnings.map((warning) => `${match.fight.id}: ${warning}`));
    synced.push({ fightId: match.fight.id, winnerFighterId, matchType: match.matchType, method: detail.method ?? null, round: detail.round ?? null, time: detail.time ?? null, eventUrl: args.eventUrl });
  }
  return { eventUrl: args.eventUrl, diagnostics: fetched.diagnostics, synced, stats, warnings };
}

export async function runUfcResultSettlement(options: Options = {}) {
  const modelVersion = options.modelVersion ?? DEFAULT_MODEL_VERSION;
  const warnings: string[] = [];
  const synced: Array<{ fightId: string; winnerFighterId: string; matchType: string; method: string | null; round: number | null; time: string | null; eventUrl?: string }> = [];
  const statsPersistence: UfcFightStatPersistenceResult[] = [];
  const diagnostics: unknown[] = [];
  let discovery: unknown = null;
  const eventUrls: string[] = [];

  if (options.eventUrl) eventUrls.push(options.eventUrl);
  if (options.discoverCompleted) {
    const discovered = await discoverCompletedUfcStatsEvents({ limit: options.eventLimit ?? 3 });
    discovery = discovered;
    warnings.push(...discovered.warnings.map((warning) => `discovery: ${warning}`));
    for (const event of discovered.events) eventUrls.push(event.eventUrl);
  }

  for (const eventUrl of Array.from(new Set(eventUrls))) {
    try {
      const eventResult = await syncEventResults({ eventUrl, modelVersion });
      synced.push(...eventResult.synced);
      statsPersistence.push(...eventResult.stats);
      warnings.push(...eventResult.warnings.map((warning) => `${eventUrl}: ${warning}`));
      diagnostics.push(eventResult.diagnostics);
    } catch (error) {
      warnings.push(`${eventUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const settledPredictionCount = await settleShadowPredictions(modelVersion);
  const ratings = await updateRatingsFromCompletedResults();
  const outcomeLearning = await applyUfcOutcomeSkillLearning({ limit: options.learningLimit ?? 100 }).catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  const calibration = await persistUfcCalibrationSnapshot(modelVersion, "result-settlement").catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
  const styleCalibration = await persistUfcStyleCalibrationSnapshot(modelVersion, "style-calibration").catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
  const profileRebuild = options.rebuildProfiles
    ? await buildEliteUfcFighterProfiles({ modelVersion, limit: options.profileLimit ?? 2500, horizonDays: options.horizonDays ?? 180 }).catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }))
    : null;

  return {
    ok: warnings.length === 0,
    modelVersion,
    eventUrl: options.eventUrl ?? null,
    discoverCompleted: Boolean(options.discoverCompleted),
    discovery,
    eventsProcessed: Array.from(new Set(eventUrls)).length,
    syncedFightCount: synced.length,
    statsRowsWritten: statsPersistence.reduce((sum, item) => sum + item.rowsWritten, 0),
    settledPredictionCount,
    ratings,
    outcomeLearning,
    calibration,
    styleCalibration,
    profileRebuild,
    synced,
    statsPersistence,
    diagnostics,
    warnings
  };
}
