type PlayerSimInput = {
  player: string;
  propType: string;
  line: number;
  teamTotal: number;
  usageRate?: number;
  minutes?: number;
  opponentFactor?: number;
  bookOdds?: number; // american odds
};

export type PlayerSimOutput = {
  mean: number;
  median: number;
  distribution: number[];
  overPct: number;
  underPct: number;
  fairOdds: number;
  edgePct: number;
  confidence: number;
  drivers: string[];
};

function americanToProb(odds: number) {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function probToAmerican(p: number) {
  if (p <= 0 || p >= 1) return 0;
  if (p > 0.5) return -Math.round((p / (1 - p)) * 100);
  return Math.round(((1 - p) / p) * 100);
}

function normalSample(mean: number, std: number) {
  const u = Math.random();
  const v = Math.random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return mean + z * std;
}

export function buildPlayerSimProjection(input: PlayerSimInput): PlayerSimOutput {
  const {
    propType,
    line,
    teamTotal,
    usageRate = 0.22,
    minutes = 34,
    opponentFactor = 1,
    bookOdds = -110
  } = input;

  // --- baseline mean ---
  let mean = teamTotal * usageRate * opponentFactor;
  if (propType === "Rebounds") mean = minutes * 0.28;
  if (propType === "Assists") mean = minutes * 0.22;
  if (propType === "Points") mean = teamTotal * usageRate;

  const std = mean * 0.25;

  // --- simulation ---
  const sims = 5000;
  let over = 0;
  const samples: number[] = [];

  for (let i = 0; i < sims; i++) {
    const val = Math.max(0, normalSample(mean, std));
    samples.push(val);
    if (val > line) over++;
  }

  const overPct = over / sims;
  const underPct = 1 - overPct;

  // --- distribution buckets (simple histogram) ---
  const buckets = new Array(9).fill(0);
  samples.forEach((v) => {
    const idx = Math.min(8, Math.floor((v / (mean * 2)) * 9));
    buckets[idx]++;
  });

  // normalize
  const max = Math.max(...buckets);
  const normalized = buckets.map((b) => Math.round((b / max) * 100));

  // --- edge ---
  const implied = americanToProb(bookOdds);
  const edge = overPct - implied;

  return {
    mean,
    median: mean,
    distribution: normalized,
    overPct,
    underPct,
    fairOdds: probToAmerican(overPct),
    edgePct: edge * 100,
    confidence: Math.min(0.9, 0.55 + Math.abs(edge)),
    drivers: ["Usage-driven projection", "Sim vs line delta", "Market odds comparison"]
  };
}
