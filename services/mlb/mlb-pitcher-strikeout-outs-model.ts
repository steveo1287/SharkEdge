export type MlbPitcherModelInput = {
  pitcherName: string;
  line: number;
  propType: string;
  pitcherKRate?: number | null;
  opponentKRate?: number | null;
  pitchCountAvg?: number | null;
  pitcherOutsAvg?: number | null;
  umpireKBoost?: number | null;
  weatherRunFactor?: number | null;
  bullpenFatigueIndex?: number | null;
  leashRating?: number | null;
};

export type MlbPitcherModelOutput = {
  projectedStrikeouts: number;
  projectedOuts: number;
  overProbability: number;
  ladder: Array<{ threshold: number; probability: number; fairOdds: number }>;
  reasons: string[];
  riskFlags: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function factorial(n: number): number {
  if (n <= 1) return 1;
  let out = 1;
  for (let i = 2; i <= n; i++) out *= i;
  return out;
}

function poissonAtLeast(mean: number, threshold: number) {
  let cumulative = 0;
  const floor = Math.max(0, Math.floor(threshold - 1));
  for (let k = 0; k <= floor; k++) {
    cumulative += Math.exp(-mean) * Math.pow(mean, k) / factorial(k);
  }
  return clamp(1 - cumulative, 0.001, 0.999);
}

function normalOver(mean: number, std: number, line: number) {
  const z = (line + 0.5 - mean) / Math.max(std, 0.1);
  const approx = 1 / (1 + Math.exp(1.702 * z));
  return clamp(approx, 0.001, 0.999);
}

function probToAmerican(p: number) {
  const prob = clamp(p, 0.001, 0.999);
  if (prob > 0.5) return -Math.round((prob / (1 - prob)) * 100);
  return Math.round(((1 - prob) / prob) * 100);
}

export function buildMlbPitcherStrikeoutOutsModel(input: MlbPitcherModelInput): MlbPitcherModelOutput {
  const reasons: string[] = [];
  const riskFlags: string[] = [];
  const pitchCount = clamp(input.pitchCountAvg ?? 88, 45, 115);
  const leash = clamp(input.leashRating ?? 0.68, 0.25, 1);
  const expectedBatters = clamp((pitchCount / 3.85) * (0.9 + leash * 0.2), 12, 32);
  const pitcherK = clamp(input.pitcherKRate ?? 0.235, 0.08, 0.42);
  const opponentK = clamp(input.opponentKRate ?? 0.225, 0.12, 0.34);
  const umpBoost = clamp(input.umpireKBoost ?? 0, -0.06, 0.06);
  const weather = clamp(input.weatherRunFactor ?? 1, 0.88, 1.14);

  const blendedKRate = clamp(pitcherK * 0.62 + opponentK * 0.38 + umpBoost - (weather - 1) * 0.08, 0.08, 0.44);
  const projectedStrikeouts = expectedBatters * blendedKRate;

  const baseOuts = input.pitcherOutsAvg ?? expectedBatters * 0.71;
  const fatigueDrag = clamp(input.bullpenFatigueIndex ?? 0, 0, 1) * 0.8;
  const projectedOuts = clamp(baseOuts + leash * 1.25 + fatigueDrag - (weather - 1) * 2.2, 6, 24);

  reasons.push(`Pitch count ${pitchCount.toFixed(0)}`);
  reasons.push(`Blended K rate ${(blendedKRate * 100).toFixed(1)}%`);
  reasons.push(`Expected batters ${expectedBatters.toFixed(1)}`);

  if (input.umpireKBoost && Math.abs(input.umpireKBoost) >= 0.015) reasons.push("Umpire zone impacts strikeout expectation");
  if (weather > 1.05) riskFlags.push("Run-friendly weather can shorten pitcher leash");
  if (leash < 0.45) riskFlags.push("Low leash / early hook risk");

  const isOuts = input.propType.toLowerCase().includes("out");
  const overProbability = isOuts
    ? normalOver(projectedOuts, 2.3, input.line)
    : poissonAtLeast(projectedStrikeouts, input.line + 0.5);

  const ladder = [3, 4, 5, 6, 7, 8, 9, 10]
    .filter((threshold) => threshold >= Math.max(3, Math.floor(projectedStrikeouts - 3)) && threshold <= Math.ceil(projectedStrikeouts + 5))
    .map((threshold) => {
      const probability = poissonAtLeast(projectedStrikeouts, threshold);
      return { threshold, probability: Number(probability.toFixed(5)), fairOdds: probToAmerican(probability) };
    });

  return {
    projectedStrikeouts: Number(projectedStrikeouts.toFixed(3)),
    projectedOuts: Number(projectedOuts.toFixed(3)),
    overProbability: Number(overProbability.toFixed(5)),
    ladder,
    reasons,
    riskFlags
  };
}
