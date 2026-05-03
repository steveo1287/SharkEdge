import crypto from "node:crypto";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";

const jsonRecord = z.record(z.string(), z.unknown()).default({});

const fighterSchema = z.object({
  id: z.string().optional(),
  externalKey: z.string().optional(),
  fullName: z.string().min(1),
  stance: z.string().optional().nullable(),
  heightInches: z.number().optional().nullable(),
  reachInches: z.number().optional().nullable(),
  combatBase: z.string().optional().nullable(),
  payload: jsonRecord.optional()
});

const fightSchema = z.object({
  id: z.string().optional(),
  externalFightId: z.string().optional(),
  eventLabel: z.string().min(1),
  fightDate: z.string(),
  weightClass: z.string().optional().nullable(),
  scheduledRounds: z.union([z.literal(3), z.literal(5)]).default(3),
  fighterAKey: z.string().min(1),
  fighterBKey: z.string().min(1),
  winnerFighterKey: z.string().optional().nullable(),
  status: z.string().default("SCHEDULED"),
  preFightSnapshotAt: z.string().optional().nullable(),
  payload: jsonRecord.optional()
});

const modelFeatureSchema = z.object({
  id: z.string().optional(),
  fightKey: z.string().min(1),
  fightDate: z.string(),
  fighterKey: z.string().min(1),
  opponentFighterKey: z.string().min(1),
  snapshotAt: z.string(),
  modelVersion: z.string().min(1),
  proFights: z.number().int().optional().nullable(),
  ufcFights: z.number().int().optional().nullable(),
  roundsFought: z.number().optional().nullable(),
  sigStrikesLandedPerMin: z.number().optional().nullable(),
  sigStrikesAbsorbedPerMin: z.number().optional().nullable(),
  strikingDifferential: z.number().optional().nullable(),
  takedownsPer15: z.number().optional().nullable(),
  takedownDefensePct: z.number().optional().nullable(),
  submissionAttemptsPer15: z.number().optional().nullable(),
  controlTimePct: z.number().optional().nullable(),
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
  prediction: jsonRecord.optional()
});

const backtestSchema = z.object({
  id: z.string().optional(),
  modelVersion: z.string().min(1),
  backtestName: z.string().min(1),
  foldNumber: z.number().int().min(1),
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

const simRunSchema = z.object({
  id: z.string().optional(),
  fightKey: z.string().min(1),
  predictionKey: z.string().optional().nullable(),
  modelVersion: z.string().min(1),
  seed: z.number().int(),
  simulationCount: z.number().int().min(1).default(25000),
  completedAt: z.string().optional().nullable(),
  cacheKey: z.string().optional().nullable(),
  status: z.string().default("COMPLETED"),
  result: jsonRecord.optional()
});

export const ufcWarehousePayloadSchema = z.object({
  fighters: z.array(fighterSchema).default([]),
  fights: z.array(fightSchema).default([]),
  fightStatsRounds: z.array(z.record(z.string(), z.unknown())).default([]),
  fighterRatings: z.array(z.record(z.string(), z.unknown())).default([]),
  opponentStrengthSnapshots: z.array(z.record(z.string(), z.unknown())).default([]),
  amateurResults: z.array(z.record(z.string(), z.unknown())).default([]),
  prospectNotes: z.array(z.record(z.string(), z.unknown())).default([]),
  modelFeatures: z.array(modelFeatureSchema).default([]),
  predictions: z.array(predictionSchema).default([]),
  simRuns: z.array(simRunSchema).default([]),
  backtestResults: z.array(backtestSchema).default([])
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

function assertNoFutureSnapshot(snapshotAt: string | null | undefined, fightDate: string | null | undefined, label: string) {
  if (!snapshotAt || !fightDate) return;
  const snapshot = new Date(snapshotAt).getTime();
  const fight = new Date(fightDate).getTime();
  if (Number.isNaN(snapshot) || Number.isNaN(fight)) return;
  if (snapshot > fight) throw new Error(`${label} has future-data leakage: snapshotAt must be at or before fightDate.`);
}

export function validateUfcWarehousePayload(raw: unknown) {
  const payload = ufcWarehousePayloadSchema.parse(raw);
  for (const fight of payload.fights) {
    if (fight.fighterAKey === fight.fighterBKey) throw new Error(`${fight.eventLabel} has identical fighter keys.`);
    assertNoFutureSnapshot(fight.preFightSnapshotAt, fight.fightDate, `Fight ${fight.eventLabel}`);
  }
  for (const feature of payload.modelFeatures) {
    assertNoFutureSnapshot(feature.snapshotAt, feature.fightDate, `Feature ${feature.fightKey}:${feature.fighterKey}`);
  }
  for (const prediction of payload.predictions) {
    if (Math.abs(prediction.fighterAWinProbability + prediction.fighterBWinProbability - 1) > 0.0001) {
      throw new Error(`Prediction ${prediction.fightKey}:${prediction.modelVersion} probabilities must sum to 1.`);
    }
  }
  for (const backtest of payload.backtestResults) {
    if (!(new Date(backtest.trainEndDate).getTime() < new Date(backtest.testStartDate).getTime())) {
      throw new Error(`Backtest ${backtest.backtestName} fold ${backtest.foldNumber} must be walk-forward.`);
    }
  }
  return payload;
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

function json(value: unknown) {
  return JSON.stringify(value ?? {});
}

export async function upsertUfcWarehousePayload(raw: unknown) {
  const payload = validateUfcWarehousePayload(raw);
  const fighterIds = new Map<string, string>();
  const fightIds = new Map<string, string>();
  const predictionIds = new Map<string, string>();

  for (const fighter of payload.fighters) {
    const id = fighter.id ?? stableId("ufcf", fighter.externalKey ?? fighter.fullName);
    fighterIds.set(id, id);
    fighterIds.set(fighter.fullName, id);
    if (fighter.externalKey) fighterIds.set(fighter.externalKey, id);
  }
  for (const fight of payload.fights) {
    const id = fight.id ?? stableId("ufcfi", fight.externalFightId ?? `${fight.eventLabel}:${fight.fightDate}`);
    fightIds.set(id, id);
    fightIds.set(fight.eventLabel, id);
    if (fight.externalFightId) fightIds.set(fight.externalFightId, id);
  }
  const fighterIdFor = (key: string) => fighterIds.get(key) ?? stableId("ufcf", key);
  const fightIdFor = (key: string) => fightIds.get(key) ?? stableId("ufcfi", key);

  await prisma.$transaction(async (tx) => {
    for (const fighter of payload.fighters) {
      const id = fighterIdFor(fighter.id ?? fighter.externalKey ?? fighter.fullName);
      await tx.$executeRaw`
        INSERT INTO ufc_fighters (id, external_key, full_name, stance, height_inches, reach_inches, combat_base, payload_json, updated_at)
        VALUES (${id}, ${fighter.externalKey ?? null}, ${fighter.fullName}, ${fighter.stance ?? null}, ${fighter.heightInches ?? null}, ${fighter.reachInches ?? null}, ${fighter.combatBase ?? null}, ${json(fighter.payload)}::jsonb, now())
        ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, stance = EXCLUDED.stance, height_inches = EXCLUDED.height_inches, reach_inches = EXCLUDED.reach_inches, combat_base = EXCLUDED.combat_base, payload_json = EXCLUDED.payload_json, updated_at = now()
      `;
    }
    for (const fight of payload.fights) {
      const id = fightIdFor(fight.id ?? fight.externalFightId ?? fight.eventLabel);
      await tx.$executeRaw`
        INSERT INTO ufc_fights (id, external_fight_id, event_label, fight_date, weight_class, scheduled_rounds, fighter_a_id, fighter_b_id, winner_fighter_id, status, pre_fight_snapshot_at, payload_json, updated_at)
        VALUES (${id}, ${fight.externalFightId ?? null}, ${fight.eventLabel}, ${iso(fight.fightDate)}, ${fight.weightClass ?? null}, ${fight.scheduledRounds}, ${fighterIdFor(fight.fighterAKey)}, ${fighterIdFor(fight.fighterBKey)}, ${fight.winnerFighterKey ? fighterIdFor(fight.winnerFighterKey) : null}, ${fight.status}, ${iso(fight.preFightSnapshotAt)}, ${json(fight.payload)}::jsonb, now())
        ON CONFLICT (id) DO UPDATE SET event_label = EXCLUDED.event_label, fight_date = EXCLUDED.fight_date, weight_class = EXCLUDED.weight_class, scheduled_rounds = EXCLUDED.scheduled_rounds, winner_fighter_id = EXCLUDED.winner_fighter_id, status = EXCLUDED.status, pre_fight_snapshot_at = EXCLUDED.pre_fight_snapshot_at, payload_json = EXCLUDED.payload_json, updated_at = now()
      `;
    }
    for (const feature of payload.modelFeatures) {
      const id = feature.id ?? stableId("ufcmf", `${feature.fightKey}:${feature.fighterKey}:${feature.modelVersion}`);
      await tx.$executeRaw`
        INSERT INTO ufc_model_features (id, fight_id, fight_date, fighter_id, opponent_fighter_id, snapshot_at, model_version, pro_fights, ufc_fights, rounds_fought, sig_strikes_landed_per_min, sig_strikes_absorbed_per_min, striking_differential, takedowns_per_15, takedown_defense_pct, submission_attempts_per_15, control_time_pct, opponent_adjusted_strength, cold_start_active, feature_json, updated_at)
        VALUES (${id}, ${fightIdFor(feature.fightKey)}, ${iso(feature.fightDate)}, ${fighterIdFor(feature.fighterKey)}, ${fighterIdFor(feature.opponentFighterKey)}, ${iso(feature.snapshotAt)}, ${feature.modelVersion}, ${feature.proFights ?? null}, ${feature.ufcFights ?? null}, ${feature.roundsFought ?? null}, ${feature.sigStrikesLandedPerMin ?? null}, ${feature.sigStrikesAbsorbedPerMin ?? null}, ${feature.strikingDifferential ?? null}, ${feature.takedownsPer15 ?? null}, ${feature.takedownDefensePct ?? null}, ${feature.submissionAttemptsPer15 ?? null}, ${feature.controlTimePct ?? null}, ${feature.opponentAdjustedStrength ?? null}, ${feature.coldStartActive}, ${json(feature.feature)}::jsonb, now())
        ON CONFLICT (fight_id, fighter_id, model_version) DO UPDATE SET snapshot_at = EXCLUDED.snapshot_at, feature_json = EXCLUDED.feature_json, cold_start_active = EXCLUDED.cold_start_active, updated_at = now()
      `;
    }
    for (const prediction of payload.predictions) {
      const id = prediction.id ?? stableId("ufcp", `${prediction.fightKey}:${prediction.modelVersion}:${prediction.generatedAt}`);
      predictionIds.set(`${prediction.fightKey}:${prediction.modelVersion}:${prediction.generatedAt}`, id);
      await tx.$executeRaw`
        INSERT INTO ufc_predictions (id, fight_id, model_version, generated_at, fighter_a_id, fighter_b_id, fighter_a_win_probability, fighter_b_win_probability, pick_fighter_id, fair_odds_american, sportsbook_odds_american, edge_pct, ko_tko_probability, submission_probability, decision_probability, prediction_json, updated_at)
        VALUES (${id}, ${fightIdFor(prediction.fightKey)}, ${prediction.modelVersion}, ${iso(prediction.generatedAt)}, ${fighterIdFor(prediction.fighterAKey)}, ${fighterIdFor(prediction.fighterBKey)}, ${prediction.fighterAWinProbability}, ${prediction.fighterBWinProbability}, ${prediction.pickFighterKey ? fighterIdFor(prediction.pickFighterKey) : null}, ${prediction.fairOddsAmerican ?? null}, ${prediction.sportsbookOddsAmerican ?? null}, ${prediction.edgePct ?? null}, ${prediction.koTkoProbability ?? null}, ${prediction.submissionProbability ?? null}, ${prediction.decisionProbability ?? null}, ${json(prediction.prediction)}::jsonb, now())
        ON CONFLICT (fight_id, model_version, generated_at) DO UPDATE SET fighter_a_win_probability = EXCLUDED.fighter_a_win_probability, fighter_b_win_probability = EXCLUDED.fighter_b_win_probability, pick_fighter_id = EXCLUDED.pick_fighter_id, prediction_json = EXCLUDED.prediction_json, updated_at = now()
      `;
    }
    for (const run of payload.simRuns) {
      const id = run.id ?? stableId("ufcsr", `${run.fightKey}:${run.modelVersion}:${run.seed}:${run.simulationCount}`);
      await tx.$executeRaw`
        INSERT INTO ufc_sim_runs (id, prediction_id, fight_id, model_version, seed, simulation_count, completed_at, cache_key, status, result_json, updated_at)
        VALUES (${id}, ${run.predictionKey ? predictionIds.get(run.predictionKey) ?? run.predictionKey : null}, ${fightIdFor(run.fightKey)}, ${run.modelVersion}, ${run.seed}, ${run.simulationCount}, ${iso(run.completedAt)}, ${run.cacheKey ?? null}, ${run.status}, ${json(run.result)}::jsonb, now())
        ON CONFLICT (id) DO UPDATE SET completed_at = EXCLUDED.completed_at, status = EXCLUDED.status, result_json = EXCLUDED.result_json, updated_at = now()
      `;
    }
    for (const backtest of payload.backtestResults) {
      const id = backtest.id ?? stableId("ufcbt", `${backtest.modelVersion}:${backtest.backtestName}:${backtest.foldNumber}`);
      await tx.$executeRaw`
        INSERT INTO ufc_backtest_results (id, model_version, backtest_name, fold_number, train_end_date, test_start_date, test_end_date, fights_train_count, fights_test_count, log_loss, brier_score, calibration_error, roi_pct, clv_pct, metrics_json, updated_at)
        VALUES (${id}, ${backtest.modelVersion}, ${backtest.backtestName}, ${backtest.foldNumber}, ${iso(backtest.trainEndDate)}, ${iso(backtest.testStartDate)}, ${iso(backtest.testEndDate)}, ${backtest.fightsTrainCount}, ${backtest.fightsTestCount}, ${backtest.logLoss ?? null}, ${backtest.brierScore ?? null}, ${backtest.calibrationError ?? null}, ${backtest.roiPct ?? null}, ${backtest.clvPct ?? null}, ${json(backtest.metrics)}::jsonb, now())
        ON CONFLICT (model_version, backtest_name, fold_number) DO UPDATE SET metrics_json = EXCLUDED.metrics_json, updated_at = now()
      `;
    }
  });

  return { ok: true, summary: summarizeUfcWarehousePayload(payload) };
}
