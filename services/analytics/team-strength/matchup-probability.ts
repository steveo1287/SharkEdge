export type PythagoreanMethod = "pythagorean" | "pythagenpat";

export type PythagoreanWinPctResult = {
  scored: number;
  allowed: number;
  exponent: number;
  method: PythagoreanMethod;
  expectedWinPct: number;
};

export type Log5MatchupResult = {
  teamAWinPct: number;
  teamBWinPct: number;
  teamAProbability: number;
  teamBProbability: number;
};

export type EloExpectedResult = {
  ratingA: number;
  ratingB: number;
  adjustedRatingA: number;
  adjustedRatingB: number;
  homeFieldElo: number;
  teamAProbability: number;
  teamBProbability: number;
};

export type EloUpdateResult = {
  rating: number;
  expectedScore: number;
  actualScore: number;
  kFactor: number;
  marginMultiplier: number;
  updatedRating: number;
  ratingDelta: number;
};

const DEFAULT_MLB_PYTHAGENPAT_EXPONENT = 1.83;
const DEFAULT_ELO_RATING = 1500;
const DEFAULT_MLB_HOME_FIELD_ELO = 24;
const DEFAULT_MLB_REGULAR_SEASON_K = 4;
const DEFAULT_MLB_POSTSEASON_K = 6;

export function pythagoreanWinPct(params: {
  scored: number;
  allowed: number;
  exponent?: number;
  method?: PythagoreanMethod;
}): PythagoreanWinPctResult {
  assertNonNegative(params.scored, "scored");
  assertNonNegative(params.allowed, "allowed");

  const exponent = params.exponent ?? DEFAULT_MLB_PYTHAGENPAT_EXPONENT;
  assertFinitePositive(exponent, "exponent");

  const scoredPower = Math.pow(params.scored, exponent);
  const allowedPower = Math.pow(params.allowed, exponent);
  const denominator = scoredPower + allowedPower;
  const expectedWinPct = denominator > 0 ? scoredPower / denominator : 0.5;

  return {
    scored: params.scored,
    allowed: params.allowed,
    exponent,
    method: params.method ?? "pythagenpat",
    expectedWinPct: clamp(expectedWinPct, 0.01, 0.99)
  };
}

export function log5Probability(params: {
  teamAWinPct: number;
  teamBWinPct: number;
}): Log5MatchupResult {
  const teamAWinPct = clampProbability(params.teamAWinPct, "teamAWinPct");
  const teamBWinPct = clampProbability(params.teamBWinPct, "teamBWinPct");

  const numerator = teamAWinPct - teamAWinPct * teamBWinPct;
  const denominator = teamAWinPct + teamBWinPct - 2 * teamAWinPct * teamBWinPct;
  const teamAProbability = denominator !== 0 ? numerator / denominator : 0.5;

  return {
    teamAWinPct,
    teamBWinPct,
    teamAProbability: clamp(teamAProbability, 0.01, 0.99),
    teamBProbability: clamp(1 - teamAProbability, 0.01, 0.99)
  };
}

export function log5FromScoring(params: {
  teamAScored: number;
  teamAAllowed: number;
  teamBScored: number;
  teamBAllowed: number;
  exponent?: number;
}): Log5MatchupResult & {
  teamAExpectedWinPct: number;
  teamBExpectedWinPct: number;
  exponent: number;
} {
  const teamA = pythagoreanWinPct({
    scored: params.teamAScored,
    allowed: params.teamAAllowed,
    exponent: params.exponent
  });
  const teamB = pythagoreanWinPct({
    scored: params.teamBScored,
    allowed: params.teamBAllowed,
    exponent: params.exponent
  });
  const log5 = log5Probability({
    teamAWinPct: teamA.expectedWinPct,
    teamBWinPct: teamB.expectedWinPct
  });

  return {
    ...log5,
    teamAExpectedWinPct: teamA.expectedWinPct,
    teamBExpectedWinPct: teamB.expectedWinPct,
    exponent: teamA.exponent
  };
}

export function blendProbabilitySignal(params: {
  baseProbability: number;
  signalProbability: number;
  weight?: number;
  maxWeight?: number;
}) {
  const baseProbability = clampProbability(params.baseProbability, "baseProbability");
  const signalProbability = clampProbability(params.signalProbability, "signalProbability");
  const maxWeight = params.maxWeight ?? 0.25;
  const weight = clamp(params.weight ?? 0.1, 0, maxWeight);
  const adjustedProbability = baseProbability * (1 - weight) + signalProbability * weight;

  return {
    weight,
    signalProbability,
    adjustedProbability: clamp(adjustedProbability, 0.01, 0.99)
  };
}

export function eloExpectedWinProbability(params: {
  ratingA: number;
  ratingB: number;
  teamAIsHome?: boolean;
  teamBIsHome?: boolean;
  homeFieldElo?: number;
}): EloExpectedResult {
  assertFinite(params.ratingA, "ratingA");
  assertFinite(params.ratingB, "ratingB");

  const homeFieldElo = params.homeFieldElo ?? DEFAULT_MLB_HOME_FIELD_ELO;
  const adjustedRatingA = params.ratingA + (params.teamAIsHome ? homeFieldElo : 0);
  const adjustedRatingB = params.ratingB + (params.teamBIsHome ? homeFieldElo : 0);
  const teamAProbability = 1 / (1 + Math.pow(10, (adjustedRatingB - adjustedRatingA) / 400));

  return {
    ratingA: params.ratingA,
    ratingB: params.ratingB,
    adjustedRatingA,
    adjustedRatingB,
    homeFieldElo,
    teamAProbability: clamp(teamAProbability, 0.01, 0.99),
    teamBProbability: clamp(1 - teamAProbability, 0.01, 0.99)
  };
}

export function updateEloRating(params: {
  rating?: number;
  expectedScore: number;
  actualScore: number;
  kFactor?: number;
  marginMultiplier?: number;
  postseason?: boolean;
}): EloUpdateResult {
  const rating = params.rating ?? DEFAULT_ELO_RATING;
  assertFinite(rating, "rating");
  const expectedScore = clampProbability(params.expectedScore, "expectedScore");
  const actualScore = clamp(params.actualScore, 0, 1);
  const kFactor = params.kFactor ?? (params.postseason ? DEFAULT_MLB_POSTSEASON_K : DEFAULT_MLB_REGULAR_SEASON_K);
  const marginMultiplier = params.marginMultiplier ?? 1;
  assertFinitePositive(kFactor, "kFactor");
  assertFinitePositive(marginMultiplier, "marginMultiplier");

  const ratingDelta = kFactor * marginMultiplier * (actualScore - expectedScore);

  return {
    rating,
    expectedScore,
    actualScore,
    kFactor,
    marginMultiplier,
    updatedRating: rating + ratingDelta,
    ratingDelta
  };
}

export function baseballMarginMultiplier(runDifferential: number) {
  assertFinite(runDifferential, "runDifferential");
  const abs = Math.abs(runDifferential);
  if (abs <= 1) return 1;
  return Math.log(abs + 1) / Math.log(2);
}

function clampProbability(value: number, field: string) {
  assertFinite(value, field);
  return clamp(value, 0.01, 0.99);
}

function assertFinite(value: number, field: string) {
  if (!Number.isFinite(value)) {
    throw new Error(`matchup probability requires finite ${field}`);
  }
}

function assertFinitePositive(value: number, field: string) {
  assertFinite(value, field);
  if (value <= 0) {
    throw new Error(`matchup probability requires positive ${field}`);
  }
}

function assertNonNegative(value: number, field: string) {
  assertFinite(value, field);
  if (value < 0) {
    throw new Error(`matchup probability requires non-negative ${field}`);
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
