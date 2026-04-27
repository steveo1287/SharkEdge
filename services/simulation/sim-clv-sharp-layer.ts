export type ClvSharpInput = {
  entryOdds?: number | null;
  currentOdds?: number | null;
  closingOdds?: number | null;
  entryLine?: number | null;
  currentLine?: number | null;
  closingLine?: number | null;
  lineMovement?: number | null;
  marketDeltaAmerican?: number | null;
  bookCount?: number | null;
  side?: string | null;
};

export type ClvSharpSignal = {
  probabilityShift: number;
  confidenceShift: number;
  varianceShift: number;
  clvAmericanDelta: number | null;
  clvLineDelta: number | null;
  sharpMoneyScore: number;
  reverseLineMove: boolean;
  steamMove: boolean;
  clvState: "positive" | "negative" | "neutral" | "pending";
  reasons: string[];
  riskFlags: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sideDirection(side?: string | null) {
  const raw = String(side ?? "over").toLowerCase();
  if (raw.includes("under")) return -1;
  if (raw.includes("away") || raw.includes("dog")) return -1;
  return 1;
}

function priceDeltaForSide(entryOdds?: number | null, comparisonOdds?: number | null) {
  if (typeof entryOdds !== "number" || typeof comparisonOdds !== "number") return null;
  return comparisonOdds - entryOdds;
}

export function buildClvSharpSignal(input: ClvSharpInput): ClvSharpSignal {
  const dir = sideDirection(input.side);
  const reasons: string[] = [];
  const riskFlags: string[] = [];
  let probabilityShift = 0;
  let confidenceShift = 0;
  let varianceShift = 0;
  let sharpMoneyScore = 0;

  const clvAmericanDelta = priceDeltaForSide(input.entryOdds, input.closingOdds ?? input.currentOdds ?? null);
  const clvLineDelta =
    typeof input.entryLine === "number" && typeof (input.closingLine ?? input.currentLine) === "number"
      ? ((input.closingLine ?? input.currentLine) as number) - input.entryLine
      : null;

  if (typeof clvAmericanDelta === "number") {
    const favorablePrice = -clvAmericanDelta * dir;
    const priceShift = clamp(favorablePrice / 1200, -0.035, 0.035);
    probabilityShift += priceShift;
    sharpMoneyScore += priceShift * 120;

    if (favorablePrice > 8) {
      confidenceShift += 0.025;
      reasons.push("Positive CLV pressure on price");
    } else if (favorablePrice < -8) {
      confidenceShift -= 0.03;
      varianceShift += 0.04;
      riskFlags.push("Negative CLV pressure on price");
    }
  }

  if (typeof clvLineDelta === "number") {
    const favorableLine = clvLineDelta * dir;
    const lineShift = clamp(favorableLine * 0.018, -0.045, 0.045);
    probabilityShift += lineShift;
    sharpMoneyScore += lineShift * 100;

    if (favorableLine > 0.15) {
      confidenceShift += 0.025;
      reasons.push("Positive CLV pressure on line");
    } else if (favorableLine < -0.15) {
      confidenceShift -= 0.025;
      riskFlags.push("Line moved away from entry");
    }
  }

  const bookCount = input.bookCount ?? 1;
  const directionalMove = typeof input.lineMovement === "number" ? input.lineMovement * dir : 0;
  const marketDelta = typeof input.marketDeltaAmerican === "number" ? input.marketDeltaAmerican : 0;

  const reverseLineMove = Math.abs(directionalMove) >= 0.25 && Math.sign(directionalMove) !== Math.sign(marketDelta || directionalMove);
  const steamMove = Math.abs(directionalMove) >= 0.5 && bookCount >= 3;

  if (steamMove) {
    const steamShift = clamp(directionalMove * 0.012, -0.035, 0.035);
    probabilityShift += steamShift;
    sharpMoneyScore += steamShift * 120;
    if (steamShift > 0) reasons.push("Multi-book steam supports selected side");
    else riskFlags.push("Multi-book steam against selected side");
  }

  if (reverseLineMove) {
    varianceShift += 0.05;
    confidenceShift += directionalMove > 0 ? 0.015 : -0.02;
    if (directionalMove > 0) reasons.push("Reverse line movement leans sharp-positive");
    else riskFlags.push("Reverse line movement leans sharp-negative");
  }

  probabilityShift = clamp(probabilityShift, -0.09, 0.09);
  confidenceShift = clamp(confidenceShift, -0.08, 0.08);
  varianceShift = clamp(varianceShift, 0, 0.18);
  sharpMoneyScore = clamp(sharpMoneyScore + confidenceShift * 100, -12, 12);

  const clvState =
    clvAmericanDelta == null && clvLineDelta == null
      ? "pending"
      : probabilityShift > 0.012
        ? "positive"
        : probabilityShift < -0.012
          ? "negative"
          : "neutral";

  if (!reasons.length && !riskFlags.length) reasons.push("CLV/sharp layer neutral or pending");

  return {
    probabilityShift,
    confidenceShift,
    varianceShift,
    clvAmericanDelta,
    clvLineDelta,
    sharpMoneyScore,
    reverseLineMove,
    steamMove,
    clvState,
    reasons,
    riskFlags
  };
}
