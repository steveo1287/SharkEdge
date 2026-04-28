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

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function round(value: number, digits = 4) { return Number(value.toFixed(digits)); }
function meanAbs(values: number[]) { return values.reduce((sum, value) => sum + Math.abs(value), 0) / Math.max(1, values.length); }
function disagreement(a: number, b: number) { return Math.abs(a - b); }

function shrinkTowardCoinFlip(probability: number, strength: number) {
  return clamp(0.5 + (probability - 0.5) * strength, 0.38, 0.62);
}

function confidenceCapForVolatility(volatilityIndex: number) {
  if (volatilityIndex >= 1.55) return 0.61;
  if (volatilityIndex >= 1.35) return 0.64;
  return 0.67;
}

export async function governMlbProjection(input: { rulesHomeWinPct: number; rulesProjectedTotal: number; volatilityIndex: number; features: MlbGovernorFeatures }): Promise<MlbGovernedProjection> {
  const model = await getCachedMlbMlModel();
  const signalStrength = meanAbs(Object.values(input.features));
  const reliability = clamp(signalStrength / 8, 0.35, 0.72);
  const conservativeRulesHomeWinPct = shrinkTowardCoinFlip(input.rulesHomeWinPct, reliability);
  const baseConfidence = clamp(0.45 + signalStrength / 18 - (input.volatilityIndex - 1) * 0.12, 0.25, 0.72);

  if (!model?.ok) {
    const edgeFromCoin = Math.abs(conservativeRulesHomeWinPct - 0.5);
    const confidence = clamp(baseConfidence + edgeFromCoin * 0.32, 0.25, Math.min(0.66, confidenceCapForVolatility(input.volatilityIndex)));
    const noBet = confidence < 0.59 || edgeFromCoin < 0.04;
    return {
      source: "rules-only",
      homeWinPct: round(conservativeRulesHomeWinPct),
      awayWinPct: round(1 - conservativeRulesHomeWinPct),
      projectedTotal: round(input.rulesProjectedTotal, 3),
      confidence: round(confidence),
      noBet,
      tier: !noBet && confidence >= 0.65 ? "attack" : !noBet ? "watch" : "pass",
      reasons: [
        "ML model unavailable or undertrained; rules edge was shrunk toward 50/50 to avoid fake 70% MLB sides.",
        `Raw rules ${round(input.rulesHomeWinPct)} adjusted to ${round(conservativeRulesHomeWinPct)}.`,
        `Signal strength ${round(signalStrength, 3)}.`,
        `Volatility ${input.volatilityIndex}.`
      ]
    };
  }

  const ml = scoreMlbMlModel(model, input.features);
  const conservativeMlHomeWinPct = shrinkTowardCoinFlip(ml.homeWinProbability, clamp(model.rows >= 1000 ? 0.78 : model.rows >= 300 ? 0.68 : 0.56, 0.5, 0.8));
  const delta = disagreement(conservativeRulesHomeWinPct, conservativeMlHomeWinPct);
  const agreementBoost = clamp(0.08 - delta, -0.08, 0.06);
  const mlWeight = clamp(model.rows >= 1000 ? 0.42 : model.rows >= 300 ? 0.34 : 0.24, 0.18, 0.45);
  const rulesWeight = 1 - mlWeight;
  const blended = conservativeRulesHomeWinPct * rulesWeight + conservativeMlHomeWinPct * mlWeight;
  const probabilityCap = input.volatilityIndex >= 1.45 ? 0.635 : model.rows >= 1000 ? 0.665 : 0.65;
  const homeWinPct = clamp(blended, 1 - probabilityCap, probabilityCap);
  const projectedTotal = clamp(input.rulesProjectedTotal * 0.62 + ml.projectedTotal * 0.38, 4.5, 16.5);
  const edgeFromCoin = Math.abs(homeWinPct - 0.5);
  const confidence = clamp(baseConfidence + edgeFromCoin * 0.38 + agreementBoost, 0.2, Math.min(0.76, confidenceCapForVolatility(input.volatilityIndex) + 0.06));
  const noBet = confidence < 0.6 || edgeFromCoin < 0.04 || delta > 0.14;

  return {
    source: "rules+ml",
    homeWinPct: round(homeWinPct),
    awayWinPct: round(1 - homeWinPct),
    projectedTotal: round(projectedTotal, 3),
    confidence: round(confidence),
    noBet,
    tier: !noBet && confidence >= 0.68 && edgeFromCoin >= 0.065 ? "attack" : !noBet ? "watch" : "pass",
    reasons: [
      `ML blend active with ${model.rows} rows, but MLB side probability is capped unless confirmed data supports a rare outlier.`,
      `Raw rules ${round(input.rulesHomeWinPct)} adjusted to ${round(conservativeRulesHomeWinPct)} before blend.`,
      `Rules/ML disagreement ${round(delta, 4)}.`,
      `Signal strength ${round(signalStrength, 3)}.`,
      noBet ? "Selective prediction gate says pass unless market offers extreme value." : "Projection cleared selective prediction gate."
    ]
  };
}
