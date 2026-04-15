function erf(x: number) {
  const sign = x < 0 ? -1 : 1;
  const value = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * value);
  const y =
    1 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-value * value);
  return sign * y;
}

function normalCdf(value: number) {
  return 0.5 * (1 + erf(value / Math.sqrt(2)));
}

export function estimateOverUnderProbabilities(args: {
  mean: number | null | undefined;
  line: number | null | undefined;
  stdDev: number | null | undefined;
}) {
  if (
    typeof args.mean !== "number" ||
    typeof args.line !== "number" ||
    typeof args.stdDev !== "number" ||
    !Number.isFinite(args.mean) ||
    !Number.isFinite(args.line) ||
    !Number.isFinite(args.stdDev) ||
    args.stdDev <= 0
  ) {
    return null;
  }

  const roundedLine = Math.round(args.line * 2) / 2;
  const isHalfLine = Math.abs(roundedLine % 1) === 0.5;
  const overThreshold = isHalfLine ? roundedLine : roundedLine + 0.5;
  const underThreshold = isHalfLine ? roundedLine : roundedLine - 0.5;
  const overProb = 1 - normalCdf((overThreshold - args.mean) / args.stdDev);
  const underProb = normalCdf((underThreshold - args.mean) / args.stdDev);
  const pushProb = isHalfLine ? 0 : Math.max(0, 1 - overProb - underProb);

  return {
    overProb: Math.max(0.001, Math.min(0.999, overProb)),
    underProb: Math.max(0.001, Math.min(0.999, underProb)),
    pushProb
  };
}

export function estimateTotalOverProbability(args: {
  projectedTotal: number | null | undefined;
  line: number | null | undefined;
  stdDev: number | null | undefined;
}) {
  return estimateOverUnderProbabilities({
    mean: args.projectedTotal,
    line: args.line,
    stdDev: args.stdDev
  });
}
