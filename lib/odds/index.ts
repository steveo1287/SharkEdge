import {
  americanToDecimalOdds,
  americanToImpliedProbability,
  calculateExpectedValuePct,
  calculateKellyFraction,
  decimalToImpliedProbability,
  fairOddsAmericanFromProbability,
  fairOddsDecimalFromProbability,
  fairProbabilityFromConsensusNoVig,
  calculateHoldPct,
  calculateBreakEvenProbability,
  calculateArbitrageFromAmericanOdds,
  calculateClvPct,
  removeVigFromProbabilities
} from "@/lib/math";

export {
  fairOddsAmericanFromProbability,
  fairOddsDecimalFromProbability,
  fairProbabilityFromConsensusNoVig,
  calculateHoldPct,
  calculateBreakEvenProbability,
  calculateArbitrageFromAmericanOdds,
  calculateClvPct
};

export function americanToDecimal(odds: number) {
  return americanToDecimalOdds(odds);
}

export function americanToImplied(odds: number) {
  return americanToImpliedProbability(odds);
}

export function decimalToImplied(decimal: number) {
  return decimalToImpliedProbability(decimal);
}

export function calculateEV(args: { offeredOddsAmerican: number; modelProbability: number }) {
  return calculateExpectedValuePct({
    oddsAmerican: args.offeredOddsAmerican,
    fairProbability: args.modelProbability
  });
}

export function kellySize(args: {
  offeredOddsAmerican: number;
  modelProbability: number;
  fraction?: number;
}) {
  const fraction = calculateKellyFraction({
    oddsAmerican: args.offeredOddsAmerican,
    fairProbability: args.modelProbability,
    fraction: args.fraction
  });

  return typeof fraction === "number" ? Number((fraction * 100).toFixed(4)) : null;
}

export function stripVig(probabilities: number[]) {
  return removeVigFromProbabilities(probabilities)?.probabilities ?? [];
}
