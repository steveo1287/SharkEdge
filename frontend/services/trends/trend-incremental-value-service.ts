function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function buildTrendIncrementalValue(input: {
  rawTrendScore: number;
  simScore: number;
  regimeFit: number;
}) {
  const redundancy = Math.min(Math.abs(input.rawTrendScore - input.simScore), 1);
  const nonRedundancy = 1 - redundancy * 0.45;
  return Number(clamp(input.rawTrendScore * input.regimeFit * nonRedundancy, -0.08, 0.2).toFixed(4));
}
