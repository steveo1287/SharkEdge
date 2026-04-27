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

export async function governMlbProjection(input: { rulesHomeWinPct: number; rulesProjectedTotal: number; volatilityIndex: number; features: MlbGovernorFeatures }): Promise<MlbGovernedProjection> {
  const model = await getCachedMlbMlModel();
  const signalStrength = meanAbs(Object.values(input.features));
  const baseConfidence = clamp(0.48 + signalStrength / 14 - (input.volatilityIndex - 1) * 0.09, 0.25, 0.82);
  if (!model?.ok) {
    const edgeFromCoin = Math.abs(input.rulesHomeWinPct - 0.5);
    const confidence = clamp(baseConfidence + edgeFromCoin * 0.45, 0.25, 0.78);
    const noBet = confidence < 0.58 || edgeFromCoin < 0.035;
    return { source: "rules-only", homeWinPct: round(input.rulesHomeWinPct), awayWinPct: round(1 - input.rulesHomeWinPct), projectedTotal: round(input.rulesProjectedTotal, 3), confidence: round(confidence), noBet, tier: !noBet && confidence >= 0.66 ? "attack" : !noBet ? "watch" : "pass", reasons: ["ML model unavailable or undertrained; rules engine used.", `Signal strength ${round(signalStrength, 3)}.`, `Volatility ${input.volatilityIndex}.`] };
  }
  const ml = scoreMlbMlModel(model, input.features);
  const delta = disagreement(input.rulesHomeWinPct, ml.homeWinProbability);
  const agreementBoost = clamp(0.1 - delta, -0.08, 0.08);
  const mlWeight = clamp(model.rows >= 1000 ? 0.42 : model.rows >= 300 ? 0.34 : 0.24, 0.18, 0.45);
  const rulesWeight = 1 - mlWeight;
  const homeWinPct = clamp(input.rulesHomeWinPct * rulesWeight + ml.homeWinProbability * mlWeight, 0.24, 0.78);
  const projectedTotal = clamp(input.rulesProjectedTotal * 0.62 + ml.projectedTotal * 0.38, 4.5, 16.5);
  const edgeFromCoin = Math.abs(homeWinPct - 0.5);
  const confidence = clamp(baseConfidence + edgeFromCoin * 0.5 + agreementBoost, 0.2, 0.88);
  const noBet = confidence < 0.6 || edgeFromCoin < 0.035 || delta > 0.18;
  return { source: "rules+ml", homeWinPct: round(homeWinPct), awayWinPct: round(1 - homeWinPct), projectedTotal: round(projectedTotal, 3), confidence: round(confidence), noBet, tier: !noBet && confidence >= 0.68 && edgeFromCoin >= 0.07 ? "attack" : !noBet ? "watch" : "pass", reasons: [`ML blend active with ${model.rows} rows.`, `Rules/ML disagreement ${round(delta, 4)}.`, `Signal strength ${round(signalStrength, 3)}.`, noBet ? "Selective prediction gate says pass unless market offers extreme value." : "Projection cleared selective prediction gate."] };
}
