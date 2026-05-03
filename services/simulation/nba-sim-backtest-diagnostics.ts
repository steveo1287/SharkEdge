import { brierScore, logLoss, summarizeCalibrationBuckets } from "./sim-calibration";

export type NbaBacktestMarket = "moneyline" | "spread" | "total" | "player_prop";
export type NbaBacktestConfidence = "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";

export type NbaBacktestPick = {
  id: string;
  market: NbaBacktestMarket;
  confidence: NbaBacktestConfidence;
  predictedProbability: number;
  marketNoVigProbability: number | null;
  oddsAmerican: number;
  stakeUnits?: number | null;
  edgePct?: number | null;
  closingLineValuePct?: number | null;
  isFavoriteSelection?: boolean | null;
  favoriteWon?: boolean | null;
  isHomeSelection?: boolean | null;
  homeTeamWon?: boolean | null;
  result: "win" | "loss" | "push" | "void";
};

export type NbaBacktestDiagnostics = {
  sampleSize: number;
  gradedCount: number;
  roiPct: number;
  clvPct: number | null;
  brierScore: number;
  marketBaselineBrierScore: number | null;
  logLoss: number;
  marketBaselineLogLoss: number | null;
  hitRatePct: number;
  hitRateByMarket: Record<NbaBacktestMarket, { count: number; hitRatePct: number | null }>;
  hitRateByConfidence: Record<NbaBacktestConfidence, { count: number; hitRatePct: number | null }>;
  profitByMarket: Record<NbaBacktestMarket, number>;
  averageEdgeByMarket: Record<NbaBacktestMarket, number | null>;
  maxDrawdownUnits: number;
  calibrationBuckets: Array<{ bucket: string; predicted: number; actual: number; count: number }>;
  baselines: {
    marketNoVig: { brierScore: number | null; logLoss: number | null };
    favorite: { count: number; hitRatePct: number | null };
    homeTeam: { count: number; hitRatePct: number | null };
    noBet: { roiPct: 0; profitUnits: 0 };
  };
  health: {
    status: "GREEN" | "YELLOW" | "RED";
    blockers: string[];
  };
};

const MARKETS: NbaBacktestMarket[] = ["moneyline", "spread", "total", "player_prop"];
const CONFIDENCES: NbaBacktestConfidence[] = ["HIGH", "MEDIUM", "LOW", "INSUFFICIENT"];

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function clampProbability(value: number) {
  return Math.max(0.0001, Math.min(0.9999, value));
}

function americanProfitUnits(oddsAmerican: number, stakeUnits: number) {
  if (oddsAmerican > 0) return stakeUnits * (oddsAmerican / 100);
  return stakeUnits * (100 / Math.abs(oddsAmerican));
}

function settlePickProfit(pick: NbaBacktestPick) {
  const stake = pick.stakeUnits && pick.stakeUnits > 0 ? pick.stakeUnits : 1;
  if (pick.result === "win") return americanProfitUnits(pick.oddsAmerican, stake);
  if (pick.result === "loss") return -stake;
  return 0;
}

function emptyMarketMap<T>(factory: () => T): Record<NbaBacktestMarket, T> {
  return {
    moneyline: factory(),
    spread: factory(),
    total: factory(),
    player_prop: factory()
  };
}

function emptyConfidenceMap<T>(factory: () => T): Record<NbaBacktestConfidence, T> {
  return {
    HIGH: factory(),
    MEDIUM: factory(),
    LOW: factory(),
    INSUFFICIENT: factory()
  };
}

function hitRate(wins: number, losses: number) {
  const graded = wins + losses;
  return graded > 0 ? round((wins / graded) * 100, 2) : null;
}

function booleanBaselineRate(values: boolean[]) {
  if (!values.length) return { count: 0, hitRatePct: null as number | null };
  const wins = values.filter(Boolean).length;
  return { count: values.length, hitRatePct: round((wins / values.length) * 100, 2) };
}

function maxDrawdown(profits: number[]) {
  let equity = 0;
  let peak = 0;
  let drawdown = 0;
  for (const profit of profits) {
    equity += profit;
    peak = Math.max(peak, equity);
    drawdown = Math.max(drawdown, peak - equity);
  }
  return round(drawdown, 3);
}

export function buildNbaSimBacktestDiagnostics(picks: NbaBacktestPick[]): NbaBacktestDiagnostics {
  const graded = picks.filter((pick) => pick.result === "win" || pick.result === "loss");
  const records = graded.map((pick) => ({ predicted: clampProbability(pick.predictedProbability), actual: pick.result === "win" ? 1 as const : 0 as const }));
  const marketRecords = graded
    .filter((pick) => typeof pick.marketNoVigProbability === "number")
    .map((pick) => ({ predicted: clampProbability(pick.marketNoVigProbability as number), actual: pick.result === "win" ? 1 as const : 0 as const }));

  const profits = graded.map(settlePickProfit);
  const totalStake = graded.reduce((sum, pick) => sum + (pick.stakeUnits && pick.stakeUnits > 0 ? pick.stakeUnits : 1), 0);
  const totalProfit = profits.reduce((sum, profit) => sum + profit, 0);
  const clvSamples = picks.filter((pick) => typeof pick.closingLineValuePct === "number");
  const clvPct = clvSamples.length
    ? round(clvSamples.reduce((sum, pick) => sum + (pick.closingLineValuePct as number), 0) / clvSamples.length, 3)
    : null;

  const marketCounts = emptyMarketMap(() => ({ wins: 0, losses: 0, count: 0, profit: 0, edgeSum: 0, edgeCount: 0 }));
  const confidenceCounts = emptyConfidenceMap(() => ({ wins: 0, losses: 0, count: 0 }));

  for (const pick of graded) {
    const market = marketCounts[pick.market];
    const confidence = confidenceCounts[pick.confidence];
    market.count += 1;
    confidence.count += 1;
    if (pick.result === "win") {
      market.wins += 1;
      confidence.wins += 1;
    } else {
      market.losses += 1;
      confidence.losses += 1;
    }
    market.profit += settlePickProfit(pick);
    if (typeof pick.edgePct === "number") {
      market.edgeSum += pick.edgePct;
      market.edgeCount += 1;
    }
  }

  const hitRateByMarket = emptyMarketMap(() => ({ count: 0, hitRatePct: null as number | null }));
  const profitByMarket = emptyMarketMap(() => 0);
  const averageEdgeByMarket = emptyMarketMap(() => null as number | null);
  for (const market of MARKETS) {
    const item = marketCounts[market];
    hitRateByMarket[market] = { count: item.count, hitRatePct: hitRate(item.wins, item.losses) };
    profitByMarket[market] = round(item.profit, 3);
    averageEdgeByMarket[market] = item.edgeCount > 0 ? round(item.edgeSum / item.edgeCount, 3) : null;
  }

  const hitRateByConfidence = emptyConfidenceMap(() => ({ count: 0, hitRatePct: null as number | null }));
  for (const confidence of CONFIDENCES) {
    const item = confidenceCounts[confidence];
    hitRateByConfidence[confidence] = { count: item.count, hitRatePct: hitRate(item.wins, item.losses) };
  }

  const modelBrier = brierScore(records);
  const marketBrier = marketRecords.length ? brierScore(marketRecords) : null;
  const modelLogLoss = logLoss(records);
  const marketLogLoss = marketRecords.length ? logLoss(marketRecords) : null;
  const overallHitRate = hitRate(graded.filter((pick) => pick.result === "win").length, graded.filter((pick) => pick.result === "loss").length) ?? 0;
  const favoriteBaseline = booleanBaselineRate(graded.filter((pick) => typeof pick.favoriteWon === "boolean").map((pick) => Boolean(pick.favoriteWon)));
  const homeTeamBaseline = booleanBaselineRate(graded.filter((pick) => typeof pick.homeTeamWon === "boolean").map((pick) => Boolean(pick.homeTeamWon)));

  const blockers: string[] = [];
  if (graded.length < 100) blockers.push("NBA sample below 100 graded picks");
  if (marketBrier !== null && modelBrier >= marketBrier) blockers.push("model Brier does not beat no-vig market baseline");
  if (marketLogLoss !== null && modelLogLoss >= marketLogLoss) blockers.push("model log loss does not beat no-vig market baseline");
  if (totalStake > 0 && totalProfit <= 0) blockers.push("ROI is not positive after vig");
  if (clvPct !== null && clvPct <= 0) blockers.push("CLV is not positive");

  const status = blockers.length === 0 ? "GREEN" : blockers.length <= 2 ? "YELLOW" : "RED";

  return {
    sampleSize: picks.length,
    gradedCount: graded.length,
    roiPct: totalStake > 0 ? round((totalProfit / totalStake) * 100, 2) : 0,
    clvPct,
    brierScore: round(modelBrier, 5),
    marketBaselineBrierScore: marketBrier === null ? null : round(marketBrier, 5),
    logLoss: round(modelLogLoss, 5),
    marketBaselineLogLoss: marketLogLoss === null ? null : round(marketLogLoss, 5),
    hitRatePct: overallHitRate,
    hitRateByMarket,
    hitRateByConfidence,
    profitByMarket,
    averageEdgeByMarket,
    maxDrawdownUnits: maxDrawdown(profits),
    calibrationBuckets: summarizeCalibrationBuckets(records),
    baselines: {
      marketNoVig: { brierScore: marketBrier === null ? null : round(marketBrier, 5), logLoss: marketLogLoss === null ? null : round(marketLogLoss, 5) },
      favorite: favoriteBaseline,
      homeTeam: homeTeamBaseline,
      noBet: { roiPct: 0, profitUnits: 0 }
    },
    health: { status, blockers }
  };
}
