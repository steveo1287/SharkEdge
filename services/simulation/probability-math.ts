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

export function inverseNormalCdf(probability: number) {
  const p = clampProbability(probability, 0.000001, 0.999999);

  const a = [
    -3.969683028665376e+01,
    2.209460984245205e+02,
    -2.759285104469687e+02,
    1.383577518672690e+02,
    -3.066479806614716e+01,
    2.506628277459239e+00
  ];
  const b = [
    -5.447609879822406e+01,
    1.615858368580409e+02,
    -1.556989798598866e+02,
    6.680131188771972e+01,
    -1.328068155288572e+01
  ];
  const c = [
    -7.784894002430293e-03,
    -3.223964580411365e-01,
    -2.400758277161838e+00,
    -2.549732539343734e+00,
    4.374664141464968e+00,
    2.938163982698783e+00
  ];
  const d = [
    7.784695709041462e-03,
    3.224671290700398e-01,
    2.445134137142996e+00,
    3.754408661907416e+00
  ];

  const low = 0.02425;
  const high = 1 - low;

  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }

  if (p <= high) {
    const q = p - 0.5;
    const r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }

  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}
