import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

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
export type RoiMode = "actual_captured_odds" | "mixed_actual_and_fallback" | "fallback_-110" | "no_settled_picks";

export type SimulationPredictionRow = {
  id: string;
  gameId: string;
  league: string;
  market: string;
  modelVersion: string;
  predictionTime: string;
  eventLabel: string | null;
  side: string | null;
  signalMarket: string | null;
  signalStrength: string | null;
  roiExclusionReason: string | null;
  selectedAmericanOdds: number | null;
  oddsSource: string | null;
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
  winCount: number;
  lossCount: number;
  pushCount: number;
  sampleWarning: string | null;
  brierScoreAvg: number | null;
  logLossAvg: number | null;
  spreadMae: number | null;
  totalMae: number | null;
  clvAvgPct: number | null;
  winRate: number | null;
  unitsNet: number | null;
  roi: number | null;
  roiMode: RoiMode;
  actualOddsCount: number;
  fallbackOddsCount: number;
  avgSelectedAmericanOdds: number | null;
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
    winCount: number;
    lossCount: number;
    pushCount: number;
    winRate: number | null;
    leagueCount: number;
    marketCount: number;
    modelVersionCount: number;
    brierScoreAvg: number | null;
    logLossAvg: number | null;
    spreadMae: number | null;
    totalMae: number | null;
    clvAvgPct: number | null;
    unitsNet: number | null;
    roi: number | null;
    roiMode: RoiMode;
    actualOddsCount: number;
    fallbackOddsCount: number;
    avgSelectedAmericanOdds: number | null;
  };
  scorecards: MarketScorecard[];
  byLeague: Record<string, {
    predictionCount: number;
    settledCount: number;
    winCount: number;
    lossCount: number;
    pushCount: number;
    winRate: number | null;
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

const ACTIVE_LEAGUE = "MLB";
const DEFAULT_LEAGUES = [ACTIVE_LEAGUE];
const SNAPSHOT_MARKET = "moneyline";
const DEFAULT_MODEL_VERSION = "sim-accuracy-snapshot";
const ACTIONABLE_SIGNAL_STRENGTHS = new Set(["strong", "watch"]);
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
  captured_at: Date | string;
  model_version: string | null;
  data_source: string | null;
  tier: string | null;
  no_bet: boolean | null;
  confidence: number | string | null;
  model_home_win_pct: number | string | null;
  model_spread: number | string | null;
  model_total: number | string | null;
  market_home_win_pct: number | string | null;
  market_spread: number | string | null;
  market_total: number | string | null;
  final_home_score: number | string | null;
  final_away_score: number | string | null;
  home_won: boolean | null;
  brier: number | string | null;
  log_loss: number | string | null;
  spread_error: number | string | null;
  total_error: number | string | null;
  prediction_json: unknown;
  result_json: unknown;
  graded_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type SelectedSignal = {
  side: "HOME" | "AWAY" | null;
  market: string | null;
  strength: string | null;
  exclusionReason: string | null;
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

function normalizeAmericanOdds(value: unknown) {
  const odds = normalizeNumber(value);
  if (odds == null || odds === 0) return null;
  if (Math.abs(odds) < 100 || Math.abs(odds) > 10000) return null;
  return Math.round(odds);
}

function round(value: number | null | undefined, digits = 4) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function avg(values: Array<number | null | undefined>) {
  const usable = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
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

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function nestedValue(source: unknown, path: string) {
  const parts = path.split(".");
  let current: unknown = source;
  for (const part of parts) {
    const object = objectRecord(current);
    if (!object) return undefined;
    current = object[part];
  }
  return current;
}

function firstAmericanOdds(source: unknown, paths: string[]) {
  for (const path of paths) {
    const odds = normalizeAmericanOdds(nestedValue(source, path));
    if (odds != null) return odds;
  }
  return null;
}

const HOME_ODDS_PATHS = [
  "homeMoneyline",
  "homeAmericanOdds",
  "homeOddsAmerican",
  "homeOdds",
  "currentHomeOdds",
  "bestHomeOddsAmerican",
  "moneyline.home",
  "moneyline.homeOdds",
  "moneyline.homeMoneyline",
  "markets.moneyline.home",
  "markets.moneyline.homeOdds",
  "home.price",
  "home.odds",
  "home.americanOdds"
];

const AWAY_ODDS_PATHS = [
  "awayMoneyline",
  "awayAmericanOdds",
  "awayOddsAmerican",
  "awayOdds",
  "currentAwayOdds",
  "bestAwayOddsAmerican",
  "moneyline.away",
  "moneyline.awayOdds",
  "moneyline.awayMoneyline",
  "markets.moneyline.away",
  "markets.moneyline.awayOdds",
  "away.price",
  "away.odds",
  "away.americanOdds"
];

function selectedSignalFromPredictionJson(predictionJson: unknown, noBet: boolean | null | undefined): SelectedSignal {
  const payload = objectRecord(predictionJson);
  const topSignal = objectRecord(nestedValue(payload, "topSignal"));
  const market = String(topSignal?.market ?? "").toLowerCase() || null;
  const strength = String(topSignal?.strength ?? "").toLowerCase() || null;
  const modelNoBet = Boolean(noBet) || Boolean(nestedValue(payload, "model.noBet")) || Boolean(nestedValue(payload, "mlbIntel.governor.noBet"));

  const side = market === "home_ml" ? "HOME" : market === "away_ml" ? "AWAY" : null;

  if (!topSignal) return { side: null, market, strength, exclusionReason: "no top signal" };
  if (!side) return { side: null, market, strength, exclusionReason: market ? `non-moneyline signal: ${market}` : "missing moneyline signal" };
  if (modelNoBet) return { side, market, strength, exclusionReason: "model marked no-bet" };
  if (!strength || !ACTIONABLE_SIGNAL_STRENGTHS.has(strength)) return { side, market, strength, exclusionReason: strength ? `non-actionable strength: ${strength}` : "missing signal strength" };

  return { side, market, strength, exclusionReason: null };
}

function selectedOddsFromPredictionJson(predictionJson: unknown, side: "HOME" | "AWAY" | null) {
  if (!side) return { odds: null, source: null };
  const payload = objectRecord(predictionJson);
  if (!payload) return { odds: null, source: null };

  const candidates = [
    payload.market,
    nestedValue(payload, "mlbIntel.market"),
    nestedValue(payload, "realityIntel.market"),
    nestedValue(payload, "nbaIntel.market"),
    payload.topSignal,
    payload.sportsbook ? payload : null
  ].filter(Boolean);

  const paths = side === "HOME" ? HOME_ODDS_PATHS : AWAY_ODDS_PATHS;
  for (const candidate of candidates) {
    const odds = firstAmericanOdds(candidate, paths);
    if (odds != null) {
      const source = String(nestedValue(candidate, "sportsbook") ?? nestedValue(candidate, "bookmaker") ?? payload.sportsbook ?? "captured market");
      return { odds, source };
    }
  }

  return { odds: null, source: null };
}

function resultBucketFor(row: SnapshotRow, side: "HOME" | "AWAY" | null): ResultBucket {
  const homeWon = row.home_won;
  const finalHomeScore = normalizeNumber(row.final_home_score);
  const finalAwayScore = normalizeNumber(row.final_away_score);
  if (!side || !row.graded_at || finalHomeScore == null || finalAwayScore == null || homeWon == null) return "PENDING";
  if (finalHomeScore === finalAwayScore) return "PUSH";
  return (side === "HOME") === homeWon ? "WIN" : "LOSS";
}

function mapSnapshotRow(row: SnapshotRow): SimulationPredictionRow {
  const predictionTime = toIso(row.captured_at) ?? new Date().toISOString();
  const settledAt = toIso(row.graded_at);
  const createdAt = toIso(row.created_at) ?? predictionTime;
  const updatedAt = toIso(row.updated_at) ?? createdAt;
  const modelProbability = normalizeNumber(row.model_home_win_pct);
  const homeWon = row.home_won == null ? null : row.home_won ? 1 : 0;
  const predictionJson = normalizeJson(row.prediction_json);
  const signal = selectedSignalFromPredictionJson(predictionJson, row.no_bet);
  const selectedOdds = selectedOddsFromPredictionJson(predictionJson, signal.exclusionReason ? null : signal.side);

  return {
    id: String(row.id),
    gameId: String(row.game_id),
    league: ACTIVE_LEAGUE,
    market: SNAPSHOT_MARKET,
    modelVersion: row.model_version ?? DEFAULT_MODEL_VERSION,
    predictionTime,
    eventLabel: row.event_label ?? null,
    side: signal.exclusionReason ? null : signal.side,
    signalMarket: signal.market,
    signalStrength: signal.strength,
    roiExclusionReason: signal.exclusionReason,
    selectedAmericanOdds: selectedOdds.odds,
    oddsSource: selectedOdds.source,
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
    resultBucket: resultBucketFor(row, signal.exclusionReason ? null : signal.side),
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
      confidence: normalizeNumber(row.confidence),
      signalMarket: signal.market,
      signalStrength: signal.strength,
      roiExclusionReason: signal.exclusionReason
    },
    predictionJson,
    resultJson: normalizeJson(row.result_json),
    settledAt,
    createdAt,
    updatedAt
  };
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((acc, value) => {
    const key = value || "UNKNOWN";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function calibrationBucketFor(probability: number | null | undefined) {
  if (typeof probability !== "number" || !Number.isFinite(probability)) return null;
  return BUCKETS.find((bucket) => probability >= bucket.lower && (bucket.upper == null || probability < bucket.upper))?.bucket ?? null;
}

function gradedPredictionRows(rows: SimulationPredictionRow[]) {
  return rows.filter((row) => row.outcome != null && row.finalHomeScore != null && row.finalAwayScore != null);
}

function isBetDecision(row: SimulationPredictionRow) {
  return row.resultBucket === "WIN" || row.resultBucket === "LOSS" || row.resultBucket === "PUSH";
}

function latestActionableBetRows(rows: SimulationPredictionRow[]) {
  const byGame = new Map<string, SimulationPredictionRow>();
  for (const row of rows.filter(isBetDecision)) {
    const key = `${row.modelVersion}::${row.gameId}`;
    const existing = byGame.get(key);
    if (!existing || new Date(row.predictionTime).getTime() > new Date(existing.predictionTime).getTime()) {
      byGame.set(key, row);
    }
  }
  return [...byGame.values()].sort((left, right) => new Date(right.predictionTime).getTime() - new Date(left.predictionTime).getTime());
}

function buildCalibrationBuckets(rows: SimulationPredictionRow[]): CalibrationBucket[] {
  const gradedRows = gradedPredictionRows(rows);
  return BUCKETS.map((bucket) => {
    const bucketRows = gradedRows.filter((row) => calibrationBucketFor(row.modelProbability) === bucket.bucket);
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

const JUICE_PAYOUT = 100 / 110;

function unitProfitForWin(americanOdds: number | null | undefined) {
  if (typeof americanOdds !== "number" || !Number.isFinite(americanOdds) || americanOdds === 0) return null;
  return americanOdds > 0 ? americanOdds / 100 : 100 / Math.abs(americanOdds);
}

function calculateUnitsRoi(rows: SimulationPredictionRow[]) {
  const decisions = latestActionableBetRows(rows).filter((row) => row.resultBucket === "WIN" || row.resultBucket === "LOSS");
  const bets = decisions.length;
  if (!bets) {
    return { unitsNet: null, roi: null, roiMode: "no_settled_picks" as RoiMode, actualOddsCount: 0, fallbackOddsCount: 0, avgSelectedAmericanOdds: null };
  }

  let net = 0;
  let actualOddsCount = 0;
  let fallbackOddsCount = 0;
  const capturedOdds: number[] = [];

  for (const row of decisions) {
    if (row.selectedAmericanOdds != null) {
      actualOddsCount += 1;
      capturedOdds.push(row.selectedAmericanOdds);
    } else {
      fallbackOddsCount += 1;
    }

    if (row.resultBucket === "LOSS") {
      net -= 1;
      continue;
    }

    net += unitProfitForWin(row.selectedAmericanOdds) ?? JUICE_PAYOUT;
  }

  const roiMode: RoiMode = actualOddsCount > 0 && fallbackOddsCount === 0
    ? "actual_captured_odds"
    : actualOddsCount > 0
      ? "mixed_actual_and_fallback"
      : "fallback_-110";

  const unitsNet = round(net, 2);
  const roi = round(((unitsNet ?? 0) / bets) * 100, 2);
  return {
    unitsNet,
    roi,
    roiMode,
    actualOddsCount,
    fallbackOddsCount,
    avgSelectedAmericanOdds: round(avg(capturedOdds), 0)
  };
}

function sampleWarning(predictionCount: number, settledCount: number) {
  if (settledCount < 30) return "Very small actionable MLB bet sample. Treat ROI as directional only.";
  if (settledCount < 100) return "Small actionable MLB bet sample. Track before making hard ROI claims.";
  if (predictionCount - settledCount > settledCount) return "Many MLB snapshots were pass/non-moneyline/thin signals. Record and ROI only grade actionable moneyline bets.";
  return null;
}

function buildMarketScorecard(rows: SimulationPredictionRow[]): MarketScorecard {
  const first = rows[0];
  const calibrationRows = gradedPredictionRows(rows);
  const betRows = latestActionableBetRows(rows);
  const winCount = betRows.filter((row) => row.resultBucket === "WIN").length;
  const lossCount = betRows.filter((row) => row.resultBucket === "LOSS").length;
  const pushCount = betRows.filter((row) => row.resultBucket === "PUSH").length;
  const calibrationBuckets = buildCalibrationBuckets(rows);
  const calibrationErrorAvg = avg(calibrationBuckets.map((bucket) => bucket.calibrationError));
  const roiSummary = calculateUnitsRoi(rows);

  return {
    league: ACTIVE_LEAGUE,
    market: first?.market ?? SNAPSHOT_MARKET,
    modelVersion: first?.modelVersion ?? DEFAULT_MODEL_VERSION,
    predictionCount: rows.length,
    settledCount: betRows.length,
    pendingCount: Math.max(0, rows.length - betRows.length),
    winCount,
    lossCount,
    pushCount,
    sampleWarning: sampleWarning(rows.length, betRows.length),
    brierScoreAvg: round(avg(calibrationRows.map((row) => row.brierScore)), 4),
    logLossAvg: round(avg(calibrationRows.map((row) => row.logLoss)), 4),
    spreadMae: round(avg(calibrationRows.map((row) => row.spreadError)), 2),
    totalMae: round(avg(calibrationRows.map((row) => row.totalError)), 2),
    clvAvgPct: null,
    winRate: winCount + lossCount > 0 ? round(winCount / (winCount + lossCount), 3) : null,
    ...roiSummary,
    calibrationErrorAvg: round(calibrationErrorAvg, 4),
    dataQualityBreakdown: countBy(rows.map((row) => row.roiExclusionReason ? `EXCLUDED: ${row.roiExclusionReason}` : row.signalStrength ?? row.dataQualityGrade ?? "UNKNOWN")),
    calibrationBuckets
  };
}

function emptyLeagueSummary() {
  return {
    predictionCount: 0,
    settledCount: 0,
    winCount: 0,
    lossCount: 0,
    pushCount: 0,
    winRate: null,
    brierScoreAvg: null,
    logLossAvg: null,
    spreadMae: null,
    totalMae: null,
    clvAvgPct: null
  };
}

function emptyScorecard(filters: ScorecardFilters, databaseReady: boolean, error?: string): SimModelScorecard {
  const resolvedFilters = {
    league: ACTIVE_LEAGUE,
    market: normalizeFilter(filters.market),
    modelVersion: normalizeFilter(filters.modelVersion),
    windowDays: normalizeWindowDays(filters.windowDays)
  };

  return {
    ok: databaseReady,
    databaseReady,
    generatedAt: new Date().toISOString(),
    sourceTable: "sim_prediction_snapshots",
    filters: resolvedFilters,
    totals: {
      predictionCount: 0,
      settledCount: 0,
      pendingCount: 0,
      winCount: 0,
      lossCount: 0,
      pushCount: 0,
      winRate: null,
      leagueCount: 0,
      marketCount: 0,
      modelVersionCount: 0,
      brierScoreAvg: null,
      logLossAvg: null,
      spreadMae: null,
      totalMae: null,
      clvAvgPct: null,
      unitsNet: null,
      roi: null,
      roiMode: "no_settled_picks",
      actualOddsCount: 0,
      fallbackOddsCount: 0,
      avgSelectedAmericanOdds: null
    },
    scorecards: [],
    byLeague: { [ACTIVE_LEAGUE]: emptyLeagueSummary() },
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

  const market = normalizeFilter(filters.market);
  const modelVersion = normalizeFilter(filters.modelVersion);
  const windowDays = normalizeWindowDays(filters.windowDays);
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  if (market !== "ALL" && market !== SNAPSHOT_MARKET) {
    return emptyScorecard({ league: ACTIVE_LEAGUE, market, modelVersion, windowDays }, true);
  }

  let rows: SnapshotRow[];
  try {
    rows = await prisma.$queryRaw<SnapshotRow[]>`
      SELECT
        id, league, game_id, event_label, captured_at,
        model_version, data_source, tier, no_bet, confidence,
        model_home_win_pct, model_spread, model_total,
        market_home_win_pct, market_spread, market_total,
        final_home_score, final_away_score, home_won,
        brier, log_loss, spread_error, total_error,
        prediction_json, result_json, graded_at, created_at, updated_at
      FROM sim_prediction_snapshots
      WHERE captured_at >= ${since}
        AND UPPER(league) = ${ACTIVE_LEAGUE}
        AND (${modelVersion} = 'ALL' OR COALESCE(model_version, ${DEFAULT_MODEL_VERSION}) = ${modelVersion})
      ORDER BY captured_at DESC
      LIMIT 5000;
    `;
  } catch (error) {
    console.error("[sim-accuracy] MLB scorecard query failed", error);
    return emptyScorecard(
      { league: ACTIVE_LEAGUE, market, modelVersion, windowDays },
      false,
      "Sim accuracy database is unavailable. Verify DATABASE_URL and run the Prisma migration before using the MLB accuracy ledger."
    );
  }

  const predictions = rows.map(mapSnapshotRow);
  const groups = new Map<string, SimulationPredictionRow[]>();
  for (const row of predictions) {
    const key = `${ACTIVE_LEAGUE}::${row.market}::${row.modelVersion}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const scorecards = [...groups.values()].map(buildMarketScorecard).sort((left, right) => {
    const leftScore = left.brierScoreAvg ?? Number.POSITIVE_INFINITY;
    const rightScore = right.brierScoreAvg ?? Number.POSITIVE_INFINITY;
    return leftScore - rightScore || right.settledCount - left.settledCount;
  });

  const calibrationRows = gradedPredictionRows(predictions);
  const betRows = latestActionableBetRows(predictions);
  const winCount = betRows.filter((row) => row.resultBucket === "WIN").length;
  const lossCount = betRows.filter((row) => row.resultBucket === "LOSS").length;
  const pushCount = betRows.filter((row) => row.resultBucket === "PUSH").length;
  const winRate = winCount + lossCount > 0 ? round(winCount / (winCount + lossCount), 3) : null;
  const roiSummary = calculateUnitsRoi(predictions);
  const byLeague = {
    [ACTIVE_LEAGUE]: {
      predictionCount: predictions.length,
      settledCount: betRows.length,
      winCount,
      lossCount,
      pushCount,
      winRate,
      brierScoreAvg: round(avg(calibrationRows.map((row) => row.brierScore)), 4),
      logLossAvg: round(avg(calibrationRows.map((row) => row.logLoss)), 4),
      spreadMae: round(avg(calibrationRows.map((row) => row.spreadError)), 2),
      totalMae: round(avg(calibrationRows.map((row) => row.totalError)), 2),
      clvAvgPct: null
    }
  };
  const viableMarkets = scorecards.filter((card) => card.settledCount >= 10);

  return {
    ok: true,
    databaseReady: true,
    generatedAt: new Date().toISOString(),
    sourceTable: "sim_prediction_snapshots",
    filters: { league: ACTIVE_LEAGUE, market, modelVersion, windowDays },
    totals: {
      predictionCount: predictions.length,
      settledCount: betRows.length,
      pendingCount: Math.max(0, predictions.length - betRows.length),
      winCount,
      lossCount,
      pushCount,
      winRate,
      leagueCount: predictions.length ? DEFAULT_LEAGUES.length : 0,
      marketCount: predictions.length ? 1 : 0,
      modelVersionCount: new Set(predictions.map((row) => row.modelVersion)).size,
      brierScoreAvg: round(avg(calibrationRows.map((row) => row.brierScore)), 4),
      logLossAvg: round(avg(calibrationRows.map((row) => row.logLoss)), 4),
      spreadMae: round(avg(calibrationRows.map((row) => row.spreadError)), 2),
      totalMae: round(avg(calibrationRows.map((row) => row.totalError)), 2),
      clvAvgPct: null,
      ...roiSummary
    },
    scorecards,
    byLeague,
    strongestMarkets: [...viableMarkets].sort((left, right) => (left.brierScoreAvg ?? 999) - (right.brierScoreAvg ?? 999)).slice(0, 5),
    weakestMarkets: [...viableMarkets].sort((left, right) => (right.brierScoreAvg ?? -999) - (left.brierScoreAvg ?? -999)).slice(0, 5),
    recent: predictions.slice(0, 50)
  };
}
