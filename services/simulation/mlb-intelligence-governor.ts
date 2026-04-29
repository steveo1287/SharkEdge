import { getCachedMlbMlModel, scoreMlbMlModel } from "@/services/simulation/mlb-ml-training-engine";

export type MlbGovernorFeatures = {
  teamEdge: number;
  playerEdge: number;
  statcastEdge: number;
  weatherEdge: number;
  pitcherEdge: number;
  bullpenEdge: number;
  lockEdge: number;
  parkEdge: number;
  formEdge: number;
  totalWeatherEdge: number;
  totalStatcastEdge: number;
  totalPitchingEdge: number;
  totalParkEdge: number;
  totalBullpenEdge: number;
  // Umpire K-zone tendency: positive = generous zone (more Ks, fewer walks, lower runs)
  umpireEdge?: number;
  // xFIP vs ERA regression signal: positive = home pitcher likely to outperform results
  pitcherRegressionEdge?: number;
  marketHomeNoVigProbability?: number | null;
  marketSource?: string | null;
  marketHold?: number | null;
  marketHomeOddsAmerican?: number | null;
  marketAwayOddsAmerican?: number | null;
};

export type MlbGovernedProjection = {
  source: "rules-only" | "rules+ml";
  homeWinPct: number;
  awayWinPct: number;
  projectedTotal: number;
  confidence: number;
  noBet: boolean;
  tier: "attack" | "watch" | "pass";
  reasons: string[];
};

type DirectionAudit = {
  agreement: number;
  weightedAgreement: number;
  criticalAgreement: number;
  confirmedLock: boolean;
  conflictPenalty: number;
  reliability: number;
  labels: string[];
};

type MarketAudit = {
  available: boolean;
  source: string;
  marketHomeWinPct: number | null;
  modelHomeWinPct: number;
  delta: number | null;
  agreement: boolean;
  contradiction: boolean;
  confidenceAdjustment: number;
  probabilityAnchorWeight: number;
  reason: string;
};

const ML_FEATURE_KEYS = [
  "teamEdge",
  "playerEdge",
  "statcastEdge",
  "weatherEdge",
  "pitcherEdge",
  "bullpenEdge",
  "lockEdge",
  "parkEdge",
  "formEdge",
  "totalWeatherEdge",
  "totalStatcastEdge",
  "totalPitchingEdge",
  "totalParkEdge",
  "totalBullpenEdge",
  "umpireEdge",
  "pitcherRegressionEdge"
] as const;

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function round(value: number, digits = 4) { return Number(value.toFixed(digits)); }
function meanAbs(values: number[]) { return values.reduce((sum, value) => sum + Math.abs(value), 0) / Math.max(1, values.length); }
function disagreement(a: number, b: number) { return Math.abs(a - b); }
function sign(value: number, deadZone = 0.08) { if (value > deadZone) return 1; if (value < -deadZone) return -1; return 0; }
function sideLabel(probability: number) { return probability >= 0.5 ? "home" : "away"; }

function mlFeatureVector(features: MlbGovernorFeatures): Record<string, number> {
  return Object.fromEntries(
    ML_FEATURE_KEYS.map((key) => {
      const value = features[key];
      return [key, typeof value === "number" && Number.isFinite(value) ? value : 0];
    })
  );
}

function modelSignalStrength(features: MlbGovernorFeatures) {
  return meanAbs(ML_FEATURE_KEYS.map((key) => features[key]));
}

function shrinkTowardCoinFlip(probability: number, strength: number) {
  return clamp(0.5 + (probability - 0.5) * strength, 0.39, 0.61);
}

function confidenceCapForVolatility(volatilityIndex: number) {
  if (volatilityIndex >= 1.55) return 0.59;
  if (volatilityIndex >= 1.35) return 0.62;
  return 0.65;
}

function auditDirection(features: MlbGovernorFeatures, rawHomeWinPct: number): DirectionAudit {
  const target = rawHomeWinPct >= 0.5 ? 1 : -1;
  const groups = [
    { label: "team", value: features.teamEdge, weight: 0.8, critical: false },
    { label: "player", value: features.playerEdge, weight: 1.25, critical: true },
    { label: "starter", value: features.pitcherEdge, weight: 1.45, critical: true },
    { label: "bullpen", value: features.bullpenEdge, weight: 1.2, critical: true },
    { label: "statcast", value: features.statcastEdge, weight: 0.85, critical: false },
    { label: "form", value: features.formEdge, weight: 0.65, critical: false },
    { label: "lock", value: features.lockEdge, weight: 1.05, critical: true },
    { label: "park/weather", value: features.weatherEdge + features.parkEdge, weight: 0.45, critical: false },
    // Umpire zone effect on side edge is low — it suppresses scoring symmetrically but
    // a generous-zone ump slightly helps the better offense; use as soft confirmer.
    { label: "umpire zone", value: features.umpireEdge ?? 0, weight: 0.35, critical: false },
    // xFIP regression signal: starter's true skill vs. results; medium side weight.
    { label: "pitcher regression", value: features.pitcherRegressionEdge ?? 0, weight: 0.55, critical: false }
  ];
  const active = groups.filter((group) => sign(group.value) !== 0);
  const critical = groups.filter((group) => group.critical && sign(group.value) !== 0);
  const aligned = active.filter((group) => sign(group.value) === target);
  const criticalAligned = critical.filter((group) => sign(group.value) === target);
  const totalWeight = active.reduce((sum, group) => sum + group.weight, 0);
  const alignedWeight = aligned.reduce((sum, group) => sum + group.weight, 0);
  const agreement = active.length ? aligned.length / active.length : 0.5;
  const weightedAgreement = totalWeight > 0 ? alignedWeight / totalWeight : 0.5;
  const criticalAgreement = critical.length ? criticalAligned.length / critical.length : 0.5;
  const confirmedLock = Math.abs(features.lockEdge) >= 0.12 && sign(features.lockEdge) === target;
  const conflictPenalty = clamp((1 - weightedAgreement) * 0.32 + (1 - criticalAgreement) * 0.28 + (confirmedLock ? 0 : 0.09), 0, 0.42);
  const reliability = clamp(0.25 + weightedAgreement * 0.38 + criticalAgreement * 0.24 + (confirmedLock ? 0.1 : 0), 0.22, 0.82);
  return {
    agreement: round(agreement, 3),
    weightedAgreement: round(weightedAgreement, 3),
    criticalAgreement: round(criticalAgreement, 3),
    confirmedLock,
    conflictPenalty: round(conflictPenalty, 3),
    reliability: round(reliability, 3),
    labels: aligned.map((group) => group.label)
  };
}

function auditMarket(modelHomeWinPct: number, features: MlbGovernorFeatures): MarketAudit {
  const marketHomeWinPct = typeof features.marketHomeNoVigProbability === "number" && Number.isFinite(features.marketHomeNoVigProbability)
    ? clamp(features.marketHomeNoVigProbability, 0.02, 0.98)
    : null;
  if (marketHomeWinPct == null) {
    return {
      available: false,
      source: "missing",
      marketHomeWinPct: null,
      modelHomeWinPct: round(modelHomeWinPct),
      delta: null,
      agreement: false,
      contradiction: false,
      confidenceAdjustment: -0.015,
      probabilityAnchorWeight: 0,
      reason: "Live no-vig moneyline unavailable; market sanity check cannot confirm the model."
    };
  }

  const delta = Math.abs(modelHomeWinPct - marketHomeWinPct);
  const modelSide = sideLabel(modelHomeWinPct);
  const marketSide = sideLabel(marketHomeWinPct);
  const agreement = modelSide === marketSide;
  const contradiction = !agreement && delta >= 0.045;
  const holdPenalty = typeof features.marketHold === "number" && features.marketHold > 0.085 ? -0.012 : 0;
  const confidenceAdjustment = agreement
    ? clamp(0.035 - delta * 0.18 + holdPenalty, -0.025, 0.035)
    : clamp(-0.035 - delta * 0.34 + holdPenalty, -0.095, -0.035);
  const probabilityAnchorWeight = agreement ? clamp(0.1 + delta * 0.32, 0.08, 0.18) : clamp(0.18 + delta * 0.5, 0.16, 0.28);

  return {
    available: true,
    source: features.marketSource ?? "live-market",
    marketHomeWinPct: round(marketHomeWinPct),
    modelHomeWinPct: round(modelHomeWinPct),
    delta: round(delta),
    agreement,
    contradiction,
    confidenceAdjustment: round(confidenceAdjustment),
    probabilityAnchorWeight: round(probabilityAnchorWeight),
    reason: agreement
      ? `Live no-vig market agrees on ${modelSide}; model/market gap ${round(delta, 4)}.`
      : `Live no-vig market leans ${marketSide} while model leans ${modelSide}; model/market gap ${round(delta, 4)}.`
  };
}

function anchorToMarket(modelHomeWinPct: number, market: MarketAudit) {
  if (!market.available || market.marketHomeWinPct == null) return modelHomeWinPct;
  return clamp(modelHomeWinPct * (1 - market.probabilityAnchorWeight) + market.marketHomeWinPct * market.probabilityAnchorWeight, 0.24, 0.78);
}

function probabilityCap(input: { modelRows: number; volatilityIndex: number; audit: DirectionAudit; market: MarketAudit }) {
  let cap = input.modelRows >= 1000 ? 0.642 : input.modelRows >= 300 ? 0.628 : 0.612;
  if (input.volatilityIndex >= 1.45) cap -= 0.022;
  if (input.audit.weightedAgreement < 0.64) cap -= 0.03;
  if (input.audit.criticalAgreement < 0.67) cap -= 0.035;
  if (!input.audit.confirmedLock) cap -= 0.018;
  if (input.market.available && input.market.contradiction) cap -= 0.035;
  if (!input.market.available) cap -= 0.012;
  return clamp(cap, 0.545, 0.645);
}

function shouldPass(input: { confidence: number; edgeFromCoin: number; delta?: number; audit: DirectionAudit; market: MarketAudit; volatilityIndex: number }) {
  if (input.confidence < 0.6) return true;
  if (input.edgeFromCoin < 0.04) return true;
  if (typeof input.delta === "number" && input.delta > 0.12) return true;
  if (input.audit.weightedAgreement < 0.56) return true;
  if (input.audit.criticalAgreement < 0.5) return true;
  if (!input.audit.confirmedLock && input.edgeFromCoin >= 0.075) return true;
  if (input.market.available && input.market.contradiction && input.edgeFromCoin < 0.085) return true;
  if (input.market.available && input.market.delta != null && input.market.delta > 0.14) return true;
  if (input.volatilityIndex >= 1.65 && input.edgeFromCoin < 0.065) return true;
  return false;
}

function auditReasons(rawHomeWinPct: number, adjustedHomeWinPct: number, audit: DirectionAudit, market: MarketAudit) {
  return [
    `Raw ${sideLabel(rawHomeWinPct)} lean ${round(rawHomeWinPct)} tightened to ${round(adjustedHomeWinPct)} after data-agreement and market-sanity gates.`,
    `Direction agreement ${round(audit.weightedAgreement * 100, 1)}%; critical agreement ${round(audit.criticalAgreement * 100, 1)}%.`,
    audit.confirmedLock ? "Starter/lineup lock supports the lean." : "Starter/lineup lock is not strong enough for an aggressive winner call.",
    market.reason,
    audit.labels.length ? `Aligned modules: ${audit.labels.join(", ")}.` : "No major modules aligned strongly enough."
  ];
}

export async function governMlbProjection(input: { rulesHomeWinPct: number; rulesProjectedTotal: number; volatilityIndex: number; features: MlbGovernorFeatures }): Promise<MlbGovernedProjection> {
  const model = await getCachedMlbMlModel();
  const modelFeatures = mlFeatureVector(input.features);
  const signalStrength = modelSignalStrength(input.features);
  const audit = auditDirection(input.features, input.rulesHomeWinPct);
  const conservativeRulesHomeWinPct = shrinkTowardCoinFlip(input.rulesHomeWinPct, audit.reliability);
  const rulesMarket = auditMarket(conservativeRulesHomeWinPct, input.features);
  const marketAnchoredRulesHomeWinPct = anchorToMarket(conservativeRulesHomeWinPct, rulesMarket);
  const umpireKnownBoost = typeof input.features.umpireEdge === "number" ? 0.012 : 0;
  const regressionSignalBoost = typeof input.features.pitcherRegressionEdge === "number" && Math.abs(input.features.pitcherRegressionEdge) >= 0.3 ? 0.014 : 0;
  const baseConfidence = clamp(0.42 + signalStrength / 22 + audit.weightedAgreement * 0.14 + audit.criticalAgreement * 0.08 - audit.conflictPenalty - (input.volatilityIndex - 1) * 0.12 + rulesMarket.confidenceAdjustment + umpireKnownBoost + regressionSignalBoost, 0.22, 0.7);

  if (!model?.ok) {
    const edgeFromCoin = Math.abs(marketAnchoredRulesHomeWinPct - 0.5);
    const confidence = clamp(baseConfidence + edgeFromCoin * 0.28, 0.22, Math.min(0.64, confidenceCapForVolatility(input.volatilityIndex)));
    const noBet = shouldPass({ confidence, edgeFromCoin, audit, market: rulesMarket, volatilityIndex: input.volatilityIndex });
    return {
      source: "rules-only",
      homeWinPct: round(marketAnchoredRulesHomeWinPct),
      awayWinPct: round(1 - marketAnchoredRulesHomeWinPct),
      projectedTotal: round(clamp(input.rulesProjectedTotal + (input.features.umpireEdge ?? 0) * -0.12, 4.5, 16.5), 3),
      confidence: round(confidence),
      noBet,
      tier: !noBet && confidence >= 0.64 && edgeFromCoin >= 0.06 && !rulesMarket.contradiction ? "attack" : !noBet ? "watch" : "pass",
      reasons: [
        "ML model unavailable or undertrained; winner side requires data agreement and live no-vig market sanity instead of raw score stacking.",
        ...auditReasons(input.rulesHomeWinPct, marketAnchoredRulesHomeWinPct, audit, rulesMarket),
        `Signal strength ${round(signalStrength, 3)}.`,
        `Volatility ${input.volatilityIndex}.`
      ]
    };
  }

  const ml = scoreMlbMlModel(model, modelFeatures);
  const conservativeMlHomeWinPct = shrinkTowardCoinFlip(ml.homeWinProbability, clamp(model.rows >= 1000 ? 0.74 : model.rows >= 300 ? 0.64 : 0.54, 0.5, 0.76));
  const delta = disagreement(conservativeRulesHomeWinPct, conservativeMlHomeWinPct);
  const agreementBoost = clamp(0.07 - delta, -0.08, 0.05);
  const mlWeight = clamp(model.rows >= 1000 ? 0.4 : model.rows >= 300 ? 0.32 : 0.22, 0.18, 0.42);
  const rulesWeight = 1 - mlWeight;
  const blendedBeforeMarket = conservativeRulesHomeWinPct * rulesWeight + conservativeMlHomeWinPct * mlWeight;
  const market = auditMarket(blendedBeforeMarket, input.features);
  const blended = anchorToMarket(blendedBeforeMarket, market);
  const cap = probabilityCap({ modelRows: model.rows, volatilityIndex: input.volatilityIndex, audit, market });
  const homeWinPct = clamp(blended, 1 - cap, cap);
  const umpireTotalAdjust = (input.features.umpireEdge ?? 0) * -0.12; // generous zone = more K, fewer runs
  const projectedTotal = clamp(input.rulesProjectedTotal * 0.62 + ml.projectedTotal * 0.38 + umpireTotalAdjust, 4.5, 16.5);
  const edgeFromCoin = Math.abs(homeWinPct - 0.5);
  const confidence = clamp(baseConfidence + edgeFromCoin * 0.34 + agreementBoost + market.confidenceAdjustment, 0.2, Math.min(0.73, confidenceCapForVolatility(input.volatilityIndex) + 0.045));
  const noBet = shouldPass({ confidence, edgeFromCoin, delta, audit, market, volatilityIndex: input.volatilityIndex });

  return {
    source: "rules+ml",
    homeWinPct: round(homeWinPct),
    awayWinPct: round(1 - homeWinPct),
    projectedTotal: round(projectedTotal, 3),
    confidence: round(confidence),
    noBet,
    tier: !noBet && confidence >= 0.67 && edgeFromCoin >= 0.065 && audit.weightedAgreement >= 0.68 && audit.criticalAgreement >= 0.67 && !market.contradiction ? "attack" : !noBet ? "watch" : "pass",
    reasons: [
      `ML blend active with ${model.rows} rows; winner side must clear agreement, lock, volatility, ML disagreement, and live no-vig market gates.`,
      ...auditReasons(input.rulesHomeWinPct, homeWinPct, audit, market),
      `Rules/ML disagreement ${round(delta, 4)}.`,
      `Probability cap ${round(cap)} from volatility/data agreement/market sanity.`,
      noBet ? "Selective prediction gate says pass unless market offers extreme value." : "Projection cleared tighter winner-selection gate."
    ]
  };
}
