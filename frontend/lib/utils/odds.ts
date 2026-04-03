import {
  americanToDecimalOdds,
  americanToImpliedProbability,
  calculateBreakEvenProbability
} from "@/lib/math";

export function americanToImpliedProbabilityLegacy(odds: number) {
  return americanToImpliedProbability(odds) ?? 0;
}

export { americanToImpliedProbabilityLegacy as americanToImpliedProbability };

export function americanToDecimal(odds: number) {
  return americanToDecimalOdds(odds) ?? 1;
}

export function calculateToWin(stake: number, odds: number) {
  if (!Number.isFinite(stake) || !Number.isFinite(odds) || stake <= 0 || odds === 0) {
    return 0;
  }

  return odds > 0 ? Number(((stake * odds) / 100).toFixed(2)) : Number(((stake * 100) / Math.abs(odds)).toFixed(2));
}

export function calculatePotentialPayout(stake: number, odds: number) {
  return Number((stake + calculateToWin(stake, odds)).toFixed(2));
}

export function impliedProbabilityToBreakEvenPct(odds: number) {
  const probability = calculateBreakEvenProbability(odds);
  return typeof probability === "number" ? Number((probability * 100).toFixed(2)) : 0;
}
