function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clampProb(value: number) {
  // Avoid returning 0/1 which would explode implied-odds conversions.
  return clamp(value, 0.0001, 0.9999);
}

export function americanToImpliedProb(odds: number): number | null {
  if (typeof odds !== "number" || !Number.isFinite(odds) || odds === 0) {
    return null;
  }

  const implied = odds < 0 ? Math.abs(odds) / (Math.abs(odds) + 100) : 100 / (odds + 100);
  if (!Number.isFinite(implied)) return null;
  return clampProb(implied);
}

export function impliedProbToAmerican(prob: number): number | null {
  if (typeof prob !== "number" || !Number.isFinite(prob)) return null;
  const p = clampProb(prob);

  if (p === 0.5) return -100;
  if (p > 0.5) {
    // Favorite (negative odds)
    const odds = -Math.round((p / (1 - p)) * 100);
    return Number.isFinite(odds) ? odds : null;
  }

  // Underdog (positive odds)
  const odds = Math.round(((1 - p) / p) * 100);
  return Number.isFinite(odds) ? odds : null;
}

export function removeVigTwoWayMarket(
  probA: number,
  probB: number
): { probA: number; probB: number } | null {
  if (
    typeof probA !== "number" ||
    typeof probB !== "number" ||
    !Number.isFinite(probA) ||
    !Number.isFinite(probB)
  ) {
    return null;
  }

  const a = clampProb(probA);
  const b = clampProb(probB);
  const total = a + b;
  if (!Number.isFinite(total) || total <= 0) return null;

  return {
    probA: clampProb(a / total),
    probB: clampProb(b / total)
  };
}

export function probabilityEdge(modelProb: number | null, marketProb: number | null): number | null {
  if (typeof modelProb !== "number" || typeof marketProb !== "number") return null;
  if (!Number.isFinite(modelProb) || !Number.isFinite(marketProb)) return null;
  return clamp(modelProb, 0, 1) - clamp(marketProb, 0, 1);
}

