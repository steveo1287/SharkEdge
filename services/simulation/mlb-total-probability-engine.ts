export type MlbTotalSide = "over" | "under";

export type MlbTotalProbabilityInput = {
  projectedTotal: number | null | undefined;
  marketTotal: number | null | undefined;
  overOdds: number | null | undefined;
  underOdds: number | null | undefined;
  awayExpectedRuns?: number | null;
  homeExpectedRuns?: number | null;
  awayFallbackRuns?: number | null;
  homeFallbackRuns?: number | null;
};

export type MlbTotalSideScore = {
  side: MlbTotalSide;
  winProbability: number;
  lossProbability: number;
  pushProbability: number;
  conditionalWinProbability: number;
  marketProbability: number | null;
  probabilityEdge: number | null;
  expectedValue: number | null;
  americanOdds: number | null;
};

export type MlbTotalProbabilityResult = {
  ok: boolean;
  projectedTotal: number | null;
  marketTotal: number | null;
  projectedRunEdge: number | null;
  totalDistribution: Array<{ runs: number; probability: number }>;
  over: MlbTotalSideScore;
  under: MlbTotalSideScore;
  warnings: string[];
};

const MLB_NB_DISPERSION = 20;
const MAX_RUNS = 40;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number | null | undefined, digits = 4) {
  return typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function validNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function americanToProbability(american: number | null | undefined) {
  if (typeof american !== "number" || !Number.isFinite(american) || american === 0) return null;
  return american > 0 ? 100 / (american + 100) : Math.abs(american) / (Math.abs(american) + 100);
}

function americanToPayout(american: number | null | undefined) {
  if (typeof american !== "number" || !Number.isFinite(american) || american === 0) return null;
  return american > 0 ? american / 100 : 100 / Math.abs(american);
}

function noVigTotalMarket(overOdds: number | null | undefined, underOdds: number | null | undefined) {
  const over = americanToProbability(overOdds);
  const under = americanToProbability(underOdds);
  if (over == null || under == null) return null;
  const hold = over + under;
  if (!Number.isFinite(hold) || hold <= 0) return null;
  return { over: over / hold, under: under / hold, hold: hold - 1 };
}

function negativeBinomialProbability(mean: number, runs: number, r: number) {
  const safeMean = clamp(mean, 0.2, 14);
  const safeR = Math.max(1, r);
  const p = safeR / (safeR + safeMean);
  let logProb = safeR * Math.log(p);
  for (let index = 1; index <= runs; index += 1) {
    logProb += Math.log((safeR + index - 1) / index) + Math.log(1 - p);
  }
  return Math.exp(logProb);
}

function runDistribution(mean: number) {
  return Array.from({ length: MAX_RUNS + 1 }, (_, runs) => negativeBinomialProbability(mean, runs, MLB_NB_DISPERSION));
}

function totalDistribution(awayMean: number, homeMean: number) {
  const away = runDistribution(awayMean);
  const home = runDistribution(homeMean);
  const totals = Array.from({ length: MAX_RUNS * 2 + 1 }, () => 0);

  for (let awayRuns = 0; awayRuns < away.length; awayRuns += 1) {
    for (let homeRuns = 0; homeRuns < home.length; homeRuns += 1) {
      totals[awayRuns + homeRuns] += away[awayRuns] * home[homeRuns];
    }
  }

  const covered = totals.reduce((sum, value) => sum + value, 0);
  if (covered <= 0) return [] as Array<{ runs: number; probability: number }>;
  return totals.map((probability, runs) => ({ runs, probability: probability / covered })).filter((row) => row.probability > 0.000001);
}

function probabilityForSide(distribution: Array<{ runs: number; probability: number }>, marketTotal: number, side: MlbTotalSide) {
  let win = 0;
  let loss = 0;
  let push = 0;

  for (const row of distribution) {
    if (row.runs > marketTotal) {
      if (side === "over") win += row.probability;
      else loss += row.probability;
    } else if (row.runs < marketTotal) {
      if (side === "under") win += row.probability;
      else loss += row.probability;
    } else {
      push += row.probability;
    }
  }

  const decisionMass = Math.max(0.000001, win + loss);
  return {
    winProbability: win,
    lossProbability: loss,
    pushProbability: push,
    conditionalWinProbability: win / decisionMass
  };
}

function expectedValue(winProbability: number, lossProbability: number, american: number | null | undefined) {
  const payout = americanToPayout(american);
  if (payout == null) return null;
  return winProbability * payout - lossProbability;
}

function buildSideScore(args: {
  side: MlbTotalSide;
  distribution: Array<{ runs: number; probability: number }>;
  marketTotal: number;
  marketProbability: number | null;
  americanOdds: number | null;
}) {
  const probabilities = probabilityForSide(args.distribution, args.marketTotal, args.side);
  const probabilityEdge = args.marketProbability == null ? null : probabilities.conditionalWinProbability - args.marketProbability;
  return {
    side: args.side,
    winProbability: round(probabilities.winProbability) ?? 0,
    lossProbability: round(probabilities.lossProbability) ?? 0,
    pushProbability: round(probabilities.pushProbability) ?? 0,
    conditionalWinProbability: round(probabilities.conditionalWinProbability) ?? 0,
    marketProbability: round(args.marketProbability),
    probabilityEdge: round(probabilityEdge),
    expectedValue: round(expectedValue(probabilities.winProbability, probabilities.lossProbability, args.americanOdds)),
    americanOdds: args.americanOdds
  } satisfies MlbTotalSideScore;
}

export function scoreMlbTotalMarket(input: MlbTotalProbabilityInput): MlbTotalProbabilityResult {
  const projectedTotal = validNumber(input.projectedTotal);
  const marketTotal = validNumber(input.marketTotal);
  const warnings: string[] = [];

  if (projectedTotal == null) warnings.push("Missing projected total.");
  if (marketTotal == null) warnings.push("Missing market total.");

  const awayExpected = validNumber(input.awayExpectedRuns) ?? validNumber(input.awayFallbackRuns);
  const homeExpected = validNumber(input.homeExpectedRuns) ?? validNumber(input.homeFallbackRuns);
  const hasTeamMeans = awayExpected != null && homeExpected != null;

  if (!hasTeamMeans && projectedTotal == null) warnings.push("Missing team run means and projected total.");

  const awayMean = hasTeamMeans
    ? awayExpected
    : projectedTotal == null
      ? null
      : Math.max(0.2, projectedTotal / 2 - 0.05);
  const homeMean = hasTeamMeans
    ? homeExpected
    : projectedTotal == null
      ? null
      : Math.max(0.2, projectedTotal / 2 + 0.05);

  const market = noVigTotalMarket(input.overOdds, input.underOdds);
  if (!market) warnings.push("Missing no-vig total market probability.");

  const distribution = awayMean == null || homeMean == null ? [] : totalDistribution(awayMean, homeMean);
  const fallbackScore = {
    side: "over" as const,
    winProbability: 0,
    lossProbability: 0,
    pushProbability: 0,
    conditionalWinProbability: 0,
    marketProbability: null,
    probabilityEdge: null,
    expectedValue: null,
    americanOdds: null
  };

  if (marketTotal == null || !distribution.length) {
    return {
      ok: false,
      projectedTotal: round(projectedTotal, 3),
      marketTotal: round(marketTotal, 3),
      projectedRunEdge: projectedTotal != null && marketTotal != null ? round(projectedTotal - marketTotal, 3) : null,
      totalDistribution: distribution.map((row) => ({ runs: row.runs, probability: round(row.probability, 6) ?? 0 })),
      over: fallbackScore,
      under: { ...fallbackScore, side: "under" },
      warnings
    };
  }

  const over = buildSideScore({
    side: "over",
    distribution,
    marketTotal,
    marketProbability: market?.over ?? null,
    americanOdds: validNumber(input.overOdds)
  });
  const under = buildSideScore({
    side: "under",
    distribution,
    marketTotal,
    marketProbability: market?.under ?? null,
    americanOdds: validNumber(input.underOdds)
  });

  return {
    ok: warnings.length === 0,
    projectedTotal: round(projectedTotal, 3),
    marketTotal: round(marketTotal, 3),
    projectedRunEdge: projectedTotal != null ? round(projectedTotal - marketTotal, 3) : null,
    totalDistribution: distribution.map((row) => ({ runs: row.runs, probability: round(row.probability, 6) ?? 0 })),
    over,
    under,
    warnings
  };
}
