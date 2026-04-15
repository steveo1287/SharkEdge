function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clampProb(value: number) {
  return clamp(value, 0.0001, 0.9999);
}

export function estimateProbabilityBand(input: {
  probability: number | null;
  sampleSize: number;
}): { lower: number | null; upper: number | null } {
  const p = input.probability;
  const n = Math.max(0, Math.floor(input.sampleSize));
  if (typeof p !== "number" || !Number.isFinite(p) || n <= 0) {
    return { lower: null, upper: null };
  }

  // Conservative normal approximation to a binomial CI.
  // Wider for smaller sample. This is intentionally not "precise statistics"; it's a production heuristic band.
  const prob = clampProb(p);
  const z = 1.64; // ~90% interval to stay conservative without pretending precision.
  const se = Math.sqrt((prob * (1 - prob)) / Math.max(1, n));
  const lower = clampProb(prob - z * se);
  const upper = clampProb(prob + z * se);
  return { lower, upper };
}

export function computeUncertaintyPenalty(input: {
  sampleSize: number;
  calibrationError: number | null;
  stabilityScore: number;
}): number {
  const n = Math.max(0, Math.floor(input.sampleSize));
  const samplePenalty =
    n >= 250 ? 0 : n >= 120 ? 5 : n >= 60 ? 12 : n >= 30 ? 22 : n >= 16 ? 35 : 48;
  const calibrationPenalty =
    typeof input.calibrationError === "number" && Number.isFinite(input.calibrationError)
      ? clamp(input.calibrationError * 120, 0, 35)
      : 18;
  const stabilityPenalty = clamp((70 - clamp(input.stabilityScore, 0, 100)) * 0.45, 0, 25);

  return clamp(samplePenalty + calibrationPenalty + stabilityPenalty, 0, 100);
}

export function computeConfidenceScore(input: {
  sampleSize: number;
  calibrationError: number | null;
  clvPct: number | null;
  stabilityScore: number;
}): number {
  const n = Math.max(0, Math.floor(input.sampleSize));

  const sampleScore =
    n >= 250 ? 100 : n >= 120 ? 90 : n >= 60 ? 80 : n >= 30 ? 68 : n >= 16 ? 55 : 40;

  const calibrationScore =
    typeof input.calibrationError === "number" && Number.isFinite(input.calibrationError)
      ? clamp(100 - input.calibrationError * 140, 25, 100)
      : 55;

  const stabilityScore = clamp(input.stabilityScore, 0, 100);

  const clvBonus =
    typeof input.clvPct === "number" && Number.isFinite(input.clvPct)
      ? clamp(input.clvPct * 2.0, -10, 10)
      : 0;

  const base = sampleScore * 0.45 + calibrationScore * 0.30 + stabilityScore * 0.25 + clvBonus;
  const penalty = computeUncertaintyPenalty({
    sampleSize: n,
    calibrationError: input.calibrationError,
    stabilityScore
  });

  return Math.round(clamp(base - penalty * 0.35, 0, 100));
}

