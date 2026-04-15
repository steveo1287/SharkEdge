export type NoVigResult = {
  probabilities: number[];
  holdPct: number;
};

export type ArbitrageResult = {
  arbitragePct: number;
  marginPct: number;
  isArbitrage: boolean;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function americanToDecimalOdds(odds: number | null | undefined) {
  if (!isFiniteNumber(odds) || odds === 0) {
    return null;
  }

  if (odds > 0) {
    return 1 + odds / 100;
  }

  return 1 + 100 / Math.abs(odds);
}

export function decimalToAmericanOdds(decimalOdds: number | null | undefined) {
  if (!isFiniteNumber(decimalOdds) || decimalOdds <= 1) {
    return null;
  }

  if (decimalOdds >= 2) {
    return Math.round((decimalOdds - 1) * 100);
  }

  return Math.round(-100 / (decimalOdds - 1));
}

export function decimalToImpliedProbability(decimalOdds: number | null | undefined) {
  if (!isFiniteNumber(decimalOdds) || decimalOdds <= 1) {
    return null;
  }

  return 1 / decimalOdds;
}

export function americanToImpliedProbability(odds: number | null | undefined) {
  const decimalOdds = americanToDecimalOdds(odds);
  return decimalToImpliedProbability(decimalOdds);
}

export function impliedProbabilityToAmericanOdds(probability: number | null | undefined) {
  if (!isFiniteNumber(probability) || probability <= 0 || probability >= 1) {
    return null;
  }

  if (probability >= 0.5) {
    return Math.round((-100 * probability) / (1 - probability));
  }

  return Math.round((100 * (1 - probability)) / probability);
}

export function fairOddsDecimalFromProbability(probability: number | null | undefined) {
  if (!isFiniteNumber(probability) || probability <= 0 || probability >= 1) {
    return null;
  }

  return Number((1 / probability).toFixed(4));
}

export function fairOddsAmericanFromProbability(probability: number | null | undefined) {
  return impliedProbabilityToAmericanOdds(probability);
}

export function removeVigFromProbabilities(probabilities: Array<number | null | undefined>): NoVigResult | null {
  const valid = probabilities.filter((value): value is number => isFiniteNumber(value) && value > 0);
  if (!valid.length) {
    return null;
  }

  const total = valid.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return null;
  }

  return {
    probabilities: valid.map((value) => value / total),
    holdPct: Number(((total - 1) * 100).toFixed(4))
  };
}

export function noVigProbabilityFromAmericanPair(
  sideOddsAmerican: number | null | undefined,
  oppositeOddsAmerican: number | null | undefined
) {
  const sideProbability = americanToImpliedProbability(sideOddsAmerican);
  const oppositeProbability = americanToImpliedProbability(oppositeOddsAmerican);
  const stripped = removeVigFromProbabilities([sideProbability, oppositeProbability]);
  if (!stripped || stripped.probabilities.length < 2) {
    return null;
  }

  return {
    sideProbability: stripped.probabilities[0],
    oppositeProbability: stripped.probabilities[1],
    holdPct: stripped.holdPct
  };
}

export function calculateHoldPct(probabilities: Array<number | null | undefined>) {
  const valid = probabilities.filter((value): value is number => isFiniteNumber(value) && value > 0);
  if (!valid.length) {
    return null;
  }

  return Number(((valid.reduce((sum, value) => sum + value, 0) - 1) * 100).toFixed(4));
}

export function calculateBreakEvenProbability(oddsAmerican: number | null | undefined) {
  const impliedProbability = americanToImpliedProbability(oddsAmerican);
  return isFiniteNumber(impliedProbability) ? impliedProbability : null;
}

export function calculateExpectedValuePerUnit(args: {
  oddsAmerican?: number | null;
  decimalOdds?: number | null;
  fairProbability: number | null | undefined;
}) {
  const decimalOdds =
    isFiniteNumber(args.decimalOdds) && args.decimalOdds > 1
      ? args.decimalOdds
      : americanToDecimalOdds(args.oddsAmerican);

  if (!isFiniteNumber(decimalOdds) || !isFiniteNumber(args.fairProbability)) {
    return null;
  }

  if (args.fairProbability <= 0 || args.fairProbability >= 1) {
    return null;
  }

  return decimalOdds * args.fairProbability - 1;
}

export function calculateExpectedValuePct(args: {
  oddsAmerican?: number | null;
  decimalOdds?: number | null;
  fairProbability: number | null | undefined;
}) {
  const evPerUnit = calculateExpectedValuePerUnit(args);
  return isFiniteNumber(evPerUnit) ? Number((evPerUnit * 100).toFixed(4)) : null;
}

export function calculateKellyFraction(args: {
  oddsAmerican?: number | null;
  decimalOdds?: number | null;
  fairProbability: number | null | undefined;
  fraction?: number;
}) {
  const decimalOdds =
    isFiniteNumber(args.decimalOdds) && args.decimalOdds > 1
      ? args.decimalOdds
      : americanToDecimalOdds(args.oddsAmerican);

  if (!isFiniteNumber(decimalOdds) || !isFiniteNumber(args.fairProbability)) {
    return null;
  }

  if (args.fairProbability <= 0 || args.fairProbability >= 1) {
    return null;
  }

  const b = decimalOdds - 1;
  if (b <= 0) {
    return null;
  }

  const q = 1 - args.fairProbability;
  const rawFraction = (b * args.fairProbability - q) / b;
  if (!Number.isFinite(rawFraction)) {
    return null;
  }

  const scaledFraction = Math.max(0, rawFraction) * (args.fraction ?? 1);
  return Number(scaledFraction.toFixed(6));
}

export function calculateArbitrageFromDecimalOdds(decimalOdds: Array<number | null | undefined>): ArbitrageResult | null {
  const valid = decimalOdds.filter((value): value is number => isFiniteNumber(value) && value > 1);
  if (!valid.length) {
    return null;
  }

  const arbitragePct = valid.reduce((sum, value) => sum + 1 / value, 0);
  return {
    arbitragePct: Number(arbitragePct.toFixed(6)),
    marginPct: Number(((1 - arbitragePct) * 100).toFixed(4)),
    isArbitrage: arbitragePct < 1
  };
}

export function calculateArbitrageFromAmericanOdds(americanOdds: Array<number | null | undefined>) {
  const decimals = americanOdds.map((odds) => americanToDecimalOdds(odds));
  return calculateArbitrageFromDecimalOdds(decimals);
}

export function calculateClvPct(args: {
  betOddsAmerican: number | null | undefined;
  closingOddsAmerican: number | null | undefined;
}) {
  const openProbability = americanToImpliedProbability(args.betOddsAmerican);
  const closeProbability = americanToImpliedProbability(args.closingOddsAmerican);

  if (!isFiniteNumber(openProbability) || !isFiniteNumber(closeProbability)) {
    return null;
  }

  return Number(((closeProbability - openProbability) * 100).toFixed(4));
}

export function fairProbabilityFromConsensusNoVig(args: {
  sideOddsAmerican: number | null | undefined;
  oppositeOddsAmerican: number | null | undefined;
}) {
  const stripped = noVigProbabilityFromAmericanPair(args.sideOddsAmerican, args.oppositeOddsAmerican);
  return stripped ? stripped.sideProbability : null;
}
