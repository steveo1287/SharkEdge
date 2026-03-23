export function americanToImpliedProbability(odds: number) {
  if (odds === 0) {
    return 0;
  }

  if (odds > 0) {
    return 100 / (odds + 100);
  }

  return Math.abs(odds) / (Math.abs(odds) + 100);
}

export function americanToDecimal(odds: number) {
  if (odds > 0) {
    return 1 + odds / 100;
  }

  return 1 + 100 / Math.abs(odds);
}

export function calculateToWin(stake: number, odds: number) {
  const decimal = americanToDecimal(odds);
  return Number((stake * (decimal - 1)).toFixed(2));
}

export function calculatePotentialPayout(stake: number, odds: number) {
  return Number((stake + calculateToWin(stake, odds)).toFixed(2));
}
