import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { buildMlbTrainingDataset } from "@/services/simulation/mlb-training-dataset-builder";
import { scoreMlbTotalMarket } from "@/services/simulation/mlb-total-probability-engine";

const CACHE_KEY = "mlb:totals:backtest:v1";
const TTL_SECONDS = 60 * 60 * 12;

export type MlbTotalsBacktestCandidate = {
  attackEv: number;
  playEv: number;
  leanEv: number;
  attackRunEdge: number;
  playRunEdge: number;
  leanRunEdge: number;
  minProbabilityEdge: number;
};

export type MlbTotalsBacktestResult = {
  ok: boolean;
  generatedAt: string;
  source: string;
  rows: number;
  usableRows: number;
  candidatesTested: number;
  best: MlbTotalsBacktestCandidate;
  bestMetrics: TotalsBacktestMetrics;
  baseline: MlbTotalsBacktestCandidate;
  baselineMetrics: TotalsBacktestMetrics;
  warning: string | null;
};

type TotalsBacktestRow = {
  gameId: string;
  projectedTotal: number;
  marketTotal: number;
  actualTotal: number;
  awayExpectedRuns: number | null;
  homeExpectedRuns: number | null;
  overOdds: number;
  underOdds: number;
};

type TotalsBacktestMetrics = {
  bets: number;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number | null;
  unitsNet: number;
  roi: number | null;
  avgEv: number | null;
  avgRunEdge: number | null;
  overCount: number;
  underCount: number;
  attackCount: number;
  playCount: number;
  leanCount: number;
};

function numberValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function round(value: number | null | undefined, digits = 4) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function americanPayout(american: number) {
  return american > 0 ? american / 100 : 100 / Math.abs(american);
}

function candidateGrid(): MlbTotalsBacktestCandidate[] {
  const candidates: MlbTotalsBacktestCandidate[] = [];
  const attackEvs = [0.04, 0.045, 0.05, 0.055];
  const playEvs = [0.018, 0.02, 0.025, 0.03];
  const attackEdges = [1.0, 1.2, 1.35, 1.5];
  const playEdges = [0.7, 0.85, 1.0, 1.15];
  const probabilityEdges = [0.01, 0.015, 0.02, 0.025];

  for (const attackEv of attackEvs) {
    for (const playEv of playEvs) {
      if (playEv >= attackEv) continue;
      for (const attackRunEdge of attackEdges) {
        for (const playRunEdge of playEdges) {
          if (playRunEdge >= attackRunEdge) continue;
          for (const minProbabilityEdge of probabilityEdges) {
            candidates.push({
              attackEv,
              playEv,
              leanEv: 0.0075,
              attackRunEdge,
              playRunEdge,
              leanRunEdge: 0.45,
              minProbabilityEdge
            });
          }
        }
      }
    }
  }

  return candidates;
}

function defaultCandidate(): MlbTotalsBacktestCandidate {
  return {
    attackEv: 0.045,
    playEv: 0.02,
    leanEv: 0.0075,
    attackRunEdge: 1.2,
    playRunEdge: 0.85,
    leanRunEdge: 0.45,
    minProbabilityEdge: 0.015
  };
}

function normalizeRow(row: any): TotalsBacktestRow | null {
  const gameId = String(row.gameId ?? row.id ?? row.eventId ?? "").trim();
  if (!gameId) return null;

  const actualHome = numberValue(row.homeScore, row.home_score);
  const actualAway = numberValue(row.awayScore, row.away_score);
  if (actualHome == null || actualAway == null) return null;

  const marketTotal = numberValue(row.closingTotal, row.marketTotal, row.totalLine, row.total);
  const projectedTotal = numberValue(row.projectedTotal, row.modelTotal, row.simTotal);
  if (marketTotal == null || projectedTotal == null || marketTotal <= 0) return null;

  // Historical rows rarely preserve over/under prices. Use -110 as a neutral
  // backtest baseline unless prices were captured. Live scoring still uses
  // actual captured prices from market snapshots.
  const overOdds = numberValue(row.overOdds, row.overPrice, row.overAmericanOdds) ?? -110;
  const underOdds = numberValue(row.underOdds, row.underPrice, row.underAmericanOdds) ?? -110;

  return {
    gameId,
    projectedTotal,
    marketTotal,
    actualTotal: actualHome + actualAway,
    awayExpectedRuns: numberValue(row.awayExpectedRuns, row.awayRuns, row.avgAway),
    homeExpectedRuns: numberValue(row.homeExpectedRuns, row.homeRuns, row.avgHome),
    overOdds,
    underOdds
  };
}

function pickSide(row: TotalsBacktestRow, candidate: MlbTotalsBacktestCandidate) {
  const scored = scoreMlbTotalMarket({
    projectedTotal: row.projectedTotal,
    marketTotal: row.marketTotal,
    overOdds: row.overOdds,
    underOdds: row.underOdds,
    awayExpectedRuns: row.awayExpectedRuns,
    homeExpectedRuns: row.homeExpectedRuns
  });

  const overRunEdge = scored.projectedRunEdge ?? 0;
  const underRunEdge = -overRunEdge;
  const overEv = scored.over.expectedValue;
  const underEv = scored.under.expectedValue;
  const overProbEdge = scored.over.probabilityEdge;
  const underProbEdge = scored.under.probabilityEdge;

  const choices = [
    { side: "over" as const, ev: overEv, runEdge: overRunEdge, probEdge: overProbEdge, odds: row.overOdds },
    { side: "under" as const, ev: underEv, runEdge: underRunEdge, probEdge: underProbEdge, odds: row.underOdds }
  ]
    .filter((choice) => choice.ev != null && choice.ev > 0 && choice.probEdge != null && choice.probEdge >= candidate.minProbabilityEdge && choice.runEdge >= candidate.leanRunEdge)
    .sort((left, right) => (right.ev ?? 0) - (left.ev ?? 0));

  const best = choices[0];
  if (!best) return null;

  const tier = best.ev! >= candidate.attackEv && best.runEdge >= candidate.attackRunEdge
    ? "ATTACK"
    : best.ev! >= candidate.playEv && best.runEdge >= candidate.playRunEdge
      ? "PLAY"
      : "LEAN";

  if (tier === "LEAN") return null;
  return { ...best, tier };
}

function evaluate(rows: TotalsBacktestRow[], candidate: MlbTotalsBacktestCandidate): TotalsBacktestMetrics {
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let unitsNet = 0;
  let evSum = 0;
  let runEdgeSum = 0;
  let overCount = 0;
  let underCount = 0;
  let attackCount = 0;
  let playCount = 0;

  for (const row of rows) {
    const pick = pickSide(row, candidate);
    if (!pick) continue;

    if (pick.side === "over") overCount += 1;
    else underCount += 1;
    if (pick.tier === "ATTACK") attackCount += 1;
    else playCount += 1;

    evSum += pick.ev ?? 0;
    runEdgeSum += pick.runEdge;

    const won = pick.side === "over" ? row.actualTotal > row.marketTotal : row.actualTotal < row.marketTotal;
    const pushed = row.actualTotal === row.marketTotal;
    if (pushed) {
      pushes += 1;
    } else if (won) {
      wins += 1;
      unitsNet += americanPayout(pick.odds);
    } else {
      losses += 1;
      unitsNet -= 1;
    }
  }

  const decisions = wins + losses;
  const bets = wins + losses + pushes;
  return {
    bets,
    wins,
    losses,
    pushes,
    winRate: decisions ? round(wins / decisions, 4) : null,
    unitsNet: round(unitsNet, 3) ?? 0,
    roi: decisions ? round((unitsNet / decisions) * 100, 2) : null,
    avgEv: bets ? round(evSum / bets, 4) : null,
    avgRunEdge: bets ? round(runEdgeSum / bets, 3) : null,
    overCount,
    underCount,
    attackCount,
    playCount,
    leanCount: 0
  };
}

function score(metrics: TotalsBacktestMetrics) {
  if (metrics.bets < 10 || metrics.roi == null) return Number.NEGATIVE_INFINITY;
  const balancePenalty = metrics.overCount === 0 || metrics.underCount === 0 ? 6 : 0;
  const sampleBonus = Math.min(8, metrics.bets / 20);
  return metrics.roi + sampleBonus - balancePenalty;
}

export async function runMlbTotalsBacktest(limit = 1500): Promise<MlbTotalsBacktestResult> {
  const dataset = await buildMlbTrainingDataset(limit, 365);
  const rows = (dataset.games ?? []).map(normalizeRow).filter((row): row is TotalsBacktestRow => Boolean(row));
  const baseline = defaultCandidate();
  const baselineMetrics = evaluate(rows, baseline);
  const candidates = candidateGrid();

  let best = baseline;
  let bestMetrics = baselineMetrics;
  let bestScore = score(baselineMetrics);

  for (const candidate of candidates) {
    const metrics = evaluate(rows, candidate);
    const candidateScore = score(metrics);
    if (candidateScore > bestScore) {
      best = candidate;
      bestMetrics = metrics;
      bestScore = candidateScore;
    }
  }

  const warning = !rows.length
    ? "No usable historical totals rows. Need captured pregame projectedTotal plus real marketTotal/closingTotal and final scores."
    : rows.length < 60
      ? "Small totals backtest sample. Do not overfit; keep conservative defaults."
      : null;

  const result: MlbTotalsBacktestResult = {
    ok: rows.length >= 10,
    generatedAt: new Date().toISOString(),
    source: dataset.source ?? "mlb-training-dataset",
    rows: dataset.games?.length ?? 0,
    usableRows: rows.length,
    candidatesTested: candidates.length,
    best,
    bestMetrics,
    baseline,
    baselineMetrics,
    warning
  };

  await writeHotCache(CACHE_KEY, result, TTL_SECONDS);
  return result;
}

export async function getCachedMlbTotalsBacktest() {
  return readHotCache<MlbTotalsBacktestResult>(CACHE_KEY);
}

export function getDefaultMlbTotalsCandidate() {
  return defaultCandidate();
}
