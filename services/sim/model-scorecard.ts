import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { getSimAccuracySummary } from "@/services/simulation/sim-accuracy-ledger";

export type ScorecardFilters = {
  league?: string | null;
  market?: string | null;
  modelVersion?: string | null;
  windowDays?: number | null;
};

export type ResolvedScorecardFilters = {
  league: string;
  market: string;
  modelVersion: string;
  windowDays: number;
};

export type ResultBucket = "WIN" | "LOSS" | "PUSH" | "PENDING";

export type SimulationPredictionRow = {
  id: string;
  gameId: string;
  league: string;
  market: string;
  modelVersion: string;
  predictionTime: string;
  eventLabel: string | null;
  side: string | null;
  modelProbability: number | null;
  modelSpread: number | null;
  modelTotal: number | null;
  marketProbability: number | null;
  marketSpread: number | null;
  marketTotal: number | null;
  closingProbability: number | null;
  closingSpread: number | null;
  closingTotal: number | null;
  finalHomeScore: number | null;
  finalAwayScore: number | null;
  outcome: number | null;
  resultBucket: ResultBucket;
  brierScore: number | null;
  logLoss: number | null;
  spreadError: number | null;
  totalError: number | null;
  clvPct: number | null;
  dataQualityGrade: string | null;
  dataQualityFlags: unknown;
  predictionJson: unknown;
  resultJson: unknown;
  settledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CalibrationBucket = {
  bucket: string;
  lower: number;
  upper: number | null;
  predictionCount: number;
  avgPredictedProbability: number | null;
  actualHitRate: number | null;
  brierScoreAvg: number | null;
  calibrationError: number | null;
};

export type MarketScorecard = {
  league: string;
  market: string;
  modelVersion: string;
  predictionCount: number;
  settledCount: number;
  pendingCount: number;
  sampleWarning: string | null;
  brierScoreAvg: number | null;
  logLossAvg: number | null;
  spreadMae: number | null;
  totalMae: number | null;
  clvAvgPct: number | null;
  winRate: number | null;
  calibrationErrorAvg: number | null;
  dataQualityBreakdown: Record<string, number>;
  calibrationBuckets: CalibrationBucket[];
};

export type SimModelScorecard = {
  ok: boolean;
  databaseReady: boolean;
  generatedAt: string;
  sourceTable: "sim_prediction_snapshots";
  filters: ResolvedScorecardFilters;
  totals: {
    predictionCount: number;
    settledCount: number;
    pendingCount: number;
    leagueCount: number;
    marketCount: number;
    modelVersionCount: number;
    brierScoreAvg: number | null;
    logLossAvg: number | null;
    spreadMae: number | null;
    totalMae: number | null;
    clvAvgPct: number | null;
  };
  scorecards: MarketScorecard[];
  byLeague: Record<string, {
    predictionCount: number;
    settledCount: number;
    brierScoreAvg: number | null;
    logLossAvg: number | null;
    spreadMae: number | null;
    totalMae: number | null;
    clvAvgPct: number | null;
  }>;
  strongestMarkets: MarketScorecard[];
  weakestMarkets: MarketScorecard[];
  recent: SimulationPredictionRow[];
  error?: string;
};

const DEFAULT_LEAGUES = ["NBA", "MLB", "NHL", "NFL"];
const SNAPSHOT_MARKET = "moneyline";
const DEFAULT_MODEL_VERSION = "sim-accuracy-snapshot";
const BUCKETS = [
  { bucket: "40-45", lower: 0.4, upper: 0.45 },
  { bucket: "45-50", lower: 0.45, upper: 0.5 },
  { bucket: "50-55", lower: 0.5, upper: 0.55 },
  { bucket: "55-60", lower: 0.55, upper: 0.6 },
  { bucket: "60-65", lower: 0.6, upper: 0.65 },
  { bucket: "65-70", lower: 0.65, upper: 0.7 },
  { bucket: "70+", lower: 0.7, upper: null }
];

type SnapshotRow = {
  id: string;
  league: string;
  game_id: string;
  event_label: string | null;
  away_team: string | null;
  home_team: string | null;
  captured_at: Date | string;
  model_version: string | null;
  data_source: string | null;
  tier: string | null;
  no_bet: boolean | null;
  confidence: number | null;
  model_home_win_pct: number;
  model_away_win_pct: number;
  model_spread: number;
  model_total: number;
  market_home_win_pct: number | null;
  market_spread: number | null;
  market_total: number | null;
  final_home_score: number | null;
  final_away_score: number | null;
  home_won: boolean | null;
  brier: number | null;
  log_loss: number | null;
  spread_error: number | null;
  total_error: number | null;
  prediction_json: unknown;
  result_json: unknown;
  graded_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function normalizeFilter(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.toUpperCase() === "ALL") return "ALL";
  return trimmed;
}

function normalizeWindowDays(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 90;
  return Math.min(3650, Math.max(1, Math.round(value)));
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function round(value: number | null | undefined, digits = 4) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function avg(values: Array<number | null | undefined>) {
  const usable = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!usable.length) return null;
  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((acc, value) => {
    const key = value || "UNKNOWN";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function toIso(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeJson(value: unknown) {
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

function calibrationBucketFor(probability: number | null | undefined) {
  if (typeof probability !== "number" || !Number.isFinite(probability)) return null;
  return BUCKETS.find((bucket) => probability >= bucket.lower && (bucket.upper == null || probability < bucket.upper))?.bucket ?? null;
}

function sampleWarning(predictionCount: number, settledCount: number) {
  if (settledCount < 30) return "Very small settled sample. Treat calibration as directional only.";
  if (settledCount < 100) return "Small settled sample. Track before making hard model claims.";
  if (predictionCount - settledCount > settledCount) return "Many pending predictions. Latest accuracy may move after grading.";
  return null;
}

function modelKey(row: SimulationPredictionRow) {
  return `${row.league}::${row.market}::${row.modelVersion}`;
}

function resultBucketFor(row: SnapshotRow): ResultBucket {
  if (!row.graded_at || row.final_home_score == null || row.final_away_score == null || row.home_won == null) return "PENDING";
  if (row.final_home_score === row.final_away_score) return "PUSH";
  const pickedHome = row.model_home_win_pct >= 0.5;
  return pickedHome === row.home_won ? "WIN" : "LOSS";
}

function mapSnapshotRow(row: SnapshotRow): SimulationPredictionRow {
  const predictionTime = toIso(row.captured_at) ?? new Date().toISOString();
  const settledAt = toIso(row.graded_at);
  const createdAt = toIso(row.created_at) ?? predictionTime;
  const updatedAt = toIso(row.updated_at) ?? createdAt;
  const modelProbability = normalizeNumber(row.model_home_win_pct);
  const homeWon = row.home_won == null ? null : row.home_won ? 1 : 0;
  const resultBucket = resultBucketFor(row);
  const pickedHome = (modelProbability ?? 0) >= 0.5;

  return {
    id: String(row.id),
    gameId: String(row.game_id),
    league: String(row.league),
    market: SNAPSHOT_MARKET,
    modelVersion: row.model_version ?? DEFAULT_MODEL_VERSION,
    predictionTime,
    eventLabel: row.event_label ?? null,
    side: pickedHome ? "HOME" : "AWAY",
    modelProbability,
    modelSpread: normalizeNumber(row.model_spread),
    modelTotal: normalizeNumber(row.model_total),
    marketProbability: normalizeNumber(row.market_home_win_pct),
    marketSpread: normalizeNumber(row.market_spread),
    marketTotal: normalizeNumber(row.market_total),
    closingProbability: null,
    closingSpread: null,
    closingTotal: null,
    finalHomeScore: normalizeNumber(row.final_home_score),
    finalAwayScore: normalizeNumber(row.final_away_score),
    outcome: homeWon,
    resultBucket,
    brierScore: normalizeNumber(row.brier),
    logLoss: normalizeNumber(row.log_loss),
    spreadError: normalizeNumber(row.spread_error),
    totalError: normalizeNumber(row.total_error),
    clvPct: null,
    dataQualityGrade: row.tier ?? "UNKNOWN",
    dataQualityFlags: {
      tier: row.tier,
      dataSource: row.data_source,
      noBet: row.no_bet,
      confidence: normalizeNumber(row.confidence)
    },
    predictionJson: normalizeJson(row.prediction_json),
    resultJson: normalizeJson(row.result_json),
    settledAt,
    createdAt,
    updatedAt
  };
}

function buildCalibrationBuckets(rows: SimulationPredictionRow[]): CalibrationBucket[] {
  return BUCKETS.map((bucket) => {
    const bucketRows = rows.filter((row) => calibrationBucketFor(row.modelProbability) === bucket.bucket && row.outcome != null);
    const actualHitRate = bucketRows.length ? bucketRows.reduce((sum, row) => sum + Number(row.outcome ?? 0), 0) / bucketRows.length : null;
    const avgPredictedProbability = avg(bucketRows.map((row) => row.modelProbability));
    return {
      bucket: bucket.bucket,
      lower: bucket.lower,
      upper: bucket.upper,
      predictionCount: bucketRows.length,
      avgPredictedProbability: round(avgPredictedProbability, 3),
      actualHitRate: round(actualHitRate, 3),
      brierScoreAvg: round(avg(bucketRows.map((row) => row.brierScore)), 4),
      calibrationError: actualHitRate == null || avgPredictedProbability == null ? null : round(Math.abs(avgPredictedProbability - actualHitRate), 4)
    };
  });
}

function buildMarketScorecard(rows: SimulationPredictionRow[]): MarketScorecard {
  const first = rows[0];
  const settledRows = rows.filter((row) => row.settledAt);
  const wins = settledRows.filter((row) => row.resultBucket === "WIN").length;
  const losses = settledRows.filter((row) => row.resultBucket === "LOSS").length;
  const calibrationBuckets = buildCalibrationBuckets(rows);
  const calibrationErrorAvg = avg(calibrationBuckets.map((bucket) => bucket.calibrationError));

  return {
    league: first?.league ?? "UNKNOWN",
    market: first?.market ?? SNAPSHOT_MARKET,
    modelVersion: first?.modelVersion ?? DEFAULT_MODEL_VERSION,
    predictionCount: rows.length,
    settledCount: settledRows.length,
    pendingCount: Math.max(0, rows.length - settledRows.length),
    sampleWarning: sampleWarning(rows.length, settledRows.length),
    brierScoreAvg: round(avg(settledRows.map((row) => row.brierScore)), 4),
    logLossAvg: round(avg(settledRows.map((row) => row.logLoss)), 4),
    spreadMae: round(avg(settledRows.map((row) => row.spreadError)), 2),
    totalMae: round(avg(settledRows.map((row) => row.totalError)), 2),
    clvAvgPct: round(avg(settledRows.map((row) => row.clvPct)), 3),
    winRate: wins + losses > 0 ? round(wins / (wins + losses), 3) : null,
    calibrationErrorAvg: round(calibrationErrorAvg, 4),
    dataQualityBreakdown: countBy(rows.map((row) => row.dataQualityGrade ?? "UNKNOWN")),
    calibrationBuckets
  };
}

function emptyScorecard(filters: ScorecardFilters, databaseReady: boolean, error?: string): SimModelScorecard {
  return {
    ok: databaseReady,
    databaseReady,
    generatedAt: new Date().toISOString(),
    sourceTable: "sim_prediction_snapshots",
    filters: {
      league: normalizeFilter(filters.league),
      market: normalizeFilter(filters.market),
      modelVersion: normalizeFilter(filters.modelVersion),
      windowDays: normalizeWindowDays(filters.windowDays)
    },
    totals: {
      predictionCount: 0,
      settledCount: 0,
      pendingCount: 0,
      leagueCount: 0,
      marketCount: 0,
      modelVersionCount: 0,
      brierScoreAvg: null,
      logLossAvg: null,
      spreadMae: null,
      totalMae: null,
      clvAvgPct: null
    },
    scorecards: [],
    byLeague: Object.fromEntries(DEFAULT_LEAGUES.map((league) => [league, {
      predictionCount: 0,
      settledCount: 0,
      brierScoreAvg: null,
      logLossAvg: null,
      spreadMae: null,
      totalMae: null,
      clvAvgPct: null
    }])),
    strongestMarkets: [],
    weakestMarkets: [],
    recent: [],
    error
  };
}

export async function getSimModelScorecard(filters: ScorecardFilters = {}): Promise<SimModelScorecard> {
  if (!hasUsableServerDatabaseUrl()) {
    return emptyScorecard(filters, false, "No usable server database URL is configured.");
  }

  let initialization: Awaited<ReturnType<typeof getSimAccuracySummary>>;
  try {
    initialization = await getSimAccuracySummary(1);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return emptyScorecard(filters, true, `Ledger initialization failed: ${message}`);
  }
  if (!initialization.ok) {
    return emptyScorecard(filters, initialization.databaseReady, initialization.error ?? "Unable to initialize sim accuracy snapshot ledger.");
  }

  const league = normalizeFilter(filters.league);
  const market = normalizeFilter(filters.market);
  const modelVersion = normalizeFilter(filters.modelVersion);
  const windowDays = normalizeWindowDays(filters.windowDays);
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  if (market !== "ALL" && market !== SNAPSHOT_MARKET) {
    return emptyScorecard({ league, market, modelVersion, windowDays }, true);
  }

  let rows: SnapshotRow[];
  try {
    rows = await prisma.$queryRaw<SnapshotRow[]>`
      SELECT
        id, league, game_id, event_label, away_team, home_team, captured_at,
        model_version, data_source, tier, no_bet, confidence,
        model_home_win_pct, model_away_win_pct, model_spread, model_total,
        market_home_win_pct, market_spread, market_total,
        final_home_score, final_away_score, home_won,
        brier, log_loss, spread_error, total_error,
        prediction_json, result_json, graded_at, created_at, updated_at
      FROM sim_prediction_snapshots
      WHERE captured_at >= ${since}
        AND (${league} = 'ALL' OR league = ${league})
        AND (${modelVersion} = 'ALL' OR COALESCE(model_version, ${DEFAULT_MODEL_VERSION}) = ${modelVersion})
      ORDER BY captured_at DESC
      LIMIT 5000;
    `;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return emptyScorecard({ league, market, modelVersion, windowDays }, true, `Snapshot query failed: ${message}`);
  }

  const predictions = rows.map(mapSnapshotRow);
  const groups = new Map<string, SimulationPredictionRow[]>();
  for (const row of predictions) {
    const key = modelKey(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const scorecards = [...groups.values()].map(buildMarketScorecard).sort((left, right) => {
    const leftScore = left.brierScoreAvg ?? Number.POSITIVE_INFINITY;
    const rightScore = right.brierScoreAvg ?? Number.POSITIVE_INFINITY;
    return leftScore - rightScore || right.settledCount - left.settledCount;
  });

  const settledRows = predictions.filter((row) => row.settledAt);
  const byLeagueEntries = DEFAULT_LEAGUES.map((defaultLeague) => {
    const leagueRows = predictions.filter((row) => row.league === defaultLeague);
    const leagueSettled = leagueRows.filter((row) => row.settledAt);
    return [defaultLeague, {
      predictionCount: leagueRows.length,
      settledCount: leagueSettled.length,
      brierScoreAvg: round(avg(leagueSettled.map((row) => row.brierScore)), 4),
      logLossAvg: round(avg(leagueSettled.map((row) => row.logLoss)), 4),
      spreadMae: round(avg(leagueSettled.map((row) => row.spreadError)), 2),
      totalMae: round(avg(leagueSettled.map((row) => row.totalError)), 2),
      clvAvgPct: round(avg(leagueSettled.map((row) => row.clvPct)), 3)
    }] as const;
  });

  const viableMarkets = scorecards.filter((card) => card.settledCount >= 10);
  const strongestMarkets = [...viableMarkets].sort((left, right) => {
    const leftBrier = left.brierScoreAvg ?? Number.POSITIVE_INFINITY;
    const rightBrier = right.brierScoreAvg ?? Number.POSITIVE_INFINITY;
    return leftBrier - rightBrier || (right.clvAvgPct ?? -999) - (left.clvAvgPct ?? -999);
  }).slice(0, 5);
  const weakestMarkets = [...viableMarkets].sort((left, right) => {
    const leftBrier = left.brierScoreAvg ?? Number.NEGATIVE_INFINITY;
    const rightBrier = right.brierScoreAvg ?? Number.NEGATIVE_INFINITY;
    return rightBrier - leftBrier || (left.clvAvgPct ?? 999) - (right.clvAvgPct ?? 999);
  }).slice(0, 5);

  return {
    ok: true,
    databaseReady: true,
    generatedAt: new Date().toISOString(),
    sourceTable: "sim_prediction_snapshots",
    filters: { league, market, modelVersion, windowDays },
    totals: {
      predictionCount: predictions.length,
      settledCount: settledRows.length,
      pendingCount: Math.max(0, predictions.length - settledRows.length),
      leagueCount: new Set(predictions.map((row) => row.league)).size,
      marketCount: predictions.length ? 1 : 0,
      modelVersionCount: new Set(predictions.map((row) => row.modelVersion)).size,
      brierScoreAvg: round(avg(settledRows.map((row) => row.brierScore)), 4),
      logLossAvg: round(avg(settledRows.map((row) => row.logLoss)), 4),
      spreadMae: round(avg(settledRows.map((row) => row.spreadError)), 2),
      totalMae: round(avg(settledRows.map((row) => row.totalError)), 2),
      clvAvgPct: round(avg(settledRows.map((row) => row.clvPct)), 3)
    },
    scorecards,
    byLeague: Object.fromEntries(byLeagueEntries),
    strongestMarkets,
    weakestMarkets,
    recent: predictions.slice(0, 50)
  };
}
