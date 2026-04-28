export function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function clampProbability(probability: number, min = 0.0001, max = 0.9999) {
  if (!Number.isFinite(probability)) {
    return 0.5;
  }
  return clampNumber(probability, min, max);
}

export function americanToImpliedProbability(odds: number | null | undefined) {
  if (typeof odds !== "number" || !Number.isFinite(odds) || odds === 0) {
    return null;
  }

  if (odds > 0) {
    return 100 / (odds + 100);
  }

  const abs = Math.abs(odds);
  return abs / (abs + 100);
}

export function removeTwoWayVig(leftOdds: number | null | undefined, rightOdds: number | null | undefined) {
  const left = americanToImpliedProbability(leftOdds);
  const right = americanToImpliedProbability(rightOdds);

  if (left === null || right === null) {
    return null;
  }

  const impliedTotal = left + right;
  if (impliedTotal <= 0) {
    return null;
  }

  return {
    left: clampProbability(left / impliedTotal),
    right: clampProbability(right / impliedTotal),
    hold: impliedTotal - 1
  };
}

export function logit(probability: number) {
  const p = clampProbability(probability);
  return Math.log(p / (1 - p));
}

export function sigmoid(value: number) {
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }

  const z = Math.exp(value);
  return z / (1 + z);
}

export function applyLogitTemperature(probability: number, temperature = 1) {
  const safeTemperature = Number.isFinite(temperature) && temperature > 0 ? temperature : 1;
  return clampProbability(sigmoid(logit(probability) / safeTemperature), 0.01, 0.99);
}

function erf(value: number) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-x * x);
  return sign * y;
}

export function normalCdf(value: number, mean = 0, stdDev = 1) {
  if (!Number.isFinite(value) || !Number.isFinite(mean) || !Number.isFinite(stdDev) || stdDev <= 0) {
    return 0.5;
  }
  return clampProbability(0.5 * (1 + erf((value - mean) / (stdDev * Math.sqrt(2)))), 0.0001, 0.9999);
}
