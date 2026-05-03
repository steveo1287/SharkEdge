function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function simProbabilityBucket(probability: number) {
  const safeProbability = Number.isFinite(probability) ? probability : 0.5;
  const lower = Math.floor(clamp(safeProbability, 0, 0.999) * 10) * 10;
  return `${lower}-${lower + 10}%`;
}

export function simPickProbability(homeWinPct: number, awayWinPct: number) {
  const home = Number.isFinite(homeWinPct) ? homeWinPct : 0.5;
  const away = Number.isFinite(awayWinPct) ? awayWinPct : 1 - home;
  return clamp(Math.max(home, away), 0, 1);
}

export function simPickProbabilityBucket(homeWinPct: number, awayWinPct: number) {
  return simProbabilityBucket(simPickProbability(homeWinPct, awayWinPct));
}

export function simPickWon(homeWinPct: number, homeWon: boolean) {
  const pickedHome = homeWinPct >= 0.5;
  return pickedHome === homeWon;
}
