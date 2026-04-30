export type SupportedLinearWinLeague = "MLB" | "NFL" | "NBA";

export type LinearWinExpectancyStatus =
  | "OVERPERFORMING"
  | "UNDERPERFORMING"
  | "NEUTRAL"
  | "NO_SAMPLE";

export type LinearWinExpectancyLabel =
  | "Positive Differential Team"
  | "Negative Differential Team"
  | "Overperforming Record"
  | "Underperforming Record"
  | "Regression Candidate"
  | "Record/Scoring Mismatch";

export type LinearWinExpectancyResult = {
  league: SupportedLinearWinLeague;
  scored: number;
  allowed: number;
  differential: number;
  coefficient: number;
  rawExpectedWinPct: number;
  expectedWinPct: number;
};

export type LinearWinDeltaResult = {
  games: number;
  actualWinPct: number | null;
  delta: number | null;
  status: LinearWinExpectancyStatus;
  threshold: number;
};

export type LinearWinExpectancyProfile = LinearWinExpectancyResult & {
  games: number | null;
  actualWinPct: number | null;
  delta: number | null;
  status: LinearWinExpectancyStatus;
  labels: LinearWinExpectancyLabel[];
};

const LINEAR_WIN_COEFFICIENTS: Record<SupportedLinearWinLeague, number> = {
  MLB: 0.000683,
  NFL: 0.001538,
  NBA: 0.000351
};

const DEFAULT_REGRESSION_DELTA_THRESHOLD = 0.075;
const MIN_EXPECTED_WIN_PCT = 0.01;
const MAX_EXPECTED_WIN_PCT = 0.99;

export function isSupportedLinearWinLeague(league: string | null | undefined): league is SupportedLinearWinLeague {
  return league === "MLB" || league === "NFL" || league === "NBA";
}

export function getLinearWinCoefficient(league: SupportedLinearWinLeague) {
  return LINEAR_WIN_COEFFICIENTS[league];
}

export function linearExpectedWinPct(params: {
  league: SupportedLinearWinLeague;
  scored: number;
  allowed: number;
  clampOutput?: boolean;
}): LinearWinExpectancyResult {
  assertFinite(params.scored, "scored");
  assertFinite(params.allowed, "allowed");

  const coefficient = getLinearWinCoefficient(params.league);
  const differential = params.scored - params.allowed;
  const rawExpectedWinPct = 0.5 + coefficient * differential;
  const expectedWinPct =
    params.clampOutput === false
      ? rawExpectedWinPct
      : clamp(rawExpectedWinPct, MIN_EXPECTED_WIN_PCT, MAX_EXPECTED_WIN_PCT);

  return {
    league: params.league,
    scored: params.scored,
    allowed: params.allowed,
    differential,
    coefficient,
    rawExpectedWinPct,
    expectedWinPct
  };
}

export function safeLinearExpectedWinPct(params: {
  league: string | null | undefined;
  scored: number;
  allowed: number;
  clampOutput?: boolean;
}): LinearWinExpectancyResult | null {
  if (!isSupportedLinearWinLeague(params.league)) return null;
  return linearExpectedWinPct({
    league: params.league,
    scored: params.scored,
    allowed: params.allowed,
    clampOutput: params.clampOutput
  });
}

export function winPctDelta(params: {
  actualWins: number;
  actualLosses: number;
  expectedWinPct: number;
  threshold?: number;
}): LinearWinDeltaResult {
  assertFinite(params.actualWins, "actualWins");
  assertFinite(params.actualLosses, "actualLosses");
  assertFinite(params.expectedWinPct, "expectedWinPct");

  const games = params.actualWins + params.actualLosses;
  const threshold = params.threshold ?? DEFAULT_REGRESSION_DELTA_THRESHOLD;

  if (games <= 0) {
    return {
      games,
      actualWinPct: null,
      delta: null,
      status: "NO_SAMPLE",
      threshold
    };
  }

  const actualWinPct = params.actualWins / games;
  const delta = actualWinPct - params.expectedWinPct;
  let status: LinearWinExpectancyStatus = "NEUTRAL";

  if (delta >= threshold) status = "OVERPERFORMING";
  else if (delta <= -threshold) status = "UNDERPERFORMING";

  return {
    games,
    actualWinPct,
    delta,
    status,
    threshold
  };
}

export function linearWinExpectancyProfile(params: {
  league: SupportedLinearWinLeague;
  scored: number;
  allowed: number;
  actualWins?: number | null;
  actualLosses?: number | null;
  threshold?: number;
  clampOutput?: boolean;
}): LinearWinExpectancyProfile {
  const expectancy = linearExpectedWinPct(params);
  const actualWins = params.actualWins ?? null;
  const actualLosses = params.actualLosses ?? null;
  const hasRecord = actualWins != null && actualLosses != null;
  const delta = hasRecord
    ? winPctDelta({
        actualWins,
        actualLosses,
        expectedWinPct: expectancy.expectedWinPct,
        threshold: params.threshold
      })
    : null;

  const status = delta?.status ?? "NO_SAMPLE";

  return {
    ...expectancy,
    games: delta?.games ?? null,
    actualWinPct: delta?.actualWinPct ?? null,
    delta: delta?.delta ?? null,
    status,
    labels: buildLinearWinExpectancyLabels(expectancy.differential, status)
  };
}

export function buildLinearWinExpectancyLabels(
  differential: number,
  status: LinearWinExpectancyStatus | null | undefined
): LinearWinExpectancyLabel[] {
  const labels: LinearWinExpectancyLabel[] = [];

  if (differential > 0) labels.push("Positive Differential Team");
  else if (differential < 0) labels.push("Negative Differential Team");

  if (status === "OVERPERFORMING") {
    labels.push("Overperforming Record", "Regression Candidate", "Record/Scoring Mismatch");
  } else if (status === "UNDERPERFORMING") {
    labels.push("Underperforming Record", "Regression Candidate", "Record/Scoring Mismatch");
  }

  return labels;
}

export function linearWinPriorProbability(params: {
  homeExpectedWinPct: number;
  awayExpectedWinPct: number;
  baseHomeWinProbability: number;
  weight?: number;
}) {
  assertFinite(params.homeExpectedWinPct, "homeExpectedWinPct");
  assertFinite(params.awayExpectedWinPct, "awayExpectedWinPct");
  assertFinite(params.baseHomeWinProbability, "baseHomeWinProbability");

  const weight = clamp(params.weight ?? 0.12, 0, 0.25);
  const totalStrength = params.homeExpectedWinPct + params.awayExpectedWinPct;
  const linearHomeSignal = totalStrength > 0 ? params.homeExpectedWinPct / totalStrength : 0.5;
  const adjustedHomeWinProbability =
    params.baseHomeWinProbability * (1 - weight) + linearHomeSignal * weight;

  return {
    weight,
    linearHomeSignal: clamp(linearHomeSignal, 0.01, 0.99),
    adjustedHomeWinProbability: clamp(adjustedHomeWinProbability, 0.01, 0.99)
  };
}

function assertFinite(value: number, field: string) {
  if (!Number.isFinite(value)) {
    throw new Error(`linear win expectancy requires finite ${field}`);
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
