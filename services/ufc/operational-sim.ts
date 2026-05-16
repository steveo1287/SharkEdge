import crypto from "node:crypto";

import { prisma } from "@/lib/db/prisma";
import { getProfileFeatureSignalReport, type MmaProfileFeatureSignal } from "@/services/simulation/profile-feature-signals";
import { runUfcEnsembleSimFromFeatures } from "@/services/ufc/ensemble-sim";
import { resolveUfcEnsembleWeights, type UfcResolvedEnsembleWeights } from "@/services/ufc/ensemble-weight-store";
import { probabilityToAmericanOdds } from "@/services/ufc/fight-iq";
import { buildUfcFighterSkillProfile, type UfcModelFeatureSnapshot } from "@/services/ufc/fighter-skill-profile";
import { evaluateUfcMarketAwareFairProbability, type UfcMarketAwareFairProbability } from "@/services/ufc/market-aware-fair-probability";
import { applyUfcMethodCalibration, buildUfcPromotionGate, getUfcMethodCalibration, type UfcMethodCalibration, type UfcPromotionGate } from "@/services/ufc/method-calibration-gate";
import { applyPayloadPriorsToUfcFeature, enrichedPriorPathSummary, type UfcPriorBridgeResult } from "@/services/ufc/profile-prior-sim-bridge";
import { auditUfcSimInputs, type UfcSimInputAudit } from "@/services/ufc/sim-input-audit";

export type UfcOperationalSimOptions = {
  modelVersion?: string;
  simulations?: number;
  seed?: number;
  recordShadow?: boolean;
  marketOddsAOpen?: number | null;
  marketOddsBOpen?: number | null;
  marketOddsAClose?: number | null;
  marketOddsBClose?: number | null;
  skillMarkovWeight?: number | null;
  exchangeMonteCarloWeight?: number | null;
  roundByRoundWeight?: number | null;
};

export type UfcOperationalSimResult = {
  fightId: string;
  modelVersion: string;
  simulations: number;
  predictionId: string;
  shadowPredictionId: string | null;
  fighterAWinProbability: number;
  fighterBWinProbability: number;
  rawFighterAWinProbability: number;
  rawFighterBWinProbability: number;
  pickFighterId: string;
  fairOddsAmerican: number;
  edgePct: number | null;
  marketAware: UfcMarketAwareFairProbability;
  simInputAudit: UfcSimInputAudit;
  dataQualityGrade: string;
  confidenceGrade: string;
  confidenceGradeBeforeProfileCap: string;
  profileFeatureSignal: MmaProfileFeatureSignal | null;
  enrichedPriorBridge: {
    fighterA: Omit<UfcPriorBridgeResult, "feature">;
    fighterB: Omit<UfcPriorBridgeResult, "feature">;
  };
  methodCalibration: UfcMethodCalibration;
  promotionGate: UfcPromotionGate;
  methodProbabilities: { KO_TKO: number; SUBMISSION: number; DECISION: number };
  rawMethodProbabilities: { KO_TKO: number; SUBMISSION: number; DECISION: number };
  roundFinishProbabilities: Record<string, number>;
  transitionProbabilities: Record<string, number>;
  pathSummary: string[];
  activeEnsembleWeights: UfcResolvedEnsembleWeights;
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

type FighterPayloadRow = { id: string; payload_json: unknown };

const DEFAULT_MODEL_VERSION = "ufc-fight-iq-v1";
const DEFAULT_SIMULATIONS = 25_000;
const OPERATIONAL_SIM_CACHE_VERSION = "market-aware-input-audit-style-matchup-v1";

function stableId(prefix: string, value: string) { return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 24)}`; }
function toIso(value: Date | string) { return value instanceof Date ? value.toISOString() : new Date(value).toISOString(); }
function gradeRank(grade: string) { if (grade === "A") return 4; if (grade === "B") return 3; if (grade === "C") return 2; return 1; }
function weakerGrade(left: string, right: string) { return gradeRank(left) <= gradeRank(right) ? left : right; }
function confidenceRank(grade: string) { if (grade === "HIGH") return 4; if (grade === "MEDIUM_HIGH") return 3; if (grade === "MEDIUM") return 2; return 1; }
function weakerConfidence(left: string, right: string) { return confidenceRank(left) <= confidenceRank(right) ? left : right; }
function maxConfidenceFromSignal(signal: MmaProfileFeatureSignal | null) {
  if (!signal) return "MEDIUM_HIGH";
  if (signal.confidenceCap >= 0.78) return "HIGH";
  if (signal.confidenceCap >= 0.66) return "MEDIUM_HIGH";
  if (signal.confidenceCap >= 0.5) return "MEDIUM";
  return "LOW";
}
function confidenceGrade(probability: number, dataQuality: string, coldStart: boolean) {
  if (coldStart) return "LOW";
  const gap = Math.abs(probability - 0.5);
  if (gap >= 0.18 && gradeRank(dataQuality) >= 3) return "HIGH";
  if (gap >= 0.12 && gradeRank(dataQuality) >= 2) return "MEDIUM_HIGH";
  if (gap >= 0.07) return "MEDIUM";
  return "LOW";
}
function featureNumber(featureJson: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = featureJson[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}
function toFeatureSnapshot(row: WarehouseFeature): UfcModelFeatureSnapshot {
  const featureJson = row.feature_json ?? {};
  return {
    fightId: row.fight_id,
    fightDate: toIso(row.fight_date),
    fighterId: row.fighter_id,
    opponentFighterId: row.opponent_fighter_id,
    snapshotAt: toIso(row.snapshot_at),
    modelVersion: row.model_version,
    age: featureNumber(featureJson, "age"),
    reachInches: featureNumber(featureJson, "reachInches", "reach_inches"),
    heightInches: featureNumber(featureJson, "heightInches", "height_inches"),
    stance: typeof featureJson.stance === "string" ? featureJson.stance : null,
    weightClass: typeof featureJson.weightClass === "string" ? featureJson.weightClass : typeof featureJson.weight_class === "string" ? featureJson.weight_class : null,
    daysSinceLastFight: featureNumber(featureJson, "daysSinceLastFight", "days_since_last_fight"),
    proFights: row.pro_fights,
    ufcFights: row.ufc_fights,
    roundsFought: row.rounds_fought,
    sigStrikesLandedPerMin: row.sig_strikes_landed_per_min,
    sigStrikesAbsorbedPerMin: row.sig_strikes_absorbed_per_min,
    strikingDifferential: row.striking_differential,
    sigStrikeAccuracyPct: featureNumber(featureJson, "sigStrikeAccuracyPct", "sig_strike_accuracy_pct", "strikeAccuracyPct"),
    sigStrikeDefensePct: featureNumber(featureJson, "sigStrikeDefensePct", "sig_strike_defense_pct", "strikeDefensePct"),
    knockdownsPer15: featureNumber(featureJson, "knockdownsPer15", "knockdowns_per_15"),
    takedownsPer15: row.takedowns_per_15,
    takedownAccuracyPct: featureNumber(featureJson, "takedownAccuracyPct", "takedown_accuracy_pct"),
    takedownDefensePct: row.takedown_defense_pct,
    submissionAttemptsPer15: row.submission_attempts_per_15,
    controlTimePct: row.control_time_pct,
    recentFormScore: featureNumber(featureJson, "recentFormScore", "recent_form_score"),
    finishRate: featureNumber(featureJson, "finishRate", "finish_rate"),
    lateRoundPerformance: featureNumber(featureJson, "lateRoundPerformance", "late_round_performance"),
    opponentAdjustedStrength: row.opponent_adjusted_strength,
    coldStartActive: row.cold_start_active,
    feature: featureJson
  };
}
function stripBridgeFeature(input: UfcPriorBridgeResult): Omit<UfcPriorBridgeResult, "feature"> { const { feature: _feature, ...rest } = input; return rest; }

export async function runUfcOperationalSkillSim(fightId: string, options: UfcOperationalSimOptions = {}): Promise<UfcOperationalSimResult> {
  const modelVersion = options.modelVersion ?? DEFAULT_MODEL_VERSION;
  const simulations = options.simulations ?? DEFAULT_SIMULATIONS;
  const seed = options.seed ?? Number.parseInt(crypto.createHash("sha256").update(fightId).digest("hex").slice(0, 8), 16);
  const [activeEnsembleWeights, profileFeatureSignalReport, methodCalibration] = await Promise.all([
    resolveUfcEnsembleWeights(modelVersion, { skillMarkovWeight: options.skillMarkovWeight, exchangeMonteCarloWeight: options.exchangeMonteCarloWeight, roundByRoundWeight: options.roundByRoundWeight }),
    getProfileFeatureSignalReport().catch(() => null),
    getUfcMethodCalibration(modelVersion).catch(() => ({ modelVersion, sampleSize: 0, quality: "D" as const, actualRates: { KO_TKO: 0.33, SUBMISSION: 0.22, DECISION: 0.45 }, predictedAverages: { KO_TKO: 0.33, SUBMISSION: 0.22, DECISION: 0.45 }, corrections: { KO_TKO: 0, SUBMISSION: 0, DECISION: 0 }, maxCorrection: 0, generatedAt: new Date().toISOString() }))
  ]);
  const profileFeatureSignal = profileFeatureSignalReport?.mma ?? null;

  const fights = await prisma.$queryRaw<WarehouseFight[]>`SELECT id, event_label, fight_date, scheduled_rounds, fighter_a_id, fighter_b_id FROM ufc_fights WHERE id = ${fightId} LIMIT 1`;
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

  const fighterPayloadRows = await prisma.$queryRaw<FighterPayloadRow[]>`SELECT id, payload_json FROM ufc_fighters WHERE id IN (${fight.fighter_a_id}, ${fight.fighter_b_id})`;
  const payloadById = new Map(fighterPayloadRows.map((row) => [row.id, row.payload_json]));
  const aRawSnapshot = toFeatureSnapshot(aFeature);
  const bRawSnapshot = toFeatureSnapshot(bFeature);
  const aPriorBridge = applyPayloadPriorsToUfcFeature(aRawSnapshot, payloadById.get(fight.fighter_a_id));
  const bPriorBridge = applyPayloadPriorsToUfcFeature(bRawSnapshot, payloadById.get(fight.fighter_b_id));
  const aSnapshot = aPriorBridge.feature;
  const bSnapshot = bPriorBridge.feature;
  const aProfile = buildUfcFighterSkillProfile({ feature: aSnapshot });
  const bProfile = buildUfcFighterSkillProfile({ feature: bSnapshot });
  const marketOddsA = options.marketOddsAClose ?? options.marketOddsAOpen ?? null;
  const marketOddsB = options.marketOddsBClose ?? options.marketOddsBOpen ?? null;
  const simInputAudit = auditUfcSimInputs({ fighterA: aSnapshot, fighterB: bSnapshot, marketOddsA, marketOddsB });
  const profileDataQualityGrade = weakerGrade(aProfile.sampleQuality, bProfile.sampleQuality);
  const dataQualityGrade = weakerGrade(profileDataQualityGrade, simInputAudit.grade);
  const sim = runUfcEnsembleSimFromFeatures(aSnapshot, bSnapshot, { simulations, seed, scheduledRounds: fight.scheduled_rounds === 5 ? 5 : 3, weights: activeEnsembleWeights.weights });
  const calibratedMethodProbabilities = applyUfcMethodCalibration(sim.methodProbabilities, methodCalibration);
  const enrichedPriorBridge = { fighterA: stripBridgeFeature(aPriorBridge), fighterB: stripBridgeFeature(bPriorBridge) };
  const priorPathSummary = enrichedPriorPathSummary({ fighterAId: fight.fighter_a_id, fighterBId: fight.fighter_b_id, a: aPriorBridge, b: bPriorBridge });
  const rawPickProbability = Math.max(sim.fighterAWinProbability, sim.fighterBWinProbability);
  const confidenceBeforeProfileCap = confidenceGrade(rawPickProbability, dataQualityGrade, aProfile.prospect.coldStartActive || bProfile.prospect.coldStartActive || simInputAudit.fighterA.coldStartActive || simInputAudit.fighterB.coldStartActive);
  const confidence = weakerConfidence(confidenceBeforeProfileCap, maxConfidenceFromSignal(profileFeatureSignal));
  const marketAware = evaluateUfcMarketAwareFairProbability({
    fighterAId: fight.fighter_a_id,
    fighterBId: fight.fighter_b_id,
    modelProbabilityA: sim.fighterAWinProbability,
    modelProbabilityB: sim.fighterBWinProbability,
    marketOddsA,
    marketOddsB,
    dataQualityGrade,
    confidenceGrade: confidence,
    profileFeatureScore: Math.min(profileFeatureSignal?.score ?? 100, simInputAudit.score),
    methodCalibrationQuality: methodCalibration.quality,
    hasLearningSignal: Boolean(aPriorBridge.learningApplied || bPriorBridge.learningApplied),
    hasPriorSignal: Boolean(aPriorBridge.applied || bPriorBridge.applied),
    coldStartActive: Boolean(aProfile.prospect.coldStartActive || bProfile.prospect.coldStartActive || simInputAudit.fighterA.coldStartActive || simInputAudit.fighterB.coldStartActive)
  });
  const pickFighterId = marketAware.pickFighterId;
  const pickProbability = marketAware.pickProbability;
  const pickMarketOdds = marketAware.marketOddsAmerican;
  const edgePct = marketAware.noMarketEdge || simInputAudit.grade === "D" ? null : marketAware.edgePct;
  const auditReasonCodes = [
    ...simInputAudit.blockers.map((item) => `INPUT_BLOCKER_${item}`),
    ...simInputAudit.warnings.map((item) => `INPUT_WARNING_${item}`)
  ];
  const promotionGate = buildUfcPromotionGate({
    dataQualityGrade,
    confidenceGrade: confidence,
    edgePct,
    pickProbability,
    profileFeatureScore: Math.min(profileFeatureSignal?.score ?? 100, simInputAudit.score),
    methodCalibration,
    hasLearningSignal: Boolean(aPriorBridge.learningApplied || bPriorBridge.learningApplied),
    hasPriorSignal: Boolean(aPriorBridge.applied || bPriorBridge.applied),
    hasRealMarket: marketAware.hasRealMarket,
    noMarketEdge: marketAware.noMarketEdge || simInputAudit.grade === "D",
    uncertaintyCrossesMarket: marketAware.confidenceBand.crossesMarket,
    confidenceBandWidth: marketAware.confidenceBand.width,
    marketAwareReasonCodes: [...marketAware.reasonCodes, ...auditReasonCodes]
  });
  const predictionPayload = {
    ...sim,
    rawFighterAWinProbability: sim.fighterAWinProbability,
    rawFighterBWinProbability: sim.fighterBWinProbability,
    fighterAWinProbability: marketAware.blendedProbabilityA,
    fighterBWinProbability: marketAware.blendedProbabilityB,
    marketAware,
    simInputAudit,
    rawMethodProbabilities: sim.methodProbabilities,
    methodProbabilities: calibratedMethodProbabilities,
    methodCalibration,
    promotionGate,
    activeEnsembleWeights,
    profileFeatureSignal,
    enrichedPriorBridge,
    fighterSkillProfiles: { fighterA: aProfile, fighterB: bProfile },
    featureSnapshots: { fighterA: aSnapshot, fighterB: bSnapshot },
    cacheVersion: OPERATIONAL_SIM_CACHE_VERSION
  };
  const predictionId = stableId("ufcp", `${fightId}:${modelVersion}:${seed}:${simulations}:ensemble:${activeEnsembleWeights.source}:${activeEnsembleWeights.weights.skillMarkov}:${activeEnsembleWeights.weights.exchangeMonteCarlo}:${activeEnsembleWeights.weights.roundByRound}:${activeEnsembleWeights.weights.styleMatchup}:${OPERATIONAL_SIM_CACHE_VERSION}`);

  await prisma.$executeRaw`
    INSERT INTO ufc_predictions (id, fight_id, model_version, generated_at, fighter_a_id, fighter_b_id, fighter_a_win_probability, fighter_b_win_probability, pick_fighter_id, fair_odds_american, sportsbook_odds_american, edge_pct, ko_tko_probability, submission_probability, decision_probability, prediction_json, updated_at)
    VALUES (${predictionId}, ${fightId}, ${modelVersion}, now(), ${fight.fighter_a_id}, ${fight.fighter_b_id}, ${marketAware.blendedProbabilityA}, ${marketAware.blendedProbabilityB}, ${pickFighterId}, ${probabilityToAmericanOdds(pickProbability)}, ${pickMarketOdds ?? null}, ${edgePct}, ${calibratedMethodProbabilities.KO_TKO}, ${calibratedMethodProbabilities.SUBMISSION}, ${calibratedMethodProbabilities.DECISION}, ${JSON.stringify(predictionPayload)}::jsonb, now())
    ON CONFLICT (id) DO UPDATE SET fighter_a_win_probability = EXCLUDED.fighter_a_win_probability, fighter_b_win_probability = EXCLUDED.fighter_b_win_probability, pick_fighter_id = EXCLUDED.pick_fighter_id, fair_odds_american = EXCLUDED.fair_odds_american, sportsbook_odds_american = EXCLUDED.sportsbook_odds_american, edge_pct = EXCLUDED.edge_pct, ko_tko_probability = EXCLUDED.ko_tko_probability, submission_probability = EXCLUDED.submission_probability, decision_probability = EXCLUDED.decision_probability, prediction_json = EXCLUDED.prediction_json, updated_at = now()
  `;

  const simRunId = stableId("ufcsr", `${predictionId}:${seed}:${simulations}`);
  await prisma.$executeRaw`
    INSERT INTO ufc_sim_runs (id, prediction_id, fight_id, model_version, seed, simulation_count, completed_at, cache_key, status, result_json, updated_at)
    VALUES (${simRunId}, ${predictionId}, ${fightId}, ${modelVersion}, ${seed}, ${simulations}, now(), ${`ufc:${fightId}:${modelVersion}:${seed}:${simulations}:ensemble:${activeEnsembleWeights.source}:${OPERATIONAL_SIM_CACHE_VERSION}`}, 'COMPLETED', ${JSON.stringify(predictionPayload)}::jsonb, now())
    ON CONFLICT (id) DO UPDATE SET completed_at = EXCLUDED.completed_at, status = EXCLUDED.status, result_json = EXCLUDED.result_json, updated_at = now()
  `;

  let shadowPredictionId: string | null = null;
  if (options.recordShadow) {
    shadowPredictionId = stableId("ufcsh", `${predictionId}:shadow`);
    await prisma.$executeRaw`
      INSERT INTO ufc_shadow_predictions (id, fight_id, prediction_id, model_version, recorded_at, market_odds_a_open, market_odds_b_open, market_odds_a_close, market_odds_b_close, fighter_a_win_probability, fighter_b_win_probability, pick_fighter_id, data_quality_grade, confidence_grade, status, payload_json, updated_at)
      VALUES (${shadowPredictionId}, ${fightId}, ${predictionId}, ${modelVersion}, now(), ${options.marketOddsAOpen ?? null}, ${options.marketOddsBOpen ?? null}, ${options.marketOddsAClose ?? null}, ${options.marketOddsBClose ?? null}, ${marketAware.blendedProbabilityA}, ${marketAware.blendedProbabilityB}, ${pickFighterId}, ${promotionGate.grade}, ${promotionGate.confidenceCap}, ${promotionGate.status === "PROMOTABLE" ? "PENDING" : "SHADOW_ONLY"}, ${JSON.stringify({ sim: predictionPayload, pathSummary: [...priorPathSummary, `Input audit ${simInputAudit.grade} (${simInputAudit.score}/100).`, ...simInputAudit.blockers, ...simInputAudit.warnings, ...promotionGate.reasons, ...sim.pathSummary], dangerFlags: [...sim.dangerFlags, ...marketAware.reasonCodes, ...auditReasonCodes], profileFeatureSignal, enrichedPriorBridge, methodCalibration, promotionGate, marketAware, simInputAudit })}::jsonb, now())
      ON CONFLICT (id) DO UPDATE SET fighter_a_win_probability = EXCLUDED.fighter_a_win_probability, fighter_b_win_probability = EXCLUDED.fighter_b_win_probability, payload_json = EXCLUDED.payload_json, confidence_grade = EXCLUDED.confidence_grade, data_quality_grade = EXCLUDED.data_quality_grade, status = EXCLUDED.status, updated_at = now()
    `;
  }

  return {
    fightId,
    modelVersion,
    simulations,
    predictionId,
    shadowPredictionId,
    fighterAWinProbability: marketAware.blendedProbabilityA,
    fighterBWinProbability: marketAware.blendedProbabilityB,
    rawFighterAWinProbability: sim.fighterAWinProbability,
    rawFighterBWinProbability: sim.fighterBWinProbability,
    pickFighterId,
    fairOddsAmerican: probabilityToAmericanOdds(pickProbability),
    edgePct,
    marketAware,
    simInputAudit,
    dataQualityGrade: promotionGate.grade,
    confidenceGrade: promotionGate.confidenceCap,
    confidenceGradeBeforeProfileCap: confidenceBeforeProfileCap,
    profileFeatureSignal,
    enrichedPriorBridge,
    methodCalibration,
    promotionGate,
    methodProbabilities: calibratedMethodProbabilities,
    rawMethodProbabilities: sim.methodProbabilities,
    roundFinishProbabilities: sim.roundFinishProbabilities,
    transitionProbabilities: sim.transitionProbabilities,
    pathSummary: [
      ...(profileFeatureSignal ? [`MMA profile feature signal ${profileFeatureSignal.status} (${profileFeatureSignal.score}/100) capped confidence at ${Math.round(profileFeatureSignal.confidenceCap * 100)}%.`] : []),
      ...priorPathSummary,
      `Input audit ${simInputAudit.grade} (${simInputAudit.score}/100): fighterA=${simInputAudit.fighterA.score}, fighterB=${simInputAudit.fighterB.score}, market=${simInputAudit.market.score}, engine=${simInputAudit.engineReadiness.score}.`,
      ...simInputAudit.blockers,
      ...simInputAudit.warnings,
      `Market-aware blend modelWeight=${marketAware.modelWeight} marketWeight=${marketAware.marketWeight}; ${marketAware.hasRealMarket ? "real no-vig market applied" : "NO MARKET EDGE"}.`,
      `Confidence band ${Math.round(marketAware.confidenceBand.low * 1000) / 10}%–${Math.round(marketAware.confidenceBand.high * 1000) / 10}%${marketAware.confidenceBand.crossesMarket ? " crosses market" : ""}.`,
      `Method calibration ${methodCalibration.quality} sample=${methodCalibration.sampleSize}; corrections KO ${methodCalibration.corrections.KO_TKO}, SUB ${methodCalibration.corrections.SUBMISSION}, DEC ${methodCalibration.corrections.DECISION}.`,
      `Promotion gate: ${promotionGate.status} grade=${promotionGate.grade}.`,
      ...promotionGate.reasons,
      ...sim.pathSummary
    ],
    activeEnsembleWeights
  };
}
