import crypto from "node:crypto";

import { prisma } from "@/lib/db/prisma";
import { americanOddsToImpliedProbability, probabilityToAmericanOdds } from "@/services/ufc/fight-iq";
import { buildUfcFighterSkillProfile, type UfcModelFeatureSnapshot } from "@/services/ufc/fighter-skill-profile";
import { runUfcSkillMarkovSim } from "@/services/ufc/skill-markov-sim";

export type UfcOperationalSimOptions = {
  modelVersion?: string;
  simulations?: number;
  seed?: number;
  recordShadow?: boolean;
  marketOddsAOpen?: number | null;
  marketOddsBOpen?: number | null;
  marketOddsAClose?: number | null;
  marketOddsBClose?: number | null;
};

export type UfcOperationalSimResult = {
  fightId: string;
  modelVersion: string;
  simulations: number;
  predictionId: string;
  shadowPredictionId: string | null;
  fighterAWinProbability: number;
  fighterBWinProbability: number;
  pickFighterId: string;
  fairOddsAmerican: number;
  edgePct: number | null;
  dataQualityGrade: string;
  confidenceGrade: string;
  methodProbabilities: { KO_TKO: number; SUBMISSION: number; DECISION: number };
  roundFinishProbabilities: Record<string, number>;
  transitionProbabilities: Record<string, number>;
  pathSummary: string[];
};

type WarehouseFight = {
  id: string;
  event_label: string;
  fight_date: Date | string;
  scheduled_rounds: number;
  fighter_a_id: string;
  fighter_b_id: string;
};

type WarehouseFeature = {
  fight_id: string;
  fight_date: Date | string;
  fighter_id: string;
  opponent_fighter_id: string;
  snapshot_at: Date | string;
  model_version: string;
  pro_fights: number | null;
  ufc_fights: number | null;
  rounds_fought: number | null;
  sig_strikes_landed_per_min: number | null;
  sig_strikes_absorbed_per_min: number | null;
  striking_differential: number | null;
  takedowns_per_15: number | null;
  takedown_defense_pct: number | null;
  submission_attempts_per_15: number | null;
  control_time_pct: number | null;
  opponent_adjusted_strength: number | null;
  cold_start_active: boolean;
  feature_json: Record<string, unknown> | null;
};

const DEFAULT_MODEL_VERSION = "ufc-fight-iq-v1";
const DEFAULT_SIMULATIONS = 25_000;

function stableId(prefix: string, value: string) {
  return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function gradeRank(grade: string) {
  if (grade === "A") return 4;
  if (grade === "B") return 3;
  if (grade === "C") return 2;
  return 1;
}

function weakerGrade(left: string, right: string) {
  return gradeRank(left) <= gradeRank(right) ? left : right;
}

function confidenceGrade(probability: number, dataQuality: string, coldStart: boolean) {
  if (coldStart) return "LOW";
  const gap = Math.abs(probability - 0.5);
  if (gap >= 0.18 && gradeRank(dataQuality) >= 3) return "HIGH";
  if (gap >= 0.12 && gradeRank(dataQuality) >= 2) return "MEDIUM_HIGH";
  if (gap >= 0.07) return "MEDIUM";
  return "LOW";
}

function toFeatureSnapshot(row: WarehouseFeature): UfcModelFeatureSnapshot {
  return {
    fightId: row.fight_id,
    fightDate: toIso(row.fight_date),
    fighterId: row.fighter_id,
    opponentFighterId: row.opponent_fighter_id,
    snapshotAt: toIso(row.snapshot_at),
    modelVersion: row.model_version,
    proFights: row.pro_fights,
    ufcFights: row.ufc_fights,
    roundsFought: row.rounds_fought,
    sigStrikesLandedPerMin: row.sig_strikes_landed_per_min,
    sigStrikesAbsorbedPerMin: row.sig_strikes_absorbed_per_min,
    strikingDifferential: row.striking_differential,
    takedownsPer15: row.takedowns_per_15,
    takedownDefensePct: row.takedown_defense_pct,
    submissionAttemptsPer15: row.submission_attempts_per_15,
    controlTimePct: row.control_time_pct,
    opponentAdjustedStrength: row.opponent_adjusted_strength,
    coldStartActive: row.cold_start_active,
    feature: row.feature_json ?? {}
  };
}

export function calculateUfcEdgePct(winProbability: number, marketOddsAmerican: number | null | undefined) {
  const implied = americanOddsToImpliedProbability(marketOddsAmerican);
  if (implied == null) return null;
  return round((winProbability - implied) * 100, 2);
}

export async function runUfcOperationalSkillSim(fightId: string, options: UfcOperationalSimOptions = {}): Promise<UfcOperationalSimResult> {
  const modelVersion = options.modelVersion ?? DEFAULT_MODEL_VERSION;
  const simulations = options.simulations ?? DEFAULT_SIMULATIONS;
  const seed = options.seed ?? Number.parseInt(crypto.createHash("sha256").update(fightId).digest("hex").slice(0, 8), 16);

  const fights = await prisma.$queryRaw<WarehouseFight[]>`
    SELECT id, event_label, fight_date, scheduled_rounds, fighter_a_id, fighter_b_id
    FROM ufc_fights WHERE id = ${fightId} LIMIT 1
  `;
  const fight = fights[0];
  if (!fight) throw new Error(`UFC operational sim missing fight: ${fightId}`);

  const features = await prisma.$queryRaw<WarehouseFeature[]>`
    SELECT fight_id, fight_date, fighter_id, opponent_fighter_id, snapshot_at, model_version,
      pro_fights, ufc_fights, rounds_fought, sig_strikes_landed_per_min, sig_strikes_absorbed_per_min,
      striking_differential, takedowns_per_15, takedown_defense_pct, submission_attempts_per_15,
      control_time_pct, opponent_adjusted_strength, cold_start_active, feature_json
    FROM ufc_model_features
    WHERE fight_id = ${fightId} AND model_version = ${modelVersion} AND snapshot_at <= fight_date
    ORDER BY snapshot_at DESC
  `;

  const aFeature = features.find((feature) => feature.fighter_id === fight.fighter_a_id);
  const bFeature = features.find((feature) => feature.fighter_id === fight.fighter_b_id);
  if (!aFeature || !bFeature) throw new Error(`UFC operational sim missing two pre-fight feature snapshots for ${fightId}:${modelVersion}`);

  const aProfile = buildUfcFighterSkillProfile({ feature: toFeatureSnapshot(aFeature) });
  const bProfile = buildUfcFighterSkillProfile({ feature: toFeatureSnapshot(bFeature) });
  const sim = runUfcSkillMarkovSim(aProfile, bProfile, { simulations, seed, scheduledRounds: fight.scheduled_rounds === 5 ? 5 : 3 });

  const pickFighterId = sim.fighterAWinProbability >= sim.fighterBWinProbability ? fight.fighter_a_id : fight.fighter_b_id;
  const pickProbability = Math.max(sim.fighterAWinProbability, sim.fighterBWinProbability);
  const pickMarketOdds = pickFighterId === fight.fighter_a_id ? options.marketOddsAClose ?? options.marketOddsAOpen : options.marketOddsBClose ?? options.marketOddsBOpen;
  const edgePct = calculateUfcEdgePct(pickProbability, pickMarketOdds);
  const dataQualityGrade = weakerGrade(aProfile.sampleQuality, bProfile.sampleQuality);
  const confidence = confidenceGrade(pickProbability, dataQualityGrade, aProfile.prospect.coldStartActive || bProfile.prospect.coldStartActive);
  const predictionId = stableId("ufcp", `${fightId}:${modelVersion}:${seed}:${simulations}`);

  await prisma.$executeRaw`
    INSERT INTO ufc_predictions (id, fight_id, model_version, generated_at, fighter_a_id, fighter_b_id, fighter_a_win_probability, fighter_b_win_probability, pick_fighter_id, fair_odds_american, sportsbook_odds_american, edge_pct, ko_tko_probability, submission_probability, decision_probability, prediction_json, updated_at)
    VALUES (${predictionId}, ${fightId}, ${modelVersion}, now(), ${fight.fighter_a_id}, ${fight.fighter_b_id}, ${sim.fighterAWinProbability}, ${sim.fighterBWinProbability}, ${pickFighterId}, ${probabilityToAmericanOdds(pickProbability)}, ${pickMarketOdds ?? null}, ${edgePct}, ${sim.methodProbabilities.KO_TKO}, ${sim.methodProbabilities.SUBMISSION}, ${sim.methodProbabilities.DECISION}, ${JSON.stringify(sim)}::jsonb, now())
    ON CONFLICT (id) DO UPDATE SET fighter_a_win_probability = EXCLUDED.fighter_a_win_probability, fighter_b_win_probability = EXCLUDED.fighter_b_win_probability, pick_fighter_id = EXCLUDED.pick_fighter_id, prediction_json = EXCLUDED.prediction_json, updated_at = now()
  `;

  const simRunId = stableId("ufcsr", `${predictionId}:${seed}:${simulations}`);
  await prisma.$executeRaw`
    INSERT INTO ufc_sim_runs (id, prediction_id, fight_id, model_version, seed, simulation_count, completed_at, cache_key, status, result_json, updated_at)
    VALUES (${simRunId}, ${predictionId}, ${fightId}, ${modelVersion}, ${seed}, ${simulations}, now(), ${`ufc:${fightId}:${modelVersion}:${seed}:${simulations}`}, 'COMPLETED', ${JSON.stringify(sim)}::jsonb, now())
    ON CONFLICT (id) DO UPDATE SET completed_at = EXCLUDED.completed_at, status = EXCLUDED.status, result_json = EXCLUDED.result_json, updated_at = now()
  `;

  let shadowPredictionId: string | null = null;
  if (options.recordShadow) {
    shadowPredictionId = stableId("ufcsh", `${predictionId}:shadow`);
    await prisma.$executeRaw`
      INSERT INTO ufc_shadow_predictions (id, fight_id, prediction_id, model_version, recorded_at, market_odds_a_open, market_odds_b_open, market_odds_a_close, market_odds_b_close, fighter_a_win_probability, fighter_b_win_probability, pick_fighter_id, data_quality_grade, confidence_grade, status, payload_json, updated_at)
      VALUES (${shadowPredictionId}, ${fightId}, ${predictionId}, ${modelVersion}, now(), ${options.marketOddsAOpen ?? null}, ${options.marketOddsBOpen ?? null}, ${options.marketOddsAClose ?? null}, ${options.marketOddsBClose ?? null}, ${sim.fighterAWinProbability}, ${sim.fighterBWinProbability}, ${pickFighterId}, ${dataQualityGrade}, ${confidence}, 'PENDING', ${JSON.stringify({ sim, pathSummary: sim.pathSummary })}::jsonb, now())
      ON CONFLICT (id) DO UPDATE SET fighter_a_win_probability = EXCLUDED.fighter_a_win_probability, fighter_b_win_probability = EXCLUDED.fighter_b_win_probability, payload_json = EXCLUDED.payload_json, updated_at = now()
    `;
  }

  return {
    fightId,
    modelVersion,
    simulations,
    predictionId,
    shadowPredictionId,
    fighterAWinProbability: sim.fighterAWinProbability,
    fighterBWinProbability: sim.fighterBWinProbability,
    pickFighterId,
    fairOddsAmerican: probabilityToAmericanOdds(pickProbability),
    edgePct,
    dataQualityGrade,
    confidenceGrade: confidence,
    methodProbabilities: sim.methodProbabilities,
    roundFinishProbabilities: sim.roundFinishProbabilities,
    transitionProbabilities: sim.transitionProbabilities,
    pathSummary: sim.pathSummary
  };
}
