export type MarketIntelligenceInput = {
  odds: number;
  averageOdds?: number | null;
  bestAvailableOdds?: number | null;
  lineMovement?: number | null;
  bookCount?: number | null;
  marketDeltaAmerican?: number | null;
  expectedValuePct?: number | null;
  side?: string | null;
};

export type MarketIntelligenceSignal = {
  probabilityShift: number;
  confidenceShift: number;
  varianceShift: number;
  reasons: string[];
  riskFlags: string[];
  sharpScore: number;
  clvPressure: "positive" | "negative" | "neutral";
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function buildMarketIntelligenceSignal(input: MarketIntelligenceInput): MarketIntelligenceSignal {
  let probabilityShift = 0;
  let confidenceShift = 0;
  let varianceShift = 0;
  let sharpScore = 0;
  const reasons: string[] = [];
  const riskFlags: string[] = [];

  const bookCount = input.bookCount ?? 1;
  if (bookCount >= 4) {
    confidenceShift += 0.025;
    reasons.push("Broad book coverage supports market read");
  } else if (bookCount <= 1) {
    confidenceShift -= 0.035;
    varianceShift += 0.08;
    riskFlags.push("Thin book coverage");
  }

  if (typeof input.lineMovement === "number" && Number.isFinite(input.lineMovement)) {
    const side = String(input.side ?? "over").toLowerCase();
    const directional = side.includes("under") ? -input.lineMovement : input.lineMovement;
    const moveShift = clamp(directional * 0.012, -0.045, 0.045);
    probabilityShift += moveShift;
    sharpScore += moveShift * 100;

    if (moveShift > 0.01) reasons.push("Line movement supports selected side");
    if (moveShift < -0.01) riskFlags.push("Line movement against selected side");
  }

  if (typeof input.marketDeltaAmerican === "number" && Number.isFinite(input.marketDeltaAmerican)) {
    const deltaShift = clamp(input.marketDeltaAmerican / 1000, -0.035, 0.035);
    probabilityShift += deltaShift;
    sharpScore += deltaShift * 80;

    if (deltaShift > 0.01) reasons.push("Price delta shows market cushion");
    if (deltaShift < -0.01) riskFlags.push("Price delta has deteriorated");
  }

  if (typeof input.expectedValuePct === "number" && Number.isFinite(input.expectedValuePct)) {
    const evShift = clamp(input.expectedValuePct / 300, -0.03, 0.04);
    probabilityShift += evShift;
    confidenceShift += clamp(input.expectedValuePct / 500, -0.015, 0.025);

    if (input.expectedValuePct > 2) reasons.push("Existing EV model confirms edge");
    if (input.expectedValuePct < -1) riskFlags.push("Existing EV model conflicts");
  }

  if (typeof input.averageOdds === "number" && typeof input.bestAvailableOdds === "number") {
    const bestGap = input.bestAvailableOdds - input.averageOdds;
    if (bestGap > 8) {
      confidenceShift += 0.015;
      reasons.push("Best price beats market average");
    } else if (bestGap < -8) {
      confidenceShift -= 0.02;
      riskFlags.push("Best price trails market average");
    }
  }

  probabilityShift = clamp(probabilityShift, -0.08, 0.08);
  confidenceShift = clamp(confidenceShift, -0.08, 0.08);
  varianceShift = clamp(varianceShift, -0.05, 0.15);
  sharpScore = clamp(sharpScore + confidenceShift * 100, -10, 10);

  const clvPressure = probabilityShift > 0.012 ? "positive" : probabilityShift < -0.012 ? "negative" : "neutral";

  if (!reasons.length) reasons.push("Market layer neutral; no strong price signal");

  return {
    probabilityShift,
    confidenceShift,
    varianceShift,
    reasons,
    riskFlags,
    sharpScore,
    clvPressure
  };
}
