import crypto from "node:crypto";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";

const jsonRecord = z.record(z.string(), z.unknown()).default({});
const jsonArray = z.array(z.unknown()).default([]);

const fighterSchema = z.object({
  id: z.string().optional(),
  externalKey: z.string().optional(),
  fullName: z.string().min(1),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  nickname: z.string().optional().nullable(),
  dateOfBirth: z.string().optional().nullable(),
  stance: z.string().optional().nullable(),
  heightInches: z.number().optional().nullable(),
  reachInches: z.number().optional().nullable(),
  nationality: z.string().optional().nullable(),
  combatBase: z.string().optional().nullable(),
  metadata: jsonRecord.optional()
});

const fightSchema = z.object({
  id: z.string().optional(),
  externalFightId: z.string().optional(),
  externalEventId: z.string().optional().nullable(),
  eventLabel: z.string().min(1),
  fightDate: z.string(),
  venue: z.string().optional().nullable(),
  weightClass: z.string().optional().nullable(),
  scheduledRounds: z.union([z.literal(3), z.literal(5)]).default(3),
  fighterAKey: z.string().min(1),
  fighterBKey: z.string().min(1),
  winnerFighterKey: z.string().optional().nullable(),
  resultMethod: z.string().optional().nullable(),
  resultRound: z.number().int().optional().nullable(),
  resultTime: z.string().optional().nullable(),
  status: z.string().default("SCHEDULED"),
  sourceKey: z.string().default("manual"),
  preFightSnapshotAt: z.string().optional().nullable(),
  metadata: jsonRecord.optional()
});

const roundStatsSchema = z.object({
  id: z.string().optional(),
  fightKey: z.string().min(1),
  fighterKey: z.string().min(1),
  opponentFighterKey: z.string().optional().nullable(),
  roundNumber: z.number().int().min(1).max(5),
  secondsFought: z.number().int().optional().nullable(),
  knockdowns: z.number().int().default(0),
  sigStrikesLanded: z.number().int().default(0),
  sigStrikesAttempted: z.number().int().default(0),
  sigStrikesAbsorbed: z.number().int().default(0),
  totalStrikesLanded: z.number().int().default(0),
  totalStrikesAttempted: z.number().int().default(0),
  takedownsLanded: z.number().int().default(0),
  takedownsAttempted: z.number().int().default(0),
  submissionAttempts: z.number().int().default(0),
  reversals: z.number().int().default(0),
  controlSeconds: z.number().int().default(0),
  sourceKey: z.string().default("manual"),
  stats: jsonRecord.optional(),
  capturedAt: z.string().optional().nullable()
});

const ratingSchema = z.object({
  id: z.string().optional(),
  fighterKey: z.string().min(1),
  fightKey: z.string().optional().nullable(),
  opponentFighterKey: z.string().optional().nullable(),
  ratingSystem: z.string().default("elo_bradley_terry"),
  asOf: z.string(),
  preFightRating: z.number(),
  postFightRating: z.number().optional().nullable(),
  volatility: z.number().optional().nullable(),
  kFactor: z.number().optional().nullable(),
  expectedWinProbability: z.number().optional().nullable(),
  actualResult: z.number().optional().nullable(),
  sourceKey: z.string().default("model"),
  metadata: jsonRecord.optional()
});

const opponentStrengthSchema = z.object({
  id: z.string().optional(),
  fighterKey: z.string().min(1),
  asOf: z.string(),
  fightsIncluded: z.number().int().default(0),
  avgOpponentRating: z.number().optional().nullable(),
  opponentStrengthScore: z.number().optional().nullable(),
  ufcRecord: jsonRecord.optional(),
  proRecord: jsonRecord.optional(),
  sourceKey: z.string().default("model"),
  metadata: jsonRecord.optional()
});

const amateurResultSchema = z.object({
  id: z.string().optional(),
  fighterKey: z.string().min(1),
  externalResultId: z.string().optional(),
  resultDate: z.string().optional().nullable(),
  opponentName: z.string().optional().nullable(),
  result: z.string().optional().nullable(),
  method: z.string().optional().nullable(),
  resultRound: z.number().int().optional().nullable(),
  promotion: z.string().optional().nullable(),
  promotionTier: z.string().optional().nullable(),
  opponentStrengthScore: z.number().optional().nullable(),
  sourceKey: z.string().default("manual"),
  metadata: jsonRecord.optional()
});

const prospectNoteSchema = z.object({
  id: z.string().optional(),
  fighterKey: z.string().min(1),
  noteDate: z.string().optional().nullable(),
  author: z.string().optional().nullable(),
  combatBase: z.string().optional().nullable(),
  promotionTier: z.string().optional().nullable(),
  confidenceCap: z.number().optional().nullable(),
  tags: z.array(z.string()).default([]),
  note: z.string().min(1),
  sourceKey: z.string().default("manual_scouting"),
  metadata: jsonRecord.optional()
});

const modelFeatureSchema = z.object({
  id: z.string().optional(),
  fightKey: z.string().min(1),
  fightDate: z.string(),
  fighterKey: z.string().min(1),
  opponentFighterKey: z.string().min(1),
  snapshotAt: z.string(),
  modelVersion: z.string().min(1),
  age: z.number().optional().nullable(),
  reachInches: z.number().optional().nullable(),
  heightInches: z.number().optional().nullable(),
  stance: z.string().optional().nullable(),
  weightClass: z.string().optional().nullable(),
  daysSinceLastFight: z.number().optional().nullable(),
  proFights: z.number().int().optional().nullable(),
  ufcFights: z.number().int().optional().nullable(),
  roundsFought: z.number().optional().nullable(),
  sigStrikesLandedPerMin: z.number().optional().nullable(),
  sigStrikesAbsorbedPerMin: z.number().optional().nullable(),
  strikingDifferential: z.number().optional().nullable(),
  sigStrikeAccuracyPct: z.number().optional().nullable(),
  sigStrikeDefensePct: z.number().optional().nullable(),
  knockdownsPer15: z.number().optional().nullable(),
  takedownsPer15: z.number().optional().nullable(),
  takedownAccuracyPct: z.number().optional().nullable(),
  takedownDefensePct: z.number().optional().nullable(),
  submissionAttemptsPer15: z.number().optional().nullable(),
  controlTimePct: z.number().optional().nullable(),
  recentFormScore: z.number().optional().nullable(),
  finishRate: z.number().optional().nullable(),
  lateRoundPerformance: z.number().optional().nullable(),
  opponentAdjustedStrength: z.number().optional().nullable(),
  coldStartActive: z.boolean().default(false),
  feature: jsonRecord.optional()
});

const predictionSchema = z.object({
  id: z.string().optional(),
  fightKey: z.string().min(1),
  modelVersion: z.string().min(1),
  generatedAt: z.string(),
  fighterAKey: z.string().min(1),
  fighterBKey: z.string().min(1),
  fighterAWinProbability: z.number(),
  fighterBWinProbability: z.number(),
  pickFighterKey: z.string().optional().nullable(),
  fairOddsAmerican: z.number().int().optional().nullable(),
  sportsbookOddsAmerican: z.number().int().optional().nullable(),
  edgePct: z.number().optional().nullable(),
  koTkoProbability: z.number().optional().nullable(),
  submissionProbability: z.number().optional().nullable(),
  decisionProbability: z.number().optional().nullable(),
  roundFinishDistribution: jsonRecord.optional(),
  confidenceGrade: z.string().optional().nullable(),
  dataQualityGrade: z.string().optional().nullable(),
  pathToVictory: jsonArray.optional(),
  dangerFlags: jsonArray.optional(),
  prediction: jsonRecord.optional()
});

const simRunSchema = z.object({
  id: z.string().optional(),
  predictionKey: z.string().optional().nullable(),
  fightKey: z.string().min(1),
  modelVersion: z.string().min(1),
  seed: z.number().int(),
  simulationCount: z.number().int().min(1).default(25000),
  startedAt: z.string().optional().nullable(),
  completedAt: z.string().optional().nullable(),
  cacheKey: z.string().optional().nullable(),
  status: z.string().default("COMPLETED"),
  result: jsonRecord.optional()
});

const backtestResultSchema = z.object({
  id: z.string().optional(),
  modelVersion: z.string().min(1),
  backtestName: z.string().min(1),
  foldNumber: z.number().int().min(1),
  trainStartDate: z.string().optional().nullable(),
  trainEndDate: z.string(),
  testStartDate: z.string(),
  testEndDate: z.string(),
  fightsTrainCount: z.number().int().default(0),
  fightsTestCount: z.number().int().default(0),
  logLoss: z.number().optional().nullable(),
  brierScore: z.number().optional().nullable(),
  calibrationError: z.number().optional().nullable(),
  roiPct: z.number().optional().nullable(),
  clvPct: z.number().optional().nullable(),
  metrics: jsonRecord.optional()
});

export const ufcWarehousePayloadSchema = z.object({
  sourceKey: z.string().default("manual"),
  fighters: z.array(fighterSchema).default([]),
  fights: z.array(fightSchema).default([]),
  fightStatsRounds: z.array(roundStatsSchema).default([]),
  fighterRatings: z.array(ratingSchema).default([]),
  opponentStrengthSnapshots: z.array(opponentStrengthSchema).default([]),
  amateurResults: z.array(amateurResultSchema).default([]),
  prospectNotes: z.array(prospectNoteSchema).default([]),
  modelFeatures: z.array(modelFeatureSchema).default([]),
  predictions: z.array(predictionSchema).default([]),
  simRuns: z.array(simRunSchema).default([]),
  backtestResults: z.array(backtestResultSchema).default([])
});

export type UfcWarehousePayload = z.infer<typeof ufcWarehousePayloadSchema>;

function stableId(prefix: string, value: string) {
  return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

function iso(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid timestamp: ${value}`);
  return date.toISOString();
}

function json(value: unknown) {
  return JSON.stringify(value ?? {});
}

function assertNoFutureSnapshot(snapshotAt: string | null | undefined, fightDate: string | null | undefined, label: string) {
  if (!snapshotAt || !fightDate) return;
  const snapshot = new Date(snapshotAt).getTime();
  const fight = new Date(fightDate).getTime();
  if (Number.isNaN(snapshot) || Number.isNaN(fight)) return;
  if (snapshot > fight) throw new Error(`${label} has future-data leakage: snapshotAt must be at or before fightDate.`);
}

export function validateUfcWarehousePayload(raw: unknown) {
  const parsed = ufcWarehousePayloadSchema.parse(raw);

  const fighterKeys = new Set<string>();
  for (const fighter of parsed.fighters) {
    fighterKeys.add(fighter.id ?? fighter.externalKey ?? fighter.fullName);
    if (fighter.externalKey) fighterKeys.add(fighter.externalKey);
  }

  for (const fight of parsed.fights) {
    if (fight.fighterAKey === fight.fighterBKey) throw new Error(`Fight ${fight.eventLabel} has identical fighter keys.`);
    assertNoFutureSnapshot(fight.preFightSnapshotAt, fight.fightDate, `Fight ${fight.eventLabel}`);
  }

  for (const feature of parsed.modelFeatures) {
    assertNoFutureSnapshot(feature.snapshotAt, feature.fightDate, `Model feature ${feature.fightKey}:${feature.fighterKey}`);
  }

  for (const prediction of parsed.predictions) {
    const sum = prediction.fighterAWinProbability + prediction.fighterBWinProbability;
    if (Math.abs(sum - 1) > 0.0001) throw new Error(`Prediction ${prediction.fightKey}:${prediction.modelVersion} probabilities must sum to 1.`);
  }

  for (const backtest of parsed.backtestResults) {
    const trainEnd = new Date(backtest.trainEndDate).getTime();
    const testStart = new Date(backtest.testStartDate).getTime();
    if (!(trainEnd < testStart)) throw new Error(`Backtest ${backtest.backtestName} fold ${backtest.foldNumber} must be walk-forward.`);
  }

  return parsed;
}

export function summarizeUfcWarehousePayload(raw: unknown) {
  const payload = validateUfcWarehousePayload(raw);
  return {
    fighters: payload.fighters.length,
    fights: payload.fights.length,
    fightStatsRounds: payload.fightStatsRounds.length,
    fighterRatings: payload.fighterRatings.length,
    opponentStrengthSnapshots: payload.opponentStrengthSnapshots.length,
    amateurResults: payload.amateurResults.length,
    prospectNotes: payload.prospectNotes.length,
    modelFeatures: payload.modelFeatures.length,
    predictions: payload.predictions.length,
    simRuns: payload.simRuns.length,
    backtestResults: payload.backtestResults.length
  };
}

function fighterIdFor(key: string, fighterMap: Map<string, string>) {
  return fighterMap.get(key) ?? stableId("ufcf", key);
}

function fightIdFor(key: string, fightMap: Map<string, string>) {
  return fightMap.get(key) ?? stableId("ufcfi", key);
}

export async function upsertUfcWarehousePayload(raw: unknown) {
  const payload = validateUfcWarehousePayload(raw);
  const fighterMap = new Map<string, string>();
  const fightMap = new Map<string, string>();
  const predictionMap = new Map<string, string>();

  for (const fighter of payload.fighters) {
    const id = fighter.id ?? stableId("ufcf", fighter.externalKey ?? fighter.fullName);
    fighterMap.set(id, id);
    fighterMap.set(fighter.fullName, id);
    if (fighter.externalKey) fighterMap.set(fighter.externalKey, id);
  }

  for (const fight of payload.fights) {
    const id = fight.id ?? stableId("ufcfi", fight.externalFightId ?? `${fight.eventLabel}:${fight.fightDate}`);
    fightMap.set(id, id);
    fightMap.set(fight.eventLabel, id);
    if (fight.externalFightId) fightMap.set(fight.externalFightId, id);
  }

  await prisma.$transaction(async (tx) => {
    for (const fighter of payload.fighters) {
      const id = fighterIdFor(fighter.id ?? fighter.externalKey ?? fighter.fullName, fighterMap);
      await tx.$executeRaw`
        INSERT INTO ufc_fighters (id, external_key, full_name, first_name, last_name, nickname, date_of_birth, stance, height_inches, reach_inches, nationality, combat_base, metadata_json, updated_at)
        VALUES (${id}, ${fighter.externalKey ?? null}, ${fighter.fullName}, ${fighter.firstName ?? null}, ${fighter.lastName ?? null}, ${fighter.nickname ?? null}, ${iso(fighter.dateOfBirth)}, ${fighter.stance ?? null}, ${fighter.heightInches ?? null}, ${fighter.reachInches ?? null}, ${fighter.nationality ?? null}, ${fighter.combatBase ?? null}, ${json(fighter.metadata)}::jsonb, now())
        ON CONFLICT (id) DO UPDATE SET
          external_key = EXCLUDED.external_key,
          full_name = EXCLUDED.full_name,
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          nickname = EXCLUDED.nickname,
          date_of_birth = EXCLUDED.date_of_birth,
          stance = EXCLUDED.stance,
          height_inches = EXCLUDED.height_inches,
          reach_inches = EXCLUDED.reach_inches,
          nationality = EXCLUDED.nationality,
          combat_base = EXCLUDED.combat_base,
          metadata_json = EXCLUDED.metadata_json,
          updated_at = now()
      `;
    }

    for (const fight of payload.fights) {
      const id = fightIdFor(fight.id ?? fight.externalFightId ?? fight.eventLabel, fightMap);
      await tx.$executeRaw`
        INSERT INTO ufc_fights (id, external_fight_id, external_event_id, event_label, fight_date, venue, weight_class, scheduled_rounds, fighter_a_id, fighter_b_id, winner_fighter_id, result_method, result_round, result_time, status, source_key, pre_fight_snapshot_at, metadata_json, updated_at)
        VALUES (${id}, ${fight.externalFightId ?? null}, ${fight.externalEventId ?? null}, ${fight.eventLabel}, ${iso(fight.fightDate)}, ${fight.venue ?? null}, ${fight.weightClass ?? null}, ${fight.scheduledRounds}, ${fighterIdFor(fight.fighterAKey, fighterMap)}, ${fighterIdFor(fight.fighterBKey, fighterMap)}, ${fight.winnerFighterKey ? fighterIdFor(fight.winnerFighterKey, fighterMap) : null}, ${fight.resultMethod ?? null}, ${fight.resultRound ?? null}, ${fight.resultTime ?? null}, ${fight.status}, ${fight.sourceKey}, ${iso(fight.preFightSnapshotAt)}, ${json(fight.metadata)}::jsonb, now())
        ON CONFLICT (id) DO UPDATE SET
          event_label = EXCLUDED.event_label,
          fight_date = EXCLUDED.fight_date,
          venue = EXCLUDED.venue,
          weight_class = EXCLUDED.weight_class,
          scheduled_rounds = EXCLUDED.scheduled_rounds,
          fighter_a_id = EXCLUDED.fighter_a_id,
          fighter_b_id = EXCLUDED.fighter_b_id,
          winner_fighter_id = EXCLUDED.winner_fighter_id,
          result_method = EXCLUDED.result_method,
          result_round = EXCLUDED.result_round,
          result_time = EXCLUDED.result_time,
          status = EXCLUDED.status,
          source_key = EXCLUDED.source_key,
          pre_fight_snapshot_at = EXCLUDED.pre_fight_snapshot_at,
          metadata_json = EXCLUDED.metadata_json,
          updated_at = now()
      `;
    }

    for (const stat of payload.fightStatsRounds) {
      const fightId = fightIdFor(stat.fightKey, fightMap);
      const fighterId = fighterIdFor(stat.fighterKey, fighterMap);
      const id = stat.id ?? stableId("ufcr", `${fightId}:${fighterId}:${stat.roundNumber}`);
      await tx.$executeRaw`
        INSERT INTO ufc_fight_stats_rounds (id, fight_id, fighter_id, opponent_fighter_id, round_number, seconds_fought, knockdowns, sig_strikes_landed, sig_strikes_attempted, sig_strikes_absorbed, total_strikes_landed, total_strikes_attempted, takedowns_landed, takedowns_attempted, submission_attempts, reversals, control_seconds, source_key, stats_json, captured_at, updated_at)
        VALUES (${id}, ${fightId}, ${fighterId}, ${stat.opponentFighterKey ? fighterIdFor(stat.opponentFighterKey, fighterMap) : null}, ${stat.roundNumber}, ${stat.secondsFought ?? null}, ${stat.knockdowns}, ${stat.sigStrikesLanded}, ${stat.sigStrikesAttempted}, ${stat.sigStrikesAbsorbed}, ${stat.totalStrikesLanded}, ${stat.totalStrikesAttempted}, ${stat.takedownsLanded}, ${stat.takedownsAttempted}, ${stat.submissionAttempts}, ${stat.reversals}, ${stat.controlSeconds}, ${stat.sourceKey}, ${json(stat.stats)}::jsonb, ${iso(stat.capturedAt) ?? new Date().toISOString()}, now())
        ON CONFLICT (fight_id, fighter_id, round_number) DO UPDATE SET
          seconds_fought = EXCLUDED.seconds_fought,
          knockdowns = EXCLUDED.knockdowns,
          sig_strikes_landed = EXCLUDED.sig_strikes_landed,
          sig_strikes_attempted = EXCLUDED.sig_strikes_attempted,
          sig_strikes_absorbed = EXCLUDED.sig_strikes_absorbed,
          total_strikes_landed = EXCLUDED.total_strikes_landed,
          total_strikes_attempted = EXCLUDED.total_strikes_attempted,
          takedowns_landed = EXCLUDED.takedowns_landed,
          takedowns_attempted = EXCLUDED.takedowns_attempted,
          submission_attempts = EXCLUDED.submission_attempts,
          reversals = EXCLUDED.reversals,
          control_seconds = EXCLUDED.control_seconds,
          stats_json = EXCLUDED.stats_json,
          updated_at = now()
      `;
    }

    for (const feature of payload.modelFeatures) {
      const id = feature.id ?? stableId("ufcmf", `${feature.fightKey}:${feature.fighterKey}:${feature.modelVersion}`);
      await tx.$executeRaw`
        INSERT INTO ufc_model_features (id, fight_id, fight_date, fighter_id, opponent_fighter_id, snapshot_at, model_version, age, reach_inches, height_inches, stance, weight_class, days_since_last_fight, pro_fights, ufc_fights, rounds_fought, sig_strikes_landed_per_min, sig_strikes_absorbed_per_min, striking_differential, sig_strike_accuracy_pct, sig_strike_defense_pct, knockdowns_per_15, takedowns_per_15, takedown_accuracy_pct, takedown_defense_pct, submission_attempts_per_15, control_time_pct, recent_form_score, finish_rate, late_round_performance, opponent_adjusted_strength, cold_start_active, feature_json, updated_at)
        VALUES (${id}, ${fightIdFor(feature.fightKey, fightMap)}, ${iso(feature.fightDate)}, ${fighterIdFor(feature.fighterKey, fighterMap)}, ${fighterIdFor(feature.opponentFighterKey, fighterMap)}, ${iso(feature.snapshotAt)}, ${feature.modelVersion}, ${feature.age ?? null}, ${feature.reachInches ?? null}, ${feature.heightInches ?? null}, ${feature.stance ?? null}, ${feature.weightClass ?? null}, ${feature.daysSinceLastFight ?? null}, ${feature.proFights ?? null}, ${feature.ufcFights ?? null}, ${feature.roundsFought ?? null}, ${feature.sigStrikesLandedPerMin ?? null}, ${feature.sigStrikesAbsorbedPerMin ?? null}, ${feature.strikingDifferential ?? null}, ${feature.sigStrikeAccuracyPct ?? null}, ${feature.sigStrikeDefensePct ?? null}, ${feature.knockdownsPer15 ?? null}, ${feature.takedownsPer15 ?? null}, ${feature.takedownAccuracyPct ?? null}, ${feature.takedownDefensePct ?? null}, ${feature.submissionAttemptsPer15 ?? null}, ${feature.controlTimePct ?? null}, ${feature.recentFormScore ?? null}, ${feature.finishRate ?? null}, ${feature.lateRoundPerformance ?? null}, ${feature.opponentAdjustedStrength ?? null}, ${feature.coldStartActive}, ${json(feature.feature)}::jsonb, now())
        ON CONFLICT (fight_id, fighter_id, model_version) DO UPDATE SET
          snapshot_at = EXCLUDED.snapshot_at,
          feature_json = EXCLUDED.feature_json,
          cold_start_active = EXCLUDED.cold_start_active,
          updated_at = now()
      `;
    }

    for (const prediction of payload.predictions) {
      const id = prediction.id ?? stableId("ufcp", `${prediction.fightKey}:${prediction.modelVersion}:${prediction.generatedAt}`);
      predictionMap.set(id, id);
      predictionMap.set(`${prediction.fightKey}:${prediction.modelVersion}:${prediction.generatedAt}`, id);
      await tx.$executeRaw`
        INSERT INTO ufc_predictions (id, fight_id, model_version, generated_at, fighter_a_id, fighter_b_id, fighter_a_win_probability, fighter_b_win_probability, pick_fighter_id, fair_odds_american, sportsbook_odds_american, edge_pct, ko_tko_probability, submission_probability, decision_probability, round_finish_distribution_json, confidence_grade, data_quality_grade, path_to_victory_json, danger_flags_json, prediction_json, updated_at)
        VALUES (${id}, ${fightIdFor(prediction.fightKey, fightMap)}, ${prediction.modelVersion}, ${iso(prediction.generatedAt)}, ${fighterIdFor(prediction.fighterAKey, fighterMap)}, ${fighterIdFor(prediction.fighterBKey, fighterMap)}, ${prediction.fighterAWinProbability}, ${prediction.fighterBWinProbability}, ${prediction.pickFighterKey ? fighterIdFor(prediction.pickFighterKey, fighterMap) : null}, ${prediction.fairOddsAmerican ?? null}, ${prediction.sportsbookOddsAmerican ?? null}, ${prediction.edgePct ?? null}, ${prediction.koTkoProbability ?? null}, ${prediction.submissionProbability ?? null}, ${prediction.decisionProbability ?? null}, ${json(prediction.roundFinishDistribution)}::jsonb, ${prediction.confidenceGrade ?? null}, ${prediction.dataQualityGrade ?? null}, ${json(prediction.pathToVictory)}::jsonb, ${json(prediction.dangerFlags)}::jsonb, ${json(prediction.prediction)}::jsonb, now())
        ON CONFLICT (fight_id, model_version, generated_at) DO UPDATE SET
          fighter_a_win_probability = EXCLUDED.fighter_a_win_probability,
          fighter_b_win_probability = EXCLUDED.fighter_b_win_probability,
          pick_fighter_id = EXCLUDED.pick_fighter_id,
          edge_pct = EXCLUDED.edge_pct,
          prediction_json = EXCLUDED.prediction_json,
          updated_at = now()
      `;
    }

    for (const run of payload.simRuns) {
      const id = run.id ?? stableId("ufcsr", `${run.fightKey}:${run.modelVersion}:${run.seed}:${run.simulationCount}`);
      await tx.$executeRaw`
        INSERT INTO ufc_sim_runs (id, prediction_id, fight_id, model_version, seed, simulation_count, started_at, completed_at, cache_key, status, result_json, updated_at)
        VALUES (${id}, ${run.predictionKey ? predictionMap.get(run.predictionKey) ?? run.predictionKey : null}, ${fightIdFor(run.fightKey, fightMap)}, ${run.modelVersion}, ${run.seed}, ${run.simulationCount}, ${iso(run.startedAt) ?? new Date().toISOString()}, ${iso(run.completedAt)}, ${run.cacheKey ?? null}, ${run.status}, ${json(run.result)}::jsonb, now())
        ON CONFLICT (id) DO UPDATE SET
          completed_at = EXCLUDED.completed_at,
          status = EXCLUDED.status,
          result_json = EXCLUDED.result_json,
          updated_at = now()
      `;
    }

    for (const rating of payload.fighterRatings) {
      const id = rating.id ?? stableId("ufcrtg", `${rating.fighterKey}:${rating.fightKey ?? rating.asOf}:${rating.ratingSystem}`);
      await tx.$executeRaw`
        INSERT INTO ufc_fighter_ratings (id, fighter_id, fight_id, opponent_fighter_id, rating_system, as_of, pre_fight_rating, post_fight_rating, volatility, k_factor, expected_win_probability, actual_result, source_key, metadata_json, updated_at)
        VALUES (${id}, ${fighterIdFor(rating.fighterKey, fighterMap)}, ${rating.fightKey ? fightIdFor(rating.fightKey, fightMap) : null}, ${rating.opponentFighterKey ? fighterIdFor(rating.opponentFighterKey, fighterMap) : null}, ${rating.ratingSystem}, ${iso(rating.asOf)}, ${rating.preFightRating}, ${rating.postFightRating ?? null}, ${rating.volatility ?? null}, ${rating.kFactor ?? null}, ${rating.expectedWinProbability ?? null}, ${rating.actualResult ?? null}, ${rating.sourceKey}, ${json(rating.metadata)}::jsonb, now())
        ON CONFLICT (id) DO UPDATE SET post_fight_rating = EXCLUDED.post_fight_rating, metadata_json = EXCLUDED.metadata_json, updated_at = now()
      `;
    }

    for (const snapshot of payload.opponentStrengthSnapshots) {
      const id = snapshot.id ?? stableId("ufcos", `${snapshot.fighterKey}:${snapshot.asOf}:${snapshot.sourceKey}`);
      await tx.$executeRaw`
        INSERT INTO ufc_opponent_strength_snapshots (id, fighter_id, as_of, fights_included, avg_opponent_rating, opponent_strength_score, ufc_record_json, pro_record_json, source_key, metadata_json, updated_at)
        VALUES (${id}, ${fighterIdFor(snapshot.fighterKey, fighterMap)}, ${iso(snapshot.asOf)}, ${snapshot.fightsIncluded}, ${snapshot.avgOpponentRating ?? null}, ${snapshot.opponentStrengthScore ?? null}, ${json(snapshot.ufcRecord)}::jsonb, ${json(snapshot.proRecord)}::jsonb, ${snapshot.sourceKey}, ${json(snapshot.metadata)}::jsonb, now())
        ON CONFLICT (fighter_id, as_of, source_key) DO UPDATE SET fights_included = EXCLUDED.fights_included, opponent_strength_score = EXCLUDED.opponent_strength_score, metadata_json = EXCLUDED.metadata_json, updated_at = now()
      `;
    }

    for (const amateur of payload.amateurResults) {
      const id = amateur.id ?? stableId("ufcam", amateur.externalResultId ?? `${amateur.fighterKey}:${amateur.resultDate}:${amateur.opponentName}`);
      await tx.$executeRaw`
        INSERT INTO ufc_amateur_results (id, fighter_id, external_result_id, result_date, opponent_name, result, method, result_round, promotion, promotion_tier, opponent_strength_score, source_key, metadata_json, updated_at)
        VALUES (${id}, ${fighterIdFor(amateur.fighterKey, fighterMap)}, ${amateur.externalResultId ?? null}, ${iso(amateur.resultDate)}, ${amateur.opponentName ?? null}, ${amateur.result ?? null}, ${amateur.method ?? null}, ${amateur.resultRound ?? null}, ${amateur.promotion ?? null}, ${amateur.promotionTier ?? null}, ${amateur.opponentStrengthScore ?? null}, ${amateur.sourceKey}, ${json(amateur.metadata)}::jsonb, now())
        ON CONFLICT (id) DO UPDATE SET result = EXCLUDED.result, method = EXCLUDED.method, metadata_json = EXCLUDED.metadata_json, updated_at = now()
      `;
    }

    for (const note of payload.prospectNotes) {
      const id = note.id ?? stableId("ufcpn", `${note.fighterKey}:${note.noteDate ?? "now"}:${note.note}`);
      await tx.$executeRaw`
        INSERT INTO ufc_prospect_notes (id, fighter_id, note_date, author, combat_base, promotion_tier, confidence_cap, tags_json, note, source_key, metadata_json, updated_at)
        VALUES (${id}, ${fighterIdFor(note.fighterKey, fighterMap)}, ${iso(note.noteDate) ?? new Date().toISOString()}, ${note.author ?? null}, ${note.combatBase ?? null}, ${note.promotionTier ?? null}, ${note.confidenceCap ?? null}, ${json(note.tags)}::jsonb, ${note.note}, ${note.sourceKey}, ${json(note.metadata)}::jsonb, now())
        ON CONFLICT (id) DO UPDATE SET note = EXCLUDED.note, tags_json = EXCLUDED.tags_json, metadata_json = EXCLUDED.metadata_json, updated_at = now()
      `;
    }

    for (const backtest of payload.backtestResults) {
      const id = backtest.id ?? stableId("ufcbt", `${backtest.modelVersion}:${backtest.backtestName}:${backtest.foldNumber}`);
      await tx.$executeRaw`
        INSERT INTO ufc_backtest_results (id, model_version, backtest_name, fold_number, train_start_date, train_end_date, test_start_date, test_end_date, fights_train_count, fights_test_count, log_loss, brier_score, calibration_error, roi_pct, clv_pct, metrics_json, updated_at)
        VALUES (${id}, ${backtest.modelVersion}, ${backtest.backtestName}, ${backtest.foldNumber}, ${iso(backtest.trainStartDate)}, ${iso(backtest.trainEndDate)}, ${iso(backtest.testStartDate)}, ${iso(backtest.testEndDate)}, ${backtest.fightsTrainCount}, ${backtest.fightsTestCount}, ${backtest.logLoss ?? null}, ${backtest.brierScore ?? null}, ${backtest.calibrationError ?? null}, ${backtest.roiPct ?? null}, ${backtest.clvPct ?? null}, ${json(backtest.metrics)}::jsonb, now())
        ON CONFLICT (model_version, backtest_name, fold_number) DO UPDATE SET metrics_json = EXCLUDED.metrics_json, updated_at = now()
      `;
    }
  });

  return {
    ok: true,
    summary: summarizeUfcWarehousePayload(payload)
  };
}
