export type PlayerSimInput = {
  player: string;
  propType: string;
  line: number;
  teamTotal: number;
  usageRate?: number;
  minutes?: number;
  opponentFactor?: number;
  bookOdds?: number; // american odds
  seed?: string;
  sims?: number;
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
  cacheKey: string;
  simCount: number;
  generatedAt: string;
};

type CachedPlayerSimOutput = PlayerSimOutput & {
  expiresAt: number;
};

const PLAYER_SIM_CACHE_TTL_MS = 1000 * 60 * 10;
const PLAYER_SIM_CACHE_MAX = 500;
const playerSimCache = new Map<string, CachedPlayerSimOutput>();

function round(value: number, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function americanToProb(odds: number) {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function probToAmerican(p: number) {
  if (p <= 0 || p >= 1) return 0;
  if (p > 0.5) return -Math.round((p / (1 - p)) * 100);
  return Math.round(((1 - p) / p) * 100);
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number) {
  let state = seed || 1;
  return () => {
    state |= 0;
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalSample(mean: number, std: number, random: () => number) {
  const u = Math.max(random(), Number.EPSILON);
  const v = Math.max(random(), Number.EPSILON);
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return mean + z * std;
}

function normalizePropType(propType: string) {
  return propType.trim().toLowerCase().replace(/[_-]+/g, " ");
}

function buildCacheKey(input: PlayerSimInput) {
  const safe = {
    player: input.player.trim().toLowerCase(),
    propType: normalizePropType(input.propType),
    line: round(input.line, 3),
    teamTotal: round(input.teamTotal, 3),
    usageRate: round(input.usageRate ?? 0.22, 4),
    minutes: round(input.minutes ?? 34, 2),
    opponentFactor: round(input.opponentFactor ?? 1, 4),
    bookOdds: input.bookOdds ?? -110,
    seed: input.seed ?? "default",
    sims: Math.max(500, Math.min(input.sims ?? 5000, 25000))
  };
  return JSON.stringify(safe);
}

function pruneCache(now: number) {
  for (const [key, value] of playerSimCache.entries()) {
    if (value.expiresAt <= now) playerSimCache.delete(key);
  }

  while (playerSimCache.size > PLAYER_SIM_CACHE_MAX) {
    const oldest = playerSimCache.keys().next().value;
    if (!oldest) break;
    playerSimCache.delete(oldest);
  }
}

function getMeanForProp(input: Required<Pick<PlayerSimInput, "propType" | "line" | "teamTotal" | "usageRate" | "minutes" | "opponentFactor">>) {
  const propType = normalizePropType(input.propType);
  if (propType === "rebounds") return input.minutes * 0.28 * input.opponentFactor;
  if (propType === "assists") return input.minutes * 0.22 * input.opponentFactor;
  if (propType === "threes") return Math.max(0.2, input.teamTotal * input.usageRate * 0.12 * input.opponentFactor);
  if (propType === "strikeouts") return Math.max(1.5, input.line * input.usageRate * 4.6 * input.opponentFactor);
  if (propType === "outs") return Math.max(6, input.line * input.usageRate * 2.4 * input.opponentFactor);
  if (propType === "points") return input.teamTotal * input.usageRate * input.opponentFactor;
  return Math.max(0.2, input.teamTotal * input.usageRate * input.opponentFactor);
}

function buildDrivers(input: PlayerSimInput, mean: number, overPct: number, edgePct: number) {
  const drivers = [
    `Stable seeded sim: ${input.sims ?? 5000} trials`,
    `Projected mean ${mean.toFixed(2)} vs line ${input.line}`,
    `Model over probability ${(overPct * 100).toFixed(1)}%`
  ];

  if (Math.abs(edgePct) >= 5) drivers.push("Edge cleared attack threshold");
  else if (Math.abs(edgePct) >= 1.5) drivers.push("Edge sits in watch range");
  else drivers.push("No meaningful price separation yet");

  return drivers;
}

export function getPlayerSimCacheStats() {
  const now = Date.now();
  pruneCache(now);
  return {
    size: playerSimCache.size,
    ttlMs: PLAYER_SIM_CACHE_TTL_MS,
    maxEntries: PLAYER_SIM_CACHE_MAX
  };
}

export function clearPlayerSimCache() {
  playerSimCache.clear();
}

export function buildPlayerSimProjection(input: PlayerSimInput): PlayerSimOutput {
  const now = Date.now();
  pruneCache(now);

  const normalizedInput = {
    ...input,
    usageRate: input.usageRate ?? 0.22,
    minutes: input.minutes ?? 34,
    opponentFactor: input.opponentFactor ?? 1,
    bookOdds: input.bookOdds ?? -110,
    sims: Math.max(500, Math.min(input.sims ?? 5000, 25000))
  };
  const cacheKey = buildCacheKey(normalizedInput);
  const cached = playerSimCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return {
      ...cached,
      generatedAt: cached.generatedAt
    };
  }

  const mean = getMeanForProp({
    propType: normalizedInput.propType,
    line: normalizedInput.line,
    teamTotal: normalizedInput.teamTotal,
    usageRate: normalizedInput.usageRate,
    minutes: normalizedInput.minutes,
    opponentFactor: normalizedInput.opponentFactor
  });
  const std = Math.max(0.25, mean * 0.25);
  const random = seededRandom(hashString(cacheKey));

  let over = 0;
  const samples: number[] = [];

  for (let i = 0; i < normalizedInput.sims; i++) {
    const val = Math.max(0, normalSample(mean, std, random));
    samples.push(val);
    if (val > normalizedInput.line) over++;
  }

  samples.sort((a, b) => a - b);
  const overPct = over / normalizedInput.sims;
  const underPct = 1 - overPct;
  const median = samples[Math.floor(samples.length / 2)] ?? mean;

  const buckets = new Array(9).fill(0);
  const bucketDenominator = Math.max(mean * 2, normalizedInput.line * 2, 1);
  samples.forEach((v) => {
    const idx = Math.max(0, Math.min(8, Math.floor((v / bucketDenominator) * 9)));
    buckets[idx]++;
  });

  const max = Math.max(...buckets, 1);
  const distribution = buckets.map((b) => Math.round((b / max) * 100));
  const implied = americanToProb(normalizedInput.bookOdds);
  const edge = overPct - implied;
  const edgePct = edge * 100;

  const output: PlayerSimOutput = {
    mean: round(mean, 4),
    median: round(median, 4),
    distribution,
    overPct: round(overPct, 5),
    underPct: round(underPct, 5),
    fairOdds: probToAmerican(overPct),
    edgePct: round(edgePct, 4),
    confidence: round(Math.min(0.9, 0.55 + Math.abs(edge)), 4),
    drivers: buildDrivers(normalizedInput, mean, overPct, edgePct),
    cacheKey,
    simCount: normalizedInput.sims,
    generatedAt: new Date(now).toISOString()
  };

  playerSimCache.set(cacheKey, {
    ...output,
    expiresAt: now + PLAYER_SIM_CACHE_TTL_MS
  });

  return output;
}
