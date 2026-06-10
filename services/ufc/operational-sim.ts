import crypto from "node:crypto";

import { prisma } from "@/lib/db/prisma";
import { getProfileFeatureSignalReport, type MmaProfileFeatureSignal } from "@/services/simulation/profile-feature-signals";
import { runUfcEnsembleSimFromFeatures, type UfcEnsembleSimResult } from "@/services/ufc/ensemble-sim";
import { resolveUfcEnsembleWeights, type UfcResolvedEnsembleWeights } from "@/services/ufc/ensemble-weight-store";
import { americanOddsToImpliedProbability, probabilityToAmericanOdds } from "@/services/ufc/fight-iq";
import { buildUfcFighterSkillProfile, type UfcModelFeatureSnapshot } from "@/services/ufc/fighter-skill-profile";
import { evaluateUfcMarketAwareFairProbability, type UfcMarketAwareFairProbability } from "@/services/ufc/market-aware-fair-probability";
import { applyUfcMethodCalibration, buildUfcPromotionGate, getUfcMethodCalibration, type UfcMethodCalibration, type UfcPromotionGate } from "@/services/ufc/method-calibration-gate";
import { applyIndividualUfcProfileToFeature, type UfcIndividualFighterProfile } from "@/services/ufc/individual-fighter-profile";
import { applyProfileIntelligenceToUfcFeature, profileIntelligencePathSummary, type UfcProfileIntelligenceBridgeResult } from "@/services/ufc/profile-intelligence-sim-bridge";
import { applyPayloadPriorsToUfcFeature, enrichedPriorPathSummary, type UfcPriorBridgeResult } from "@/services/ufc/profile-prior-sim-bridge";
import { auditUfcProfileTruth, weakerTruthConfidence, weakerTruthGrade, type UfcProfileTruthAudit } from "@/services/ufc/profile-truth-audit";
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
  profileTruthAudit: { fighterA: UfcProfileTruthAudit; fighterB: UfcProfileTruthAudit; combinedGrade: string; combinedConfidenceCap: string };
  individualFighterProfiles: { fighterA: UfcIndividualFighterProfile; fighterB: UfcIndividualFighterProfile };
  profileIntelligenceBridge: {
    fighterA: Omit<UfcProfileIntelligenceBridgeResult, "feature">;
    fighterB: Omit<UfcProfileIntelligenceBridgeResult, "feature">;
  };
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
  styleGenome: UfcEnsembleSimResult["styleGenome"];
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
  payload_json: unknown;
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

type FighterPayloadRow = { id: string; full_name: string | null; payload_json: unknown };

type ResolvedMarketOdds = {
  marketOddsAOpen: number | null;
  marketOddsBOpen: number | null;
  marketOddsAClose: number | null;
  marketOddsBClose: number | null;
  marketOddsSnapshot: Record<string, unknown> | null;
};

const DEFAULT_MODEL_VERSION = "ufc-fight-iq-v1";
const DEFAULT_SIMULATIONS = 25_000;
const OPERATIONAL_SIM_CACHE_VERSION = "market-aware-input-audit-style-genome-shadow-v2";
const SHADOW_AUDIT_SCHEMA_VERSION = "ufc-shadow-audit-v2";
const INT32_MAX = 2_147_483_647;

function stableId(prefix: string, value: string) { return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 24)}`; }
function toIso(value: Date | string) { return value instanceof Date ? value.toISOString() : new Date(value).toISOString(); }
function gradeRank(grade: string) { if (grade === "A") return 4; if (grade === "B") return 3; if (grade === "C") return 2; return 1; }
function weakerGrade(left: string, right: string) { return gradeRank(left) <= gradeRank(right) ? left : right; }
function confidenceRank(grade: string) { if (grade === "HIGH") return 4; if (grade === "MEDIUM_HIGH") return 3; if (grade === "MEDIUM") return 2; return 1; }
function weakerConfidence(left: string, right: string) { return confidenceRank(left) <= confidenceRank(right) ? left : right; }
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function withStyleGenome(feature: UfcModelFeatureSnapshot, styleGenome: UfcEnsembleSimResult["styleGenome"]["fighterA"]): UfcModelFeatureSnapshot {
  return { ...feature, feature: { ...asRecord(feature.feature), styleGenome } };
}
function marketNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/^\+/, ""));
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }
  return null;
}

export function calculateUfcEdgePct(modelProbability: number | null | undefined, oddsAmerican: number | null | undefined) {
  if (typeof modelProbability !== "number" || !Number.isFinite(modelProbability)) return null;
  const marketProbability = americanOddsToImpliedProbability(oddsAmerican);
  if (marketProbability == null) return null;
  return Math.max(0, Number(((modelProbability - marketProbability) * 100).toFixed(2)));
}

function normalizeDbInt(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  const whole = Math.floor(Math.abs(value));
  return Math.min(INT32_MAX, Math.max(1, whole));
}
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
  const rawFeature = asRecord(featureJson.rawFeature);
  for (const key of keys) {
    const value = rawFeature[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}
function resolveMarketOddsFromFight(fight: WarehouseFight, options: UfcOperationalSimOptions): ResolvedMarketOdds {
  const payload = asRecord(fight.payload_json);
  const marketOddsSnapshot = asRecord(payload.marketOdds);
  const open = asRecord(marketOddsSnapshot.open);
  const close = asRecord(marketOddsSnapshot.close);
  const payloadAOpen = marketNumber(open.fighterAOddsAmerican) ?? marketNumber(open.fighterA) ?? marketNumber(marketOddsSnapshot.fighterAOddsAmerican);
  const payloadBOpen = marketNumber(open.fighterBOddsAmerican) ?? marketNumber(open.fighterB) ?? marketNumber(marketOddsSnapshot.fighterBOddsAmerican);
  const payloadAClose = marketNumber(close.fighterAOddsAmerican) ?? marketNumber(close.fighterA) ?? payloadAOpen;
  const payloadBClose = marketNumber(close.fighterBOddsAmerican) ?? marketNumber(close.fighterB) ?? payloadBOpen;
  return {
    marketOddsAOpen: options.marketOddsAOpen ?? payloadAOpen ?? null,
    marketOddsBOpen: options.marketOddsBOpen ?? payloadBOpen ?? null,
    marketOddsAClose: options.marketOddsAClose ?? payloadAClose ?? null,
    marketOddsBClose: options.marketOddsBClose ?? payloadBClose ?? null,
    marketOddsSnapshot: Object.keys(marketOddsSnapshot).length ? marketOddsSnapshot : null
  };
}
function toFeatureSnapshot(row: WarehouseFeature, canonicalFightDate?: string): UfcModelFeatureSnapshot {
  const featureJson = row.feature_json ?? {};
  return {
    fightId: row.fight_id,
    fightDate: canonicalFightDate ?? toIso(row.fight_date),
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
function stripIntelligenceFeature(input: UfcProfileIntelligenceBridgeResult): Omit<UfcProfileIntelligenceBridgeResult, "feature"> { const { feature: _feature, ...rest } = input; return rest; }
function noGenericEdge(profile: UfcIndividualFighterProfile) { return profile.noGenericEdge || profile.readinessGrade === "D"; }

export async function runUfcOperationalSkillSim(fightId: string, options: UfcOperationalSimOptions = {}): Promise<UfcOperationalSimResult> {
  const modelVersion = options.modelVersion ?? DEFAULT_MODEL_VERSION;
  const simulations = normalizeDbInt(options.simulations ?? DEFAULT_SIMULATIONS, DEFAULT_SIMULATIONS);
  const derivedSeed = Number.parseInt(crypto.createHash("sha256").update(fightId).digest("hex").slice(0, 8), 16);
  const seed = normalizeDbInt(options.seed ?? derivedSeed, 1287);
  const [activeEnsembleWeights, profileFeatureSignalReport, methodCalibration] = await Promise.all([
    resolveUfcEnsembleWeights(modelVersion, { skillMarkovWeight: options.skillMarkovWeight, exchangeMonteCarloWeight: options.exchangeMonteCarloWeight, roundByRoundWeight: options.roundByRoundWeight }),
    getProfileFeatureSignalReport().catch(() => null),
    getUfcMethodCalibration(modelVersion).catch(() => ({ modelVersion, sampleSize: 0, quality: "D" as const, actualRates: { KO_TKO: 0.33, SUBMISSION: 0.22, DECISION: 0.45 }, predictedAverages: { KO_TKO: 0.33, SUBMISSION: 0.22, DECISION: 0.45 }, corrections: { KO_TKO: 0, SUBMISSION: 0, DECISION: 0 }, maxCorrection: 0, generatedAt: new Date().toISOString() }))
  ]);
  const profileFeatureSignal = profileFeatureSignalReport?.mma ?? null;

  const fights = await prisma.$queryRaw<WarehouseFight[]>`SELECT id, event_label, fight_date, scheduled_rounds, fighter_a_id, fighter_b_id, payload_json FROM ufc_fights WHERE id = ${fightId} LIMIT 1`;
  const fight = fights[0];
  if (!fight) throw new Error(`UFC operational sim missing fight: ${fightId}`);
  const canonicalFightDate = toIso(fight.fight_date);
  const resolvedMarketOdds = resolveMarketOddsFromFight(fight, options);

  const features = await prisma.$queryRaw<WarehouseFeature[]>`
    SELECT fight_id, fight_date, fighter_id, opponent_fighter_id, snapshot_at, model_version,
      pro_fights, ufc_fights, rounds_fought, sig_strikes_landed_per_min, sig_strikes_absorbed_per_min,
      striking_differential, takedowns_per_15, takedown_defense_pct, submission_attempts_per_15,
      control_time_pct, opponent_adjusted_strength, cold_start_active, feature_json
    FROM ufc_model_features
    WHERE fight_id = ${fightId}
      AND model_version = ${modelVersion}
      AND snapshot_at <= ${canonicalFightDate}::timestamptz
    ORDER BY snapshot_at DESC
  `;
  const aFeature = features.find((feature) => feature.fighter_id === fight.fighter_a_id);
  const bFeature = features.find((feature) => feature.fighter_id === fight.fighter_b_id);
  if (!aFeature || !bFeature) throw new Error(`UFC operational sim missing two pre-fight feature snapshots for ${fightId}:${modelVersion}`);

  const fighterPayloadRows = (await prisma.$queryRaw<FighterPayloadRow[]>`SELECT id, full_name, payload_json FROM ufc_fighters WHERE id IN (${fight.fighter_a_id}, ${fight.fighter_b_id})`) as FighterPayloadRow[];
  const payloadById = new Map<string, unknown>(fighterPayloadRows.map((row) => [row.id, row.payload_json]));
  const nameById = new Map<string, string | null>(fighterPayloadRows.map((row) => [row.id, row.full_name]));
  // The fight schedule row is canonical. Older feature rows can carry stale
  // fight_date metadata after provider corrections, so never let that block
  // pre-fight validation for the current fight.
  const aRawSnapshot = toFeatureSnapshot(aFeature, canonicalFightDate);
  const bRawSnapshot = toFeatureSnapshot(bFeature, canonicalFightDate);
  const aIndividualBridge = applyIndividualUfcProfileToFeature({ feature: aRawSnapshot, payload: payloadById.get(fight.fighter_a_id), fighterName: nameById.get(fight.fighter_a_id) ?? null });
  const bIndividualBridge = applyIndividualUfcProfileToFeature({ feature: bRawSnapshot, payload: payloadById.get(fight.fighter_b_id), fighterName: nameById.get(fight.fighter_b_id) ?? null });
  const aTruthAudit = auditUfcProfileTruth(aIndividualBridge.feature.feature);
  const bTruthAudit = auditUfcProfileTruth(bIndividualBridge.feature.feature);
  const combinedTruthGrade = weakerTruthGrade(aTruthAudit.grade, bTruthAudit.grade);
  const combinedTruthConfidenceCap = weakerTruthConfidence(aTruthAudit.confidenceCap, bTruthAudit.confidenceCap);
  const aPriorBridge = applyPayloadPriorsToUfcFeature(aIndividualBridge.feature, payloadById.get(fight.fighter_a_id));
  const bPriorBridge = applyPayloadPriorsToUfcFeature(bIndividualBridge.feature, payloadById.get(fight.fighter_b_id));
  const aIntelligenceBridge = applyProfileIntelligenceToUfcFeature(aPriorBridge.feature);
  const bIntelligenceBridge = applyProfileIntelligenceToUfcFeature(bPriorBridge.feature);
  const aSnapshot = aIntelligenceBridge.feature;
  const bSnapshot = bIntelligenceBridge.feature;
  const aProfile = buildUfcFighterSkillProfile({ feature: aSnapshot });
  const bProfile = buildUfcFighterSkillProfile({ feature: bSnapshot });
  const marketOddsA = resolvedMarketOdds.marketOddsAClose ?? resolvedMarketOdds.marketOddsAOpen ?? null;
  const marketOddsB = resolvedMarketOdds.marketOddsBClose ?? resolvedMarketOdds.marketOddsBOpen ?? null;
  const simInputAudit = auditUfcSimInputs({ fighterA: aSnapshot, fighterB: bSnapshot, marketOddsA, marketOddsB });
  const profileDataQualityGrade = weakerGrade(aProfile.sampleQuality, bProfile.sampleQuality);
  const intelligenceGrade = weakerGrade(aIntelligenceBridge.readinessGrade ?? "D", bIntelligenceBridge.readinessGrade ?? "D");
  const individualProfileGrade = weakerGrade(aIndividualBridge.profile.readinessGrade, bIndividualBridge.profile.readinessGrade);
  const dataQualityGrade = weakerGrade(weakerGrade(weakerGrade(weakerGrade(profileDataQualityGrade, simInputAudit.grade), combinedTruthGrade), intelligenceGrade), individualProfileGrade);
  const sim = runUfcEnsembleSimFromFeatures(aSnapshot, bSnapshot, { simulations, seed, scheduledRounds: fight.scheduled_rounds === 5 ? 5 : 3, weights: activeEnsembleWeights.weights });
  const styleFeatureSnapshots = {
    fighterA: withStyleGenome(aSnapshot, sim.styleGenome.fighterA),
    fighterB: withStyleGenome(bSnapshot, sim.styleGenome.fighterB)
  };
  if (sim.styleGenome.fighterA) {
    await prisma.$executeRaw`
      UPDATE ufc_model_features
      SET feature_json = jsonb_set(COALESCE(feature_json, '{}'::jsonb), '{styleGenome}', ${JSON.stringify(sim.styleGenome.fighterA)}::jsonb, true), updated_at = now()
      WHERE fight_id = ${fightId} AND fighter_id = ${fight.fighter_a_id} AND model_version = ${modelVersion}
    `;
  }
  if (sim.styleGenome.fighterB) {
    await prisma.$executeRaw`
      UPDATE ufc_model_features
      SET feature_json = jsonb_set(COALESCE(feature_json, '{}'::jsonb), '{styleGenome}', ${JSON.stringify(sim.styleGenome.fighterB)}::jsonb, true), updated_at = now()
      WHERE fight_id = ${fightId} AND fighter_id = ${fight.fighter_b_id} AND model_version = ${modelVersion}
    `;
  }
  const calibratedMethodProbabilities = applyUfcMethodCalibration(sim.methodProbabilities, methodCalibration);
  const enrichedPriorBridge = { fighterA: stripBridgeFeature(aPriorBridge), fighterB: stripBridgeFeature(bPriorBridge) };
  const profileIntelligenceBridge = { fighterA: stripIntelligenceFeature(aIntelligenceBridge), fighterB: stripIntelligenceFeature(bIntelligenceBridge) };
  const priorPathSummary = enrichedPriorPathSummary({ fighterAId: fight.fighter_a_id, fighterBId: fight.fighter_b_id, a: aPriorBridge, b: bPriorBridge });
  const intelligencePathSummary = profileIntelligencePathSummary({ fighterAId: fight.fighter_a_id, fighterBId: fight.fighter_b_id, a: aIntelligenceBridge, b: bIntelligenceBridge });
  const stylePathSummary = [
    ...(sim.styleGenome.fighterA ? [`Fighter A style genome: ${sim.styleGenome.fighterA.archetype.primary} confidence=${Math.round(sim.styleGenome.fighterA.archetype.confidence * 100)}%.`] : []),
    ...(sim.styleGenome.fighterB ? [`Fighter B style genome: ${sim.styleGenome.fighterB.archetype.primary} confidence=${Math.round(sim.styleGenome.fighterB.archetype.confidence * 100)}%.`] : []),
    ...(sim.styleGenome.clash ? [`Style clash pace=${sim.styleGenome.clash.paceProjection}/100 finishVolatility=${sim.styleGenome.clash.finishVolatility}/100 decisionReliability=${sim.styleGenome.clash.decisionReliability}/100.`] : []),
    ...(sim.styleGenome.clash?.styleWarnings ?? []).slice(0, 4)
  ];
  const rawPickProbability = Math.max(sim.fighterAWinProbability, sim.fighterBWinProbability);
  const intelligenceColdStart = aIntelligenceBridge.blockers.length > 0 || bIntelligenceBridge.blockers.length > 0;
  const confidenceBeforeProfileCap = confidenceGrade(rawPickProbability, dataQualityGrade, aProfile.prospect.coldStartActive || bProfile.prospect.coldStartActive || simInputAudit.fighterA.coldStartActive || simInputAudit.fighterB.coldStartActive || intelligenceColdStart);
  const confidence = weakerConfidence(weakerConfidence(confidenceBeforeProfileCap, maxConfidenceFromSignal(profileFeatureSignal)), combinedTruthConfidenceCap);
  const profileFeatureScore = Math.min(profileFeatureSignal?.score ?? 100, simInputAudit.score, aTruthAudit.score, bTruthAudit.score, aIndividualBridge.profile.readinessScore, bIndividualBridge.profile.readinessScore, aIntelligenceBridge.readinessScore ?? 100, bIntelligenceBridge.readinessScore ?? 100);
  const marketAware = evaluateUfcMarketAwareFairProbability({
    fighterAId: fight.fighter_a_id,
    fighterBId: fight.fighter_b_id,
    modelProbabilityA: sim.fighterAWinProbability,
    modelProbabilityB: sim.fighterBWinProbability,
    marketOddsA,
    marketOddsB,
    dataQualityGrade,
    confidenceGrade: confidence,
    profileFeatureScore,
    methodCalibrationQuality: methodCalibration.quality,
    hasLearningSignal: Boolean(aPriorBridge.learningApplied || bPriorBridge.learningApplied),
    hasPriorSignal: Boolean(aPriorBridge.applied || bPriorBridge.applied || aIntelligenceBridge.applied || bIntelligenceBridge.applied),
    coldStartActive: Boolean(aProfile.prospect.coldStartActive || bProfile.prospect.coldStartActive || simInputAudit.fighterA.coldStartActive || simInputAudit.fighterB.coldStartActive || intelligenceColdStart || noGenericEdge(aIndividualBridge.profile) || noGenericEdge(bIndividualBridge.profile))
  });
  const pickFighterId = marketAware.pickFighterId;
  const pickProbability = marketAware.pickProbability;
  const pickMarketOdds = marketAware.marketOddsAmerican;
  const fairOddsAmerican = probabilityToAmericanOdds(pickProbability);
  const noEdgeByAudit = simInputAudit.grade === "D" || combinedTruthGrade === "D" || intelligenceGrade === "D" || noGenericEdge(aIndividualBridge.profile) || noGenericEdge(bIndividualBridge.profile);
  const edgePct = marketAware.noMarketEdge || noEdgeByAudit ? null : marketAware.edgePct;
  const auditReasonCodes = [
    ...simInputAudit.blockers.map((item) => `INPUT_BLOCKER_${item}`),
    ...simInputAudit.warnings.map((item) => `INPUT_WARNING_${item}`),
    ...aTruthAudit.reasonCodes.map((item) => `FIGHTER_A_${item}`),
    ...bTruthAudit.reasonCodes.map((item) => `FIGHTER_B_${item}`),
    ...aIntelligenceBridge.blockers.map((item) => `FIGHTER_A_INTEL_BLOCKER_${item}`),
    ...bIntelligenceBridge.blockers.map((item) => `FIGHTER_B_INTEL_BLOCKER_${item}`),
    ...aIntelligenceBridge.warnings.map((item) => `FIGHTER_A_INTEL_WARNING_${item}`),
    ...bIntelligenceBridge.warnings.map((item) => `FIGHTER_B_INTEL_WARNING_${item}`),
    ...aIndividualBridge.profile.blockers.map((item) => `FIGHTER_A_PROFILE_BLOCKER_${item}`),
    ...bIndividualBridge.profile.blockers.map((item) => `FIGHTER_B_PROFILE_BLOCKER_${item}`),
    ...aIndividualBridge.profile.warnings.map((item) => `FIGHTER_A_PROFILE_WARNING_${item}`),
    ...bIndividualBridge.profile.warnings.map((item) => `FIGHTER_B_PROFILE_WARNING_${item}`)
  ];
  const promotionGate = buildUfcPromotionGate({
    dataQualityGrade,
    confidenceGrade: confidence,
    edgePct,
    pickProbability,
    profileFeatureScore,
    methodCalibration,
    hasLearningSignal: Boolean(aPriorBridge.learningApplied || bPriorBridge.learningApplied),
    hasPriorSignal: Boolean(aPriorBridge.applied || bPriorBridge.applied || aIntelligenceBridge.applied || bIntelligenceBridge.applied),
    hasRealMarket: marketAware.hasRealMarket,
    noMarketEdge: marketAware.noMarketEdge || noEdgeByAudit,
    uncertaintyCrossesMarket: marketAware.confidenceBand.crossesMarket,
    confidenceBandWidth: marketAware.confidenceBand.width,
    marketAwareReasonCodes: [...marketAware.reasonCodes, ...auditReasonCodes]
  });
  const profileTruthAudit = { fighterA: aTruthAudit, fighterB: bTruthAudit, combinedGrade: combinedTruthGrade, combinedConfidenceCap: combinedTruthConfidenceCap };
  const individualFighterProfiles = { fighterA: aIndividualBridge.profile, fighterB: bIndividualBridge.profile };
  const predictionPayload = {
    ...sim,
    rawFighterAWinProbability: sim.fighterAWinProbability,
    rawFighterBWinProbability: sim.fighterBWinProbability,
    fighterAWinProbability: marketAware.blendedProbabilityA,
    fighterBWinProbability: marketAware.blendedProbabilityB,
    marketAware,
    simInputAudit,
    profileTruthAudit,
    individualFighterProfiles,
    profileIntelligenceBridge,
    rawMethodProbabilities: sim.methodProbabilities,
    methodProbabilities: calibratedMethodProbabilities,
    methodCalibration,
    promotionGate,
    activeEnsembleWeights,
    profileFeatureSignal,
    enrichedPriorBridge,
    fighterSkillProfiles: { fighterA: aProfile, fighterB: bProfile },
    featureSnapshots: styleFeatureSnapshots,
    marketOddsSnapshot: resolvedMarketOdds.marketOddsSnapshot,
    shadowAuditSchemaVersion: SHADOW_AUDIT_SCHEMA_VERSION,
    cacheVersion: OPERATIONAL_SIM_CACHE_VERSION
  };
  const predictionId = stableId("ufcp", `${fightId}:${modelVersion}:${seed}:${simulations}:ensemble:${activeEnsembleWeights.source}:${activeEnsembleWeights.weights.skillMarkov}:${activeEnsembleWeights.weights.exchangeMonteCarlo}:${activeEnsembleWeights.weights.roundByRound}:${activeEnsembleWeights.weights.styleMatchup}:${OPERATIONAL_SIM_CACHE_VERSION}`);

  await prisma.$executeRaw`
    INSERT INTO ufc_predictions (id, fight_id, model_version, generated_at, fighter_a_id, fighter_b_id, fighter_a_win_probability, fighter_b_win_probability, pick_fighter_id, fair_odds_american, sportsbook_odds_american, edge_pct, ko_tko_probability, submission_probability, decision_probability, prediction_json, updated_at)
    VALUES (${predictionId}, ${fightId}, ${modelVersion}, now(), ${fight.fighter_a_id}, ${fight.fighter_b_id}, ${marketAware.blendedProbabilityA}, ${marketAware.blendedProbabilityB}, ${pickFighterId}, ${fairOddsAmerican}, ${pickMarketOdds ?? null}, ${edgePct}, ${calibratedMethodProbabilities.KO_TKO}, ${calibratedMethodProbabilities.SUBMISSION}, ${calibratedMethodProbabilities.DECISION}, ${JSON.stringify(predictionPayload)}::jsonb, now())
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
    const shadowPathSummary = [
      ...stylePathSummary,
      ...priorPathSummary,
      ...intelligencePathSummary,
      `Truth audit ${combinedTruthGrade}: A=${aTruthAudit.score}/100, B=${bTruthAudit.score}/100.`,
      `Individual fighter profile gate: A=${aIndividualBridge.profile.readinessGrade} (${aIndividualBridge.profile.readinessScore}/100, trusted=${aIndividualBridge.profile.trustedStatCount}, estimated=${aIndividualBridge.profile.estimatedStatCount}); B=${bIndividualBridge.profile.readinessGrade} (${bIndividualBridge.profile.readinessScore}/100, trusted=${bIndividualBridge.profile.trustedStatCount}, estimated=${bIndividualBridge.profile.estimatedStatCount}).`,
      ...aIndividualBridge.profile.blockers.map((item) => `A ${item}`),
      ...bIndividualBridge.profile.blockers.map((item) => `B ${item}`),
      ...aTruthAudit.reasonCodes.map((item) => `A ${item}`),
      ...bTruthAudit.reasonCodes.map((item) => `B ${item}`),
      `Input audit ${simInputAudit.grade} (${simInputAudit.score}/100).`,
      ...simInputAudit.blockers,
      ...simInputAudit.warnings,
      ...promotionGate.reasons,
      ...sim.pathSummary
    ];
    const shadowDangerFlags = [...new Set([...sim.dangerFlags, ...marketAware.reasonCodes, ...auditReasonCodes])];
    const shadowPayload = {
      schemaVersion: SHADOW_AUDIT_SCHEMA_VERSION,
      status: "PENDING_SETTLEMENT",
      fightId,
      modelVersion,
      predictionId,
      simRunId,
      cacheVersion: OPERATIONAL_SIM_CACHE_VERSION,
      generatedAt: new Date().toISOString(),
      fighters: {
        fighterAId: fight.fighter_a_id,
        fighterBId: fight.fighter_b_id
      },
      probabilities: {
        fighterAWinProbability: marketAware.blendedProbabilityA,
        fighterBWinProbability: marketAware.blendedProbabilityB,
        rawFighterAWinProbability: sim.fighterAWinProbability,
        rawFighterBWinProbability: sim.fighterBWinProbability,
        pickFighterId,
        pickProbability,
        fairOddsAmerican,
        sportsbookOddsAmerican: pickMarketOdds ?? null,
        edgePct
      },
      odds: {
        marketOddsAOpen: resolvedMarketOdds.marketOddsAOpen,
        marketOddsBOpen: resolvedMarketOdds.marketOddsBOpen,
        marketOddsAClose: resolvedMarketOdds.marketOddsAClose,
        marketOddsBClose: resolvedMarketOdds.marketOddsBClose,
        marketOddsSnapshot: resolvedMarketOdds.marketOddsSnapshot
      },
      methods: {
        rawMethodProbabilities: sim.methodProbabilities,
        methodProbabilities: calibratedMethodProbabilities,
        roundFinishProbabilities: sim.roundFinishProbabilities,
        transitionProbabilities: sim.transitionProbabilities,
        methodCalibration
      },
      style: {
        styleGenome: sim.styleGenome,
        styleMatchup: sim.sourceOutputs.styleMatchup,
        pathWins: sim.stylePathWins,
        clash: sim.styleGenome.clash
      },
      audits: {
        simInputAudit,
        profileTruthAudit,
        individualFighterProfiles,
        profileIntelligenceBridge,
        enrichedPriorBridge,
        profileFeatureSignal
      },
      promotionGate,
      marketAware,
      activeEnsembleWeights,
      settlement: {
        status: "PENDING",
        actualWinnerFighterId: null,
        resultCorrect: null,
        closingLineValuePct: null
      },
      pathSummary: shadowPathSummary,
      dangerFlags: shadowDangerFlags,
      sim: predictionPayload
    };
    await prisma.$executeRaw`
      UPDATE ufc_shadow_predictions
      SET status = 'SUPERSEDED',
          payload_json = COALESCE(payload_json, '{}'::jsonb) || jsonb_build_object('supersededAt', now(), 'supersededByPredictionId', ${predictionId}, 'supersededByShadowPredictionId', ${shadowPredictionId}),
          updated_at = now()
      WHERE fight_id = ${fightId}
        AND model_version = ${modelVersion}
        AND status = 'PENDING'
        AND id <> ${shadowPredictionId}
    `;
    await prisma.$executeRaw`
      INSERT INTO ufc_shadow_predictions (id, fight_id, prediction_id, model_version, recorded_at, market_odds_a_open, market_odds_b_open, market_odds_a_close, market_odds_b_close, fighter_a_win_probability, fighter_b_win_probability, pick_fighter_id, data_quality_grade, confidence_grade, status, payload_json, updated_at)
      VALUES (${shadowPredictionId}, ${fightId}, ${predictionId}, ${modelVersion}, now(), ${resolvedMarketOdds.marketOddsAOpen ?? null}, ${resolvedMarketOdds.marketOddsBOpen ?? null}, ${resolvedMarketOdds.marketOddsAClose ?? null}, ${resolvedMarketOdds.marketOddsBClose ?? null}, ${marketAware.blendedProbabilityA}, ${marketAware.blendedProbabilityB}, ${pickFighterId}, ${promotionGate.grade}, ${promotionGate.confidenceCap}, 'PENDING', ${JSON.stringify(shadowPayload)}::jsonb, now())
      ON CONFLICT (id) DO UPDATE SET recorded_at = now(), prediction_id = EXCLUDED.prediction_id, market_odds_a_open = EXCLUDED.market_odds_a_open, market_odds_b_open = EXCLUDED.market_odds_b_open, market_odds_a_close = EXCLUDED.market_odds_a_close, market_odds_b_close = EXCLUDED.market_odds_b_close, fighter_a_win_probability = EXCLUDED.fighter_a_win_probability, fighter_b_win_probability = EXCLUDED.fighter_b_win_probability, pick_fighter_id = EXCLUDED.pick_fighter_id, actual_winner_fighter_id = NULL, closing_line_value_pct = NULL, result_correct = NULL, payload_json = EXCLUDED.payload_json, confidence_grade = EXCLUDED.confidence_grade, data_quality_grade = EXCLUDED.data_quality_grade, status = 'PENDING', updated_at = now()
      WHERE ufc_shadow_predictions.status <> 'RESOLVED'
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
    fairOddsAmerican,
    edgePct,
    marketAware,
    simInputAudit,
    profileTruthAudit,
    individualFighterProfiles,
    profileIntelligenceBridge,
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
    styleGenome: sim.styleGenome,
    pathSummary: [
      ...(profileFeatureSignal ? [`MMA profile feature signal ${profileFeatureSignal.status} (${profileFeatureSignal.score}/100) capped confidence at ${Math.round(profileFeatureSignal.confidenceCap * 100)}%.`] : []),
      ...stylePathSummary,
      `Profile truth audit ${combinedTruthGrade}: fighterA=${aTruthAudit.score}/100 official=${Math.round(aTruthAudit.officialShare * 100)}% estimated=${Math.round(aTruthAudit.estimatedShare * 100)}%; fighterB=${bTruthAudit.score}/100 official=${Math.round(bTruthAudit.officialShare * 100)}% estimated=${Math.round(bTruthAudit.estimatedShare * 100)}%.`,
      `Individual fighter profiles: fighterA=${aIndividualBridge.profile.readinessGrade} ${aIndividualBridge.profile.readinessScore}/100 (${aIndividualBridge.profile.tendencies.slice(0, 3).join(", ") || "tendencies pending"}); fighterB=${bIndividualBridge.profile.readinessGrade} ${bIndividualBridge.profile.readinessScore}/100 (${bIndividualBridge.profile.tendencies.slice(0, 3).join(", ") || "tendencies pending"}).`,
      ...aIndividualBridge.profile.warnings.map((item) => `Fighter A profile warning: ${item}`),
      ...bIndividualBridge.profile.warnings.map((item) => `Fighter B profile warning: ${item}`),
      ...aIndividualBridge.profile.blockers.map((item) => `Fighter A profile blocker: ${item}`),
      ...bIndividualBridge.profile.blockers.map((item) => `Fighter B profile blocker: ${item}`),
      ...aTruthAudit.reasonCodes.map((item) => `Fighter A truth flag: ${item}`),
      ...bTruthAudit.reasonCodes.map((item) => `Fighter B truth flag: ${item}`),
      ...priorPathSummary,
      ...intelligencePathSummary,
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
