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

type RatingRow = { fighter_id: string; pre_fight_rating: number | null; as_of: Date | string; payload_json: unknown };
type StrengthRow = { fighter_id: string; opponent_strength_score: number | null; fights_included: number | null; as_of: Date | string; payload_json: unknown };
type ProspectNoteRow = { fighter_id: string; note_date: Date | string; combat_base: string | null; promotion_tier: string | null; confidence_cap: number | null; tags_json: unknown; payload_json: unknown };
type AmateurSummaryRow = { fighter_id: string; results: number | bigint; wins: number | bigint; ko_wins: number | bigint; sub_wins: number | bigint; as_of: Date | string | null };

type RoundAggRow = {
  fighter_id: string;
  fights: number | bigint;
  rounds: number | bigint;
  seconds: number | null;
  last_fight_date: Date | string | null;
  days_since_last_fight: number | null;
  sig_landed: number | null;
  sig_attempted: number | null;
  sig_absorbed: number | null;
  opp_sig_landed: number | null;
  opp_sig_attempted: number | null;
  takedowns_landed: number | null;
  takedowns_attempted: number | null;
  opp_takedowns_landed: number | null;
  opp_takedowns_attempted: number | null;
  submission_attempts: number | null;
  opp_submission_attempts: number | null;
  control_seconds: number | null;
  opp_control_seconds: number | null;
};

type JsonRecord = Record<string, unknown>;

const DEFAULT_MODEL_VERSION = "ufc-fight-iq-v1";

function asRecord(value: unknown): JsonRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}; }
function nested(record: JsonRecord, key: string) { return asRecord(record[key]); }
function int(value: unknown, fallback = 0) { if (typeof value === "bigint") return Number(value); if (typeof value === "number" && Number.isFinite(value)) return Math.round(value); if (typeof value === "string" && Number.isFinite(Number(value))) return Math.round(Number(value)); return fallback; }
function numeric(value: unknown) { if (typeof value === "number" && Number.isFinite(value)) return value; if (typeof value === "string" && value.trim()) { const parsed = Number(value.replace(/%$/, "")); return Number.isFinite(parsed) ? parsed : null; } return null; }
function clamp(value: number, min = 0, max = 100) { return Math.max(min, Math.min(max, value)); }
function round(value: number | null | undefined, digits = 4) { return value == null || !Number.isFinite(value) ? null : Number(value.toFixed(digits)); }
function stableId(prefix: string, value: string) { return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 24)}`; }
function iso(value: Date | string) { return value instanceof Date ? value.toISOString() : new Date(value).toISOString(); }
function safeJson(value: unknown) { return JSON.stringify(value ?? {}); }
function snapshotAt(fightDate: Date | string) { const time = new Date(fightDate).getTime(); return Number.isFinite(time) ? new Date(Math.min(Date.now(), time - 60_000)).toISOString() : new Date().toISOString(); }
function rate(count: number, minutes: number | null, scale = 1) { return minutes && minutes > 0 ? count * scale / minutes : null; }
function pct(made: number, attempted: number) { return attempted > 0 ? clamp((made / attempted) * 100) : null; }
function defensePct(opponentMade: number, opponentAttempted: number, fallback: number | null = null) { return opponentAttempted > 0 ? clamp((1 - opponentMade / opponentAttempted) * 100) : fallback; }
function boolish(value: unknown) { return value === true || (typeof value === "string" && ["true", "yes", "1"].includes(value.toLowerCase())); }

function latestBefore<T extends { fighter_id: string; as_of: Date | string }>(rows: T[], fighterId: string, fightDate: Date | string) {
  const fightTime = new Date(fightDate).getTime();
  return rows
    .filter((row) => row.fighter_id === fighterId && new Date(row.as_of).getTime() <= fightTime)
    .sort((a, b) => new Date(b.as_of).getTime() - new Date(a.as_of).getTime())[0] ?? null;
}

function pickNumber(records: JsonRecord[], keys: string[], fallback: number | null = null) {
  for (const record of records) {
    for (const key of keys) {
      const value = numeric(record[key]);
      if (value != null) return value;
    }
  }
  return fallback;
}

function pickText(records: JsonRecord[], keys: string[], fallback: string | null = null) {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return fallback;
}

function payloadRecords(fighter: FighterRow) {
  const payload = asRecord(fighter.payload_json);
  const stats = nested(payload, "stats");
  const profile = nested(payload, "profile");
  const history = nested(payload, "history");
  const elite = nested(payload, "eliteProfile");
  const careerStats = nested(elite, "careerStats");
  const rawFeature = nested(payload, "rawFeature");
  const rawPayload = nested(payload, "rawPayload");
  return { payload, stats, profile, history, elite, careerStats, rawFeature, rawPayload, records: [stats, careerStats, rawFeature, rawPayload, profile, history, payload] };
}

function derivedScores(input: { slpm: number | null; sapm: number | null; strikeDef: number | null; tdPer15: number | null; tdDef: number | null; subPer15: number | null; controlPct: number | null; escapePct: number | null; finishRate: number | null; daysSinceLastFight: number | null; rating: number | null; amateurWins: number; amateurResults: number; shortNotice: boolean }) {
  const strikeDiff = (input.slpm ?? 3.1) - (input.sapm ?? 3.1);
  const ratingBoost = input.rating ? clamp((input.rating - 1200) / 8, -12, 18) : 0;
  const layoffPenalty = input.daysSinceLastFight && input.daysSinceLastFight > 540 ? 8 : input.daysSinceLastFight && input.daysSinceLastFight < 28 ? 5 : 0;
  const amateurWinPct = input.amateurResults > 0 ? input.amateurWins / input.amateurResults : 0.5;
  return {
    pressureScore: round(clamp(50 + (input.slpm ?? 3.1) * 4 + Math.max(0, strikeDiff) * 5 + ratingBoost)),
    distanceManagementScore: round(clamp(50 + (input.strikeDef ?? 54) * 0.45 + strikeDiff * 6 - 24)),
    staminaScore: round(clamp(58 + (input.controlPct ?? 18) * 0.22 + (input.tdDef ?? 62) * 0.16 - layoffPenalty - (input.shortNotice ? 7 : 0))),
    paceScore: round(clamp(45 + (input.slpm ?? 3.1) * 7 + (input.tdPer15 ?? 1.1) * 4)),
    chinScore: round(clamp(50 + (input.strikeDef ?? 54) * 0.32 - (input.sapm ?? 3.1) * 3 + ratingBoost * 0.25)),
    recoveryScore: round(clamp(52 + (input.escapePct ?? 50) * 0.18 + (input.tdDef ?? 62) * 0.12 - layoffPenalty * 0.5)),
    fightIqScore: round(clamp(50 + ratingBoost + (input.tdDef ?? 62) * 0.12 + (input.strikeDef ?? 54) * 0.1)),
    heartScore: round(clamp(50 + amateurWinPct * 12 + (input.escapePct ?? 50) * 0.12 + (input.finishRate ?? 0.45) * 10)),
    recentFormScore: round(clamp(52 + ratingBoost - layoffPenalty + amateurWinPct * 8)),
    lateRoundPerformance: round(clamp(52 + (input.staminaScore ?? 58) * 0.35 + (input.controlPct ?? 18) * 0.2))
  };
}

function featureFromWarehouse(args: {
  fighter: FighterRow;
  opponent: FighterRow;
  fight: FightRow;
  agg: RoundAggRow | null;
  rating: RatingRow | null;
  strength: StrengthRow | null;
  note: ProspectNoteRow | null;
  amateur: AmateurSummaryRow | null;
}) {
  const source = payloadRecords(args.fighter);
  const notePayload = asRecord(args.note?.payload_json);
  const records = [notePayload, ...source.records];
  const fights = int(args.agg?.fights, 0);
  const rounds = int(args.agg?.rounds, pickNumber(records, ["roundsFought", "rounds_fought"], 0) ?? 0);
  const seconds = Number(args.agg?.seconds ?? 0);
  const minutes = seconds > 0 ? seconds / 60 : rounds > 0 ? rounds * 5 : null;
  const sigLanded = Number(args.agg?.sig_landed ?? 0);
  const sigAttempted = Number(args.agg?.sig_attempted ?? 0);
  const sigAbsorbed = Number(args.agg?.sig_absorbed ?? 0);
  const oppSigLanded = Number(args.agg?.opp_sig_landed ?? 0);
  const oppSigAttempted = Number(args.agg?.opp_sig_attempted ?? 0);
  const tdLanded = Number(args.agg?.takedowns_landed ?? 0);
  const tdAttempted = Number(args.agg?.takedowns_attempted ?? 0);
  const oppTdLanded = Number(args.agg?.opp_takedowns_landed ?? 0);
  const oppTdAttempted = Number(args.agg?.opp_takedowns_attempted ?? 0);
  const subs = Number(args.agg?.submission_attempts ?? 0);
  const oppSubs = Number(args.agg?.opp_submission_attempts ?? 0);
  const control = Number(args.agg?.control_seconds ?? 0);
  const oppControl = Number(args.agg?.opp_control_seconds ?? 0);
  const amateurResults = int(args.amateur?.results, 0);
  const amateurWins = int(args.amateur?.wins, 0);
  const proFights = Math.max(fights, int(pickNumber(records, ["proFights", "pro_fights"], 0), 0), amateurResults);
  const ufcFights = Math.max(fights, int(pickNumber(records, ["ufcFights", "ufc_fights"], 0), 0));
  const slpm = pickNumber(records, ["sigStrikesLandedPerMin", "sig_strikes_landed_per_min", "slpm"], rate(sigLanded, minutes));
  const sapm = pickNumber(records, ["sigStrikesAbsorbedPerMin", "sig_strikes_absorbed_per_min", "sapm"], rate(sigAbsorbed || oppSigLanded, minutes));
  const strikeAcc = pickNumber(records, ["sigStrikeAccuracyPct", "strikeAccuracyPct", "sig_strike_accuracy_pct"], pct(sigLanded, sigAttempted));
  const strikeDef = pickNumber(records, ["sigStrikeDefensePct", "strikeDefensePct", "sig_strike_defense_pct"], defensePct(oppSigLanded || sigAbsorbed, oppSigAttempted, sapm != null && slpm != null ? clamp(54 + (slpm - sapm) * 4, 35, 76) : 54));
  const tdPer15 = pickNumber(records, ["takedownsPer15", "takedowns_per_15", "tdAvg", "takedownAverage"], rate(tdLanded, minutes, 15));
  const tdAcc = pickNumber(records, ["takedownAccuracyPct", "takedown_accuracy_pct", "tdAccuracy"], pct(tdLanded, tdAttempted));
  const tdDef = pickNumber(records, ["takedownDefensePct", "takedown_defense_pct", "tdDefense"], defensePct(oppTdLanded, oppTdAttempted, 62));
  const subPer15 = pickNumber(records, ["submissionAttemptsPer15", "submission_attempts_per_15", "submissionAverage", "subAvg"], rate(subs, minutes, 15));
  const oppSubPer15 = rate(oppSubs, minutes, 15) ?? 0;
  const subDef = pickNumber(records, ["submissionDefensePct", "submission_defense_pct", "subDefense", "submissionDefense"], clamp(70 - oppSubPer15 * 12, 45, 86));
  const controlPct = pickNumber(records, ["controlTimePct", "control_time_pct"], seconds > 0 ? clamp(control / seconds * 100) : 18);
  const escapePct = pickNumber(records, ["controlEscapePct", "control_escape_pct", "escapePct"], seconds > 0 ? clamp(100 - oppControl / seconds * 100) : 50);
  const getUpRate = pickNumber(records, ["getUpRate", "get_up_rate", "standupRate"], escapePct);
  const opponentStrength = pickNumber(records, ["opponentAdjustedStrength", "opponentStrength", "strengthOfSchedule"], args.strength?.opponent_strength_score ?? (args.rating?.pre_fight_rating ? clamp(50 + (args.rating.pre_fight_rating - 1500) / 18) : 50));
  const daysSinceLastFight = pickNumber(records, ["daysSinceLastFight", "layoffDays"], args.agg?.days_since_last_fight ?? null);
  const finishRate = pickNumber(records, ["finishRate", "finish_rate"], amateurResults > 0 ? clamp((int(args.amateur?.ko_wins, 0) + int(args.amateur?.sub_wins, 0)) / amateurResults, 0, 1) : 0.45);
  const shortNotice = boolish(source.payload.shortNotice) || boolish(source.profile.shortNotice) || boolish(notePayload.shortNotice);
  const stanceText = args.fighter.stance ?? pickText(records, ["stance"], null);
  const derived = derivedScores({ slpm, sapm, strikeDef, tdPer15, tdDef, subPer15, controlPct, escapePct, finishRate, daysSinceLastFight, rating: args.rating?.pre_fight_rating ?? null, amateurWins, amateurResults, shortNotice });
  const coldStartActive = ufcFights < 3 || proFights < 8;

  return {
    proFights: proFights || null,
    ufcFights: ufcFights || null,
    roundsFought: rounds || null,
    sigStrikesLandedPerMin: round(slpm),
    sigStrikesAbsorbedPerMin: round(sapm),
    strikingDifferential: round(slpm != null && sapm != null ? slpm - sapm : pickNumber(records, ["strikingDifferential"], 0)),
    takedownsPer15: round(tdPer15 ?? 0),
    takedownDefensePct: round(tdDef),
    submissionAttemptsPer15: round(subPer15 ?? 0),
    controlTimePct: round(controlPct),
    opponentAdjustedStrength: round(opponentStrength),
    coldStartActive,
    feature: {
      source: "deep-ufc-profile-auto-builder",
      hydrationQuality: coldStartActive ? "deep-profile-cold-start" : "deep-profile-derived",
      fighterName: args.fighter.full_name,
      opponentName: args.opponent.full_name,
      dataSources: {
        roundStats: Boolean(args.agg),
        fighterPayload: Object.keys(source.payload).length > 0,
        ratings: Boolean(args.rating),
        opponentStrength: Boolean(args.strength),
        prospectNotes: Boolean(args.note),
        amateurResults: Boolean(args.amateur)
      },
      age: pickNumber(records, ["age"], null),
      heightInches: args.fighter.height_inches ?? pickNumber(records, ["heightInches", "height_inches"], null),
      reachInches: args.fighter.reach_inches ?? pickNumber(records, ["reachInches", "reach_inches"], null),
      stance: stanceText,
      combatBase: args.fighter.combat_base ?? args.note?.combat_base ?? pickText(records, ["combatBase", "combat_base"], null),
      weightClass: pickText(records, ["weightClass", "weight_class"], null),
      daysSinceLastFight: round(daysSinceLastFight, 1),
      shortNotice,
      sigStrikeAccuracyPct: round(strikeAcc ?? 44),
      sigStrikeDefensePct: round(strikeDef ?? 54),
      knockdownsPer15: round(pickNumber(records, ["knockdownsPer15", "knockdowns_per_15"], 0.22)),
      takedownAccuracyPct: round(tdAcc ?? 35),
      submissionDefensePct: round(subDef),
      controlEscapePct: round(escapePct),
      getUpRate: round(getUpRate),
      reversalsPer15: round(pickNumber(records, ["reversalsPer15", "reversals_per_15"], 0.15)),
      sweepRate: round(pickNumber(records, ["sweepRate", "sweepsPer15"], 0.12)),
      legKicksLandedPer15: round(pickNumber(records, ["legKicksLandedPer15", "lowKicksPer15", "calfKicksPer15"], 5.2)),
      bodyKicksLandedPer15: round(pickNumber(records, ["bodyKicksLandedPer15", "bodyKicksPer15"], 2.4)),
      headKicksLandedPer15: round(pickNumber(records, ["headKicksLandedPer15", "headKicksPer15"], 0.45)),
      kickingAccuracyPct: round(pickNumber(records, ["kickingAccuracyPct", "kickAccuracyPct"], 42)),
      kickingDefensePct: round(pickNumber(records, ["kickingDefensePct", "kickDefensePct"], 55)),
      clinchStrikingScore: round(pickNumber(records, ["clinchStrikingScore"], 50 + (controlPct ?? 18) * 0.25)),
      pressureScore: derived.pressureScore,
      distanceManagementScore: derived.distanceManagementScore,
      recentFormScore: pickNumber(records, ["recentFormScore", "recent_form_score"], derived.recentFormScore),
      finishRate: round(finishRate),
      lateRoundPerformance: pickNumber(records, ["lateRoundPerformance", "late_round_performance"], derived.lateRoundPerformance),
      heartScore: pickNumber(records, ["heartScore", "adversityScore"], derived.heartScore),
      staminaScore: pickNumber(records, ["staminaScore", "cardioScore"], derived.staminaScore),
      paceScore: pickNumber(records, ["paceScore", "outputScore"], derived.paceScore),
      chinScore: pickNumber(records, ["chinScore", "koResistance"], derived.chinScore),
      recoveryScore: pickNumber(records, ["recoveryScore"], derived.recoveryScore),
      fightIqScore: pickNumber(records, ["fightIqScore", "fightIQ", "fightIq"], derived.fightIqScore),
      gamePlanScore: pickNumber(records, ["gamePlanScore"], derived.fightIqScore),
      shortNoticePenalty: shortNotice ? 10 : 0,
      injuryLayoffRisk: daysSinceLastFight && daysSinceLastFight > 540 ? 12 : 0,
      amateurSignal: amateurResults > 0 ? clamp(45 + (amateurWins / amateurResults) * 25) : 50,
      promotionTierSignal: args.note?.promotion_tier ? 58 : 50,
      rating: args.rating?.pre_fight_rating ?? null,
      ratingPayload: args.rating?.payload_json ?? null,
      opponentStrengthPayload: args.strength?.payload_json ?? null,
      prospectNotePayload: args.note?.payload_json ?? null,
      rawPayload: source.payload
    }
  };
}

async function upcomingFights(limit: number, horizonDays: number) {
  return prisma.$queryRaw<FightRow[]>`
    SELECT id, event_label, fight_date, scheduled_rounds, fighter_a_id, fighter_b_id
    FROM ufc_fights
    WHERE fight_date >= now() - interval '3 days'
      AND fight_date <= now() + (${horizonDays}::text || ' days')::interval
      AND status NOT IN ('CANCELED', 'VOID')
      AND COALESCE(payload_json->>'matchupQuality', '') <> 'FAKE_NAVIGATION'
    ORDER BY fight_date ASC
    LIMIT ${Math.max(1, Math.min(200, limit))};
  `;
}

async function fightersFor(ids: string[]) {
  if (!ids.length) return [];
  return prisma.$queryRaw<FighterRow[]>`SELECT id, full_name, stance, height_inches, reach_inches, combat_base, payload_json FROM ufc_fighters WHERE id = ANY(${ids}::text[])`;
}

async function aggregateFor(fighterId: string, fight: FightRow) {
  const fightDate = iso(fight.fight_date);
  const rows = await prisma.$queryRaw<RoundAggRow[]>`
    SELECT r.fighter_id,
      COUNT(DISTINCT r.fight_id) AS fights,
      COUNT(*) AS rounds,
      SUM(COALESCE(r.seconds_fought, 300))::double precision AS seconds,
      MAX(f.fight_date) AS last_fight_date,
      EXTRACT(EPOCH FROM (${fightDate}::timestamptz - MAX(f.fight_date))) / 86400 AS days_since_last_fight,
      SUM(r.sig_strikes_landed)::double precision AS sig_landed,
      SUM(r.sig_strikes_attempted)::double precision AS sig_attempted,
      SUM(r.sig_strikes_absorbed)::double precision AS sig_absorbed,
      SUM(COALESCE(o.sig_strikes_landed, r.sig_strikes_absorbed, 0))::double precision AS opp_sig_landed,
      SUM(COALESCE(o.sig_strikes_attempted, 0))::double precision AS opp_sig_attempted,
      SUM(r.takedowns_landed)::double precision AS takedowns_landed,
      SUM(r.takedowns_attempted)::double precision AS takedowns_attempted,
      SUM(COALESCE(o.takedowns_landed, 0))::double precision AS opp_takedowns_landed,
      SUM(COALESCE(o.takedowns_attempted, 0))::double precision AS opp_takedowns_attempted,
      SUM(r.submission_attempts)::double precision AS submission_attempts,
      SUM(COALESCE(o.submission_attempts, 0))::double precision AS opp_submission_attempts,
      SUM(r.control_seconds)::double precision AS control_seconds,
      SUM(COALESCE(o.control_seconds, 0))::double precision AS opp_control_seconds
    FROM ufc_fight_stats_rounds r
    JOIN ufc_fights f ON f.id = r.fight_id
    LEFT JOIN ufc_fight_stats_rounds o ON o.fight_id = r.fight_id AND o.round_number = r.round_number AND o.fighter_id <> r.fighter_id
    WHERE r.fighter_id = ${fighterId}
      AND r.fight_id <> ${fight.id}
      AND f.fight_date < ${fightDate}::timestamptz
      AND COALESCE(f.payload_json->>'matchupQuality', '') <> 'FAKE_NAVIGATION'
    GROUP BY r.fighter_id;
  `;
  return rows[0] ?? null;
}

async function ratingsFor(ids: string[]) {
  if (!ids.length) return [];
  return prisma.$queryRaw<RatingRow[]>`SELECT fighter_id, pre_fight_rating, as_of, payload_json FROM ufc_fighter_ratings WHERE fighter_id = ANY(${ids}::text[]) ORDER BY fighter_id, as_of DESC`;
}

async function strengthsFor(ids: string[]) {
  if (!ids.length) return [];
  return prisma.$queryRaw<StrengthRow[]>`SELECT fighter_id, opponent_strength_score, fights_included, as_of, payload_json FROM ufc_opponent_strength_snapshots WHERE fighter_id = ANY(${ids}::text[]) ORDER BY fighter_id, as_of DESC`;
}

async function prospectNotesFor(ids: string[]) {
  if (!ids.length) return [];
  return prisma.$queryRaw<ProspectNoteRow[]>`SELECT fighter_id, note_date, combat_base, promotion_tier, confidence_cap, tags_json, payload_json FROM ufc_prospect_notes WHERE fighter_id = ANY(${ids}::text[]) ORDER BY fighter_id, note_date DESC`;
}

async function amateurSummariesFor(ids: string[]) {
  if (!ids.length) return [];
  return prisma.$queryRaw<AmateurSummaryRow[]>`
    SELECT fighter_id,
      COUNT(*) AS results,
      COUNT(*) FILTER (WHERE lower(COALESCE(result, '')) LIKE '%win%' OR lower(COALESCE(result, '')) = 'w') AS wins,
      COUNT(*) FILTER (WHERE lower(COALESCE(method, '')) LIKE '%ko%' OR lower(COALESCE(method, '')) LIKE '%tko%') AS ko_wins,
      COUNT(*) FILTER (WHERE lower(COALESCE(method, '')) LIKE '%sub%') AS sub_wins,
      MAX(result_date) AS as_of
    FROM ufc_amateur_results
    WHERE fighter_id = ANY(${ids}::text[])
    GROUP BY fighter_id;
  `;
}

function latestNote(rows: ProspectNoteRow[], fighterId: string, fightDate: Date | string) {
  const fightTime = new Date(fightDate).getTime();
  return rows.filter((row) => row.fighter_id === fighterId && new Date(row.note_date).getTime() <= fightTime).sort((a, b) => new Date(b.note_date).getTime() - new Date(a.note_date).getTime())[0] ?? null;
}

async function upsertFeature(args: { fight: FightRow; fighter: FighterRow; opponent: FighterRow; agg: RoundAggRow | null; rating: RatingRow | null; strength: StrengthRow | null; note: ProspectNoteRow | null; amateur: AmateurSummaryRow | null; modelVersion: string; dryRun?: boolean }) {
  const built = featureFromWarehouse(args);
  const snap = snapshotAt(args.fight.fight_date);
  const id = stableId("ufcmf", `${args.fight.id}:${args.fighter.id}:${args.modelVersion}`);
  if (args.dryRun) return { fightId: args.fight.id, fighterId: args.fighter.id, fighterName: args.fighter.full_name, source: built.feature.source, coldStartActive: built.coldStartActive, proFights: built.proFights, ufcFights: built.ufcFights, roundsFought: built.roundsFought, dryRun: true };
  await prisma.$executeRaw`
    INSERT INTO ufc_model_features (id, fight_id, fight_date, fighter_id, opponent_fighter_id, snapshot_at, model_version, pro_fights, ufc_fights, rounds_fought, sig_strikes_landed_per_min, sig_strikes_absorbed_per_min, striking_differential, takedowns_per_15, takedown_defense_pct, submission_attempts_per_15, control_time_pct, opponent_adjusted_strength, cold_start_active, feature_json, updated_at)
    VALUES (${id}, ${args.fight.id}, ${iso(args.fight.fight_date)}::timestamptz, ${args.fighter.id}, ${args.opponent.id}, ${snap}::timestamptz, ${args.modelVersion}, ${built.proFights}, ${built.ufcFights}, ${built.roundsFought}, ${built.sigStrikesLandedPerMin}, ${built.sigStrikesAbsorbedPerMin}, ${built.strikingDifferential}, ${built.takedownsPer15}, ${built.takedownDefensePct}, ${built.submissionAttemptsPer15}, ${built.controlTimePct}, ${built.opponentAdjustedStrength}, ${built.coldStartActive}, ${safeJson(built.feature)}::jsonb, now())
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
  return { fightId: args.fight.id, fighterId: args.fighter.id, fighterName: args.fighter.full_name, source: built.feature.source, coldStartActive: built.coldStartActive, proFights: built.proFights, ufcFights: built.ufcFights, roundsFought: built.roundsFought };
}

export async function buildUfcModelFeaturesFromWarehouse(options: { limit?: number; horizonDays?: number; modelVersion?: string; dryRun?: boolean } = {}) {
  if (!hasUsableServerDatabaseUrl()) return { ok: false, error: "No usable server database URL is configured.", fights: 0, features: 0 };
  const modelVersion = options.modelVersion ?? DEFAULT_MODEL_VERSION;
  const horizonDays = Math.max(1, Math.floor(options.horizonDays ?? 120));
  const fights = await upcomingFights(options.limit ?? 50, horizonDays);
  const ids = Array.from(new Set(fights.flatMap((fight) => [fight.fighter_a_id, fight.fighter_b_id])));
  const [fighters, ratings, strengths, notes, amateurRows] = await Promise.all([fightersFor(ids), ratingsFor(ids), strengthsFor(ids), prospectNotesFor(ids), amateurSummariesFor(ids)]);
  const fighterMap = new Map(fighters.map((fighter) => [fighter.id, fighter]));
  const amateurMap = new Map(amateurRows.map((row) => [row.fighter_id, row]));
  const results = [];
  const missing = [];

  for (const fight of fights) {
    const a = fighterMap.get(fight.fighter_a_id);
    const b = fighterMap.get(fight.fighter_b_id);
    if (!a || !b) { missing.push(fight.id); continue; }
    const [aggA, aggB] = await Promise.all([aggregateFor(a.id, fight), aggregateFor(b.id, fight)]);
    results.push(await upsertFeature({ fight, fighter: a, opponent: b, agg: aggA, rating: latestBefore(ratings, a.id, fight.fight_date), strength: latestBefore(strengths, a.id, fight.fight_date), note: latestNote(notes, a.id, fight.fight_date), amateur: amateurMap.get(a.id) ?? null, modelVersion, dryRun: options.dryRun }));
    results.push(await upsertFeature({ fight, fighter: b, opponent: a, agg: aggB, rating: latestBefore(ratings, b.id, fight.fight_date), strength: latestBefore(strengths, b.id, fight.fight_date), note: latestNote(notes, b.id, fight.fight_date), amateur: amateurMap.get(b.id) ?? null, modelVersion, dryRun: options.dryRun }));
  }

  return {
    ok: true,
    source: "deep-ufc-warehouse-profile-builder",
    modelVersion,
    dryRun: Boolean(options.dryRun),
    horizonDays,
    fights: fights.length,
    features: results.length,
    missingFights: missing.length,
    missingFightIds: missing.slice(0, 20),
    results: results.slice(0, 20)
  };
}
