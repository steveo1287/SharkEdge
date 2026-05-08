import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

const ACTIVE_LEAGUE = "MLB";
const DEFAULT_MODEL_VERSION = "sim-accuracy-snapshot";
const SNAPSHOT_MARKET = "moneyline";
const BUCKETS = [
  { bucket: "40-45", lower: 0.4, upper: 0.45 },
  { bucket: "45-50", lower: 0.45, upper: 0.5 },
  { bucket: "50-55", lower: 0.5, upper: 0.55 },
  { bucket: "55-60", lower: 0.55, upper: 0.6 },
  { bucket: "60-65", lower: 0.6, upper: 0.65 },
  { bucket: "65-70", lower: 0.65, upper: 0.7 },
  { bucket: "70+", lower: 0.7, upper: null }
];
const JUICE_PAYOUT = 100 / 110;

type ScorecardFilters = {
  league?: string | null;
  market?: string | null;
  modelVersion?: string | null;
  windowDays?: number | null;
};

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

type LedgerRow = ReturnType<typeof mapRow>;

function normalizeFilter(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.toUpperCase() === "ALL") return "ALL";
  return trimmed;
}

function normalizeWindowDays(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 365;
  return Math.min(3650, Math.max(1, Math.round(value)));
}

function n(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function r(value: number | null | undefined, digits = 4) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function avg(values: Array<number | null | undefined>) {
  const usable = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
}

function iso(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function json(value: unknown) {
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

function obj(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function get(source: unknown, path: string) {
  let current: unknown = source;
  for (const part of path.split(".")) {
    const record = obj(current);
    if (!record) return undefined;
    current = record[part];
  }
  return current;
}

function american(value: unknown) {
  const odds = n(value);
  if (odds == null || odds === 0) return null;
  if (Math.abs(odds) < 100 || Math.abs(odds) > 10000) return null;
  return Math.round(odds);
}

const HOME_ODDS = ["homeMoneyline", "homeAmericanOdds", "homeOddsAmerican", "homeOdds", "currentHomeOdds", "bestHomeOddsAmerican", "moneyline.home", "moneyline.homeOdds", "moneyline.homeMoneyline", "markets.moneyline.home", "markets.moneyline.homeOdds", "home.price", "home.odds", "home.americanOdds"];
const AWAY_ODDS = ["awayMoneyline", "awayAmericanOdds", "awayOddsAmerican", "awayOdds", "currentAwayOdds", "bestAwayOddsAmerican", "moneyline.away", "moneyline.awayOdds", "moneyline.awayMoneyline", "markets.moneyline.away", "markets.moneyline.awayOdds", "away.price", "away.odds", "away.americanOdds"];

function findOdds(source: unknown, paths: string[]) {
  for (const path of paths) {
    const value = american(get(source, path));
    if (value != null) return value;
  }
  return null;
}

function signal(payload: unknown) {
  const topSignal = obj(get(payload, "topSignal"));
  const market = String(topSignal?.market ?? "").toLowerCase() || null;
  const strength = String(topSignal?.strength ?? "").toLowerCase() || null;
  if (!topSignal) return { side: null as "HOME" | "AWAY" | null, market, strength, excluded: "no top signal" };
  if (market === "home_ml") return { side: "HOME" as const, market, strength, excluded: null as string | null };
  if (market === "away_ml") return { side: "AWAY" as const, market, strength, excluded: null as string | null };
  return { side: null as "HOME" | "AWAY" | null, market, strength, excluded: market ? `non-moneyline signal: ${market}` : "missing moneyline signal" };
}

function selectedOdds(payload: unknown, side: "HOME" | "AWAY" | null) {
  if (!side) return { odds: null as number | null, source: null as string | null };
  const record = obj(payload);
  if (!record) return { odds: null, source: null };
  const candidates = [record.market, get(record, "mlbIntel.market"), get(record, "realityIntel.market"), get(record, "nbaIntel.market"), record.topSignal, record.sportsbook ? record : null].filter(Boolean);
  const paths = side === "HOME" ? HOME_ODDS : AWAY_ODDS;
  for (const candidate of candidates) {
    const odds = findOdds(candidate, paths);
    if (odds != null) {
      return {
        odds,
        source: String(get(candidate, "sportsbook") ?? get(candidate, "bookmaker") ?? record.sportsbook ?? "captured market")
      };
    }
  }
  return { odds: null, source: null };
}

function bucketFor(probability: number | null | undefined) {
  if (typeof probability !== "number" || !Number.isFinite(probability)) return null;
  return BUCKETS.find((bucket) => probability >= bucket.lower && (bucket.upper == null || probability < bucket.upper))?.bucket ?? null;
}

function result(row: SnapshotRow, side: "HOME" | "AWAY" | null) {
  const homeWon = row.home_won;
  const finalHome = n(row.final_home_score);
  const finalAway = n(row.final_away_score);
  if (!side || !row.graded_at || finalHome == null || finalAway == null || homeWon == null) return "PENDING";
  if (finalHome === finalAway) return "PUSH";
  return (side === "HOME") === homeWon ? "WIN" : "LOSS";
}

function quality(row: LedgerRow) {
  if (row.roiExclusionReason) return `EXCLUDED: ${row.roiExclusionReason}`;
  const flags = obj(row.dataQualityFlags);
  if (flags?.noBet) return "MONEYLINE: governor no-bet";
  if (!row.signalStrength) return "MONEYLINE: missing strength";
  return `MONEYLINE: ${row.signalStrength}`;
}

function mapRow(row: SnapshotRow) {
  const predictionJson = json(row.prediction_json);
  const sig = signal(predictionJson);
  const odds = selectedOdds(predictionJson, sig.side);
  const predictionTime = iso(row.captured_at) ?? new Date().toISOString();
  const modelProbability = n(row.model_home_win_pct);
  const modelNoBet = Boolean(row.no_bet) || Boolean(get(predictionJson, "model.noBet")) || Boolean(get(predictionJson, "mlbIntel.governor.noBet"));

  return {
    id: String(row.id),
    gameId: String(row.game_id),
    league: ACTIVE_LEAGUE,
    market: SNAPSHOT_MARKET,
    modelVersion: row.model_version ?? DEFAULT_MODEL_VERSION,
    predictionTime,
    eventLabel: row.event_label ?? null,
    side: sig.side,
    signalMarket: sig.market,
    signalStrength: sig.strength,
    roiExclusionReason: sig.excluded,
    selectedAmericanOdds: odds.odds,
    oddsSource: odds.source,
    modelProbability,
    modelSpread: n(row.model_spread),
    modelTotal: n(row.model_total),
    marketProbability: n(row.market_home_win_pct),
    marketSpread: n(row.market_spread),
    marketTotal: n(row.market_total),
    closingProbability: null,
    closingSpread: null,
    closingTotal: null,
    finalHomeScore: n(row.final_home_score),
    finalAwayScore: n(row.final_away_score),
    outcome: row.home_won == null ? null : row.home_won ? 1 : 0,
    resultBucket: result(row, sig.side),
    brierScore: n(row.brier),
    logLoss: n(row.log_loss),
    spreadError: n(row.spread_error),
    totalError: n(row.total_error),
    clvPct: null,
    dataQualityGrade: row.tier ?? "UNKNOWN",
    dataQualityFlags: { tier: row.tier, dataSource: row.data_source, noBet: modelNoBet, confidence: n(row.confidence), signalMarket: sig.market, signalStrength: sig.strength, roiExclusionReason: sig.excluded },
    predictionJson,
    resultJson: json(row.result_json),
    settledAt: iso(row.graded_at),
    createdAt: iso(row.created_at) ?? predictionTime,
    updatedAt: iso(row.updated_at) ?? predictionTime
  };
}

function graded(rows: LedgerRow[]) {
  return rows.filter((row) => row.outcome != null && row.finalHomeScore != null && row.finalAwayScore != null);
}

function decisions(rows: LedgerRow[]) {
  const byGame = new Map<string, LedgerRow>();
  for (const row of rows.filter((item) => item.resultBucket === "WIN" || item.resultBucket === "LOSS" || item.resultBucket === "PUSH")) {
    const key = `${row.modelVersion}::${row.gameId}`;
    const existing = byGame.get(key);
    if (!existing || new Date(row.predictionTime).getTime() > new Date(existing.predictionTime).getTime()) byGame.set(key, row);
  }
  return [...byGame.values()].sort((a, b) => new Date(b.predictionTime).getTime() - new Date(a.predictionTime).getTime());
}

function roi(rows: LedgerRow[]) {
  const rowsToGrade = decisions(rows).filter((row) => row.resultBucket === "WIN" || row.resultBucket === "LOSS");
  if (!rowsToGrade.length) return { unitsNet: null, roi: null, roiMode: "no_settled_picks", actualOddsCount: 0, fallbackOddsCount: 0, avgSelectedAmericanOdds: null };
  let net = 0;
  let actualOddsCount = 0;
  let fallbackOddsCount = 0;
  const captured: number[] = [];
  for (const row of rowsToGrade) {
    if (row.selectedAmericanOdds != null) { actualOddsCount += 1; captured.push(row.selectedAmericanOdds); }
    else fallbackOddsCount += 1;
    if (row.resultBucket === "LOSS") net -= 1;
    else net += row.selectedAmericanOdds == null ? JUICE_PAYOUT : row.selectedAmericanOdds > 0 ? row.selectedAmericanOdds / 100 : 100 / Math.abs(row.selectedAmericanOdds);
  }
  const unitsNet = r(net, 2);
  const mode = actualOddsCount > 0 && fallbackOddsCount === 0 ? "actual_captured_odds" : actualOddsCount > 0 ? "mixed_actual_and_fallback" : "fallback_-110";
  return { unitsNet, roi: r(((unitsNet ?? 0) / rowsToGrade.length) * 100, 2), roiMode: mode, actualOddsCount, fallbackOddsCount, avgSelectedAmericanOdds: r(avg(captured), 0) };
}

function counts(values: string[]) {
  return values.reduce<Record<string, number>>((acc, value) => { acc[value] = (acc[value] ?? 0) + 1; return acc; }, {});
}

function calibrationBuckets(rows: LedgerRow[]) {
  const settled = graded(rows);
  return BUCKETS.map((bucket) => {
    const bucketRows = settled.filter((row) => bucketFor(row.modelProbability) === bucket.bucket);
    const actual = bucketRows.length ? bucketRows.reduce((sum, row) => sum + Number(row.outcome ?? 0), 0) / bucketRows.length : null;
    const predicted = avg(bucketRows.map((row) => row.modelProbability));
    return { bucket: bucket.bucket, lower: bucket.lower, upper: bucket.upper, predictionCount: bucketRows.length, avgPredictedProbability: r(predicted, 3), actualHitRate: r(actual, 3), brierScoreAvg: r(avg(bucketRows.map((row) => row.brierScore)), 4), calibrationError: actual == null || predicted == null ? null : r(Math.abs(predicted - actual), 4) };
  });
}

function buildCard(rows: LedgerRow[]) {
  const pickRows = decisions(rows);
  const settled = graded(rows);
  const winCount = pickRows.filter((row) => row.resultBucket === "WIN").length;
  const lossCount = pickRows.filter((row) => row.resultBucket === "LOSS").length;
  const pushCount = pickRows.filter((row) => row.resultBucket === "PUSH").length;
  const buckets = calibrationBuckets(rows);
  return {
    league: ACTIVE_LEAGUE,
    market: SNAPSHOT_MARKET,
    modelVersion: rows[0]?.modelVersion ?? DEFAULT_MODEL_VERSION,
    predictionCount: rows.length,
    settledCount: pickRows.length,
    pendingCount: Math.max(0, rows.length - pickRows.length),
    winCount,
    lossCount,
    pushCount,
    sampleWarning: pickRows.length < 30 ? "Very small MLB moneyline signal sample. Treat ROI as directional only." : pickRows.length < 100 ? "Small MLB moneyline signal sample. Track before making hard ROI claims." : null,
    brierScoreAvg: r(avg(settled.map((row) => row.brierScore)), 4),
    logLossAvg: r(avg(settled.map((row) => row.logLoss)), 4),
    spreadMae: r(avg(settled.map((row) => row.spreadError)), 2),
    totalMae: r(avg(settled.map((row) => row.totalError)), 2),
    clvAvgPct: null,
    winRate: winCount + lossCount > 0 ? r(winCount / (winCount + lossCount), 3) : null,
    ...roi(rows),
    calibrationErrorAvg: r(avg(buckets.map((bucket) => bucket.calibrationError)), 4),
    dataQualityBreakdown: counts(rows.map(quality)),
    calibrationBuckets: buckets
  };
}

function empty(filters: ScorecardFilters, databaseReady: boolean, error?: string) {
  const windowDays = normalizeWindowDays(filters.windowDays);
  return {
    ok: databaseReady,
    databaseReady,
    generatedAt: new Date().toISOString(),
    sourceTable: "sim_prediction_snapshots",
    filters: { league: ACTIVE_LEAGUE, market: normalizeFilter(filters.market), modelVersion: normalizeFilter(filters.modelVersion), windowDays },
    totals: { predictionCount: 0, settledCount: 0, pendingCount: 0, winCount: 0, lossCount: 0, pushCount: 0, winRate: null, leagueCount: 0, marketCount: 0, modelVersionCount: 0, brierScoreAvg: null, logLossAvg: null, spreadMae: null, totalMae: null, clvAvgPct: null, unitsNet: null, roi: null, roiMode: "no_settled_picks", actualOddsCount: 0, fallbackOddsCount: 0, avgSelectedAmericanOdds: null },
    scorecards: [],
    byLeague: { MLB: { predictionCount: 0, settledCount: 0, winCount: 0, lossCount: 0, pushCount: 0, winRate: null, brierScoreAvg: null, logLossAvg: null, spreadMae: null, totalMae: null, clvAvgPct: null } },
    strongestMarkets: [],
    weakestMarkets: [],
    recent: [],
    error
  };
}

export async function getSimModelScorecard(filters: ScorecardFilters = {}) {
  if (!hasUsableServerDatabaseUrl()) return empty(filters, false, "No usable server database URL is configured.");
  const market = normalizeFilter(filters.market);
  const modelVersion = normalizeFilter(filters.modelVersion);
  const windowDays = normalizeWindowDays(filters.windowDays);
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  if (market !== "ALL" && market !== SNAPSHOT_MARKET) return empty({ league: ACTIVE_LEAGUE, market, modelVersion, windowDays }, true);
  let rows: SnapshotRow[];
  try {
    rows = await prisma.$queryRaw<SnapshotRow[]>`
      SELECT id, league, game_id, event_label, captured_at,
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
    return empty({ league: ACTIVE_LEAGUE, market, modelVersion, windowDays }, false, "Sim accuracy database is unavailable. Verify DATABASE_URL and run the Prisma migration before using the MLB accuracy ledger.");
  }
  const predictions = rows.map(mapRow);
  const groups = new Map<string, LedgerRow[]>();
  for (const row of predictions) {
    const key = `${ACTIVE_LEAGUE}::${row.market}::${row.modelVersion}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const scorecards = [...groups.values()].map(buildCard).sort((a, b) => b.settledCount - a.settledCount);
  const card = buildCard(predictions);
  const settled = graded(predictions);
  return {
    ok: true,
    databaseReady: true,
    generatedAt: new Date().toISOString(),
    sourceTable: "sim_prediction_snapshots",
    filters: { league: ACTIVE_LEAGUE, market, modelVersion, windowDays },
    totals: { predictionCount: predictions.length, settledCount: card.settledCount, pendingCount: card.pendingCount, winCount: card.winCount, lossCount: card.lossCount, pushCount: card.pushCount, winRate: card.winRate, leagueCount: predictions.length ? 1 : 0, marketCount: predictions.length ? 1 : 0, modelVersionCount: new Set(predictions.map((row) => row.modelVersion)).size, brierScoreAvg: r(avg(settled.map((row) => row.brierScore)), 4), logLossAvg: r(avg(settled.map((row) => row.logLoss)), 4), spreadMae: r(avg(settled.map((row) => row.spreadError)), 2), totalMae: r(avg(settled.map((row) => row.totalError)), 2), clvAvgPct: null, unitsNet: card.unitsNet, roi: card.roi, roiMode: card.roiMode, actualOddsCount: card.actualOddsCount, fallbackOddsCount: card.fallbackOddsCount, avgSelectedAmericanOdds: card.avgSelectedAmericanOdds },
    scorecards,
    byLeague: { MLB: { predictionCount: predictions.length, settledCount: card.settledCount, winCount: card.winCount, lossCount: card.lossCount, pushCount: card.pushCount, winRate: card.winRate, brierScoreAvg: r(avg(settled.map((row) => row.brierScore)), 4), logLossAvg: r(avg(settled.map((row) => row.logLoss)), 4), spreadMae: r(avg(settled.map((row) => row.spreadError)), 2), totalMae: r(avg(settled.map((row) => row.totalError)), 2), clvAvgPct: null } },
    strongestMarkets: scorecards.filter((item) => item.settledCount >= 10).slice(0, 5),
    weakestMarkets: scorecards.filter((item) => item.settledCount >= 10).slice(-5),
    recent: predictions.slice(0, 50)
  };
}
