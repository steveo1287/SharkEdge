import { getLiveOddsReadinessReport } from "@/services/current-odds/provider-readiness-service";
import { getMlbDataQualityReport } from "@/services/ops/mlb-data-quality";
import { getUfcOperationalStatus } from "@/services/ufc/operational-status";

export type DataTowerStatus = "ELITE" | "USABLE" | "WEAK" | "BLOCKED";
export type DataTowerLaneKey = "MLB" | "MMA" | "ODDS";
export type DataTowerScope = "GLOBAL" | "MLB" | "MMA";

export type DataTowerMetric = {
  key: string;
  label: string;
  value: string | number | null;
  status: DataTowerStatus;
};

export type DataTowerLane = {
  key: DataTowerLaneKey;
  label: string;
  status: DataTowerStatus;
  score: number;
  generatedAt: string;
  blockers: string[];
  warnings: string[];
  metrics: DataTowerMetric[];
  recommendation: string;
};

export type DataControlTowerReport = {
  generatedAt: string;
  status: DataTowerStatus;
  score: number;
  scope: DataTowerScope;
  officialPromotionAllowed: boolean;
  lanes: DataTowerLane[];
  activeLaneKeys: DataTowerLaneKey[];
  blockers: string[];
  warnings: string[];
  nextActions: string[];
};

type ReportOptions = {
  scope?: DataTowerScope;
  globalMode?: boolean;
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function statusFromScore(score: number, blockers: string[] = []): DataTowerStatus {
  if (blockers.length) return "BLOCKED";
  if (score >= 85) return "ELITE";
  if (score >= 70) return "USABLE";
  if (score >= 45) return "WEAK";
  return "BLOCKED";
}

function metricStatus(score: number, hardBlock = false): DataTowerStatus {
  return statusFromScore(score, hardBlock ? ["blocked"] : []);
}

function ageMinutes(value: string | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.round((Date.now() - time) / 60_000));
}

function pct(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number((value * 100).toFixed(1));
}

function firstSettled<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

function firstError(result: PromiseSettledResult<unknown>) {
  return result.status === "rejected" ? result.reason instanceof Error ? result.reason.message : String(result.reason) : null;
}

function activeKeysForScope(scope: DataTowerScope, globalMode = false): DataTowerLaneKey[] {
  if (globalMode || scope === "GLOBAL") return ["MLB", "ODDS", "MMA"];
  if (scope === "MMA") return ["MMA", "ODDS"];
  return ["MLB", "ODDS"];
}

function buildMlbLane(report: Awaited<ReturnType<typeof getMlbDataQualityReport>> | null, error: string | null): DataTowerLane {
  const generatedAt = new Date().toISOString();
  if (!report) {
    return { key: "MLB", label: "MLB data quality", status: "BLOCKED", score: 0, generatedAt, blockers: [error ?? "MLB data quality report failed."], warnings: [], metrics: [], recommendation: "Do not promote MLB official plays until the MLB data-quality service is returning successfully." };
  }
  const blockers: string[] = [];
  const warnings = [...report.warnings];
  if (report.readiness === "NOT_READY") blockers.push("MLB data readiness is NOT_READY.");
  if (report.readiness === "WEAK") blockers.push("MLB data readiness is WEAK.");
  if (!report.games.total) blockers.push("No MLB games found in the quality lookback window.");
  const teamCoverage = report.coverage.find((item) => item.key === "team_boxscores")?.pct ?? null;
  const marketCoverage = report.coverage.find((item) => item.key === "markets")?.pct ?? null;
  const officialCoverage = report.coverage.find((item) => item.key === "official_results")?.pct ?? null;
  const closingCoverage = report.coverage.find((item) => item.key === "closing_lines")?.pct ?? null;
  const latestMarketAge = ageMinutes(report.sample.latestMarketUpdatedAt);
  const latestTeamAge = ageMinutes(report.sample.latestTeamStatUpdatedAt);
  const score = clampScore(report.dataQualityScore * 100 - (latestMarketAge != null && latestMarketAge > 90 ? 12 : 0));
  if (latestMarketAge == null) blockers.push("MLB market freshness timestamp is missing.");
  else if (latestMarketAge > 120) blockers.push("MLB market data is older than 120 minutes.");
  else if (latestMarketAge > 45) warnings.push("MLB market data is aging past 45 minutes.");
  return {
    key: "MLB",
    label: "MLB data quality",
    status: statusFromScore(score, blockers),
    score,
    generatedAt: report.generatedAt,
    blockers: Array.from(new Set(blockers)),
    warnings: Array.from(new Set(warnings)),
    metrics: [
      { key: "games", label: "Games in window", value: report.games.total, status: metricStatus(report.games.total ? 85 : 0, !report.games.total) },
      { key: "team_boxscores", label: "Team boxscore coverage", value: pct(teamCoverage), status: metricStatus((teamCoverage ?? 0) * 100) },
      { key: "markets", label: "Market coverage", value: pct(marketCoverage), status: metricStatus((marketCoverage ?? 0) * 100) },
      { key: "official_results", label: "Official result coverage", value: pct(officialCoverage), status: metricStatus((officialCoverage ?? 0) * 100) },
      { key: "closing_lines", label: "Closing-line coverage", value: pct(closingCoverage), status: metricStatus((closingCoverage ?? 0) * 100) },
      { key: "market_age", label: "Market freshness minutes", value: latestMarketAge, status: latestMarketAge == null ? "BLOCKED" : latestMarketAge <= 20 ? "ELITE" : latestMarketAge <= 45 ? "USABLE" : latestMarketAge <= 120 ? "WEAK" : "BLOCKED" },
      { key: "team_stat_age", label: "Team stat freshness minutes", value: latestTeamAge, status: latestTeamAge == null ? "WEAK" : latestTeamAge <= 240 ? "ELITE" : latestTeamAge <= 720 ? "USABLE" : "WEAK" }
    ],
    recommendation: blockers.length ? "MLB should stay WATCH/PASS only until freshness and coverage blockers clear." : score >= 85 ? "MLB data is strong enough for official promotion gates." : "MLB can run, but official PLAYs should require extra confirmation."
  };
}

function buildOddsLane(report: Awaited<ReturnType<typeof getLiveOddsReadinessReport>> | null, error: string | null): DataTowerLane {
  const generatedAt = new Date().toISOString();
  if (!report) {
    return { key: "ODDS", label: "Live odds readiness", status: "BLOCKED", score: 0, generatedAt, blockers: [error ?? "Live odds readiness report failed."], warnings: [], metrics: [], recommendation: "Do not promote official plays without live odds readiness." };
  }
  const boardReady = report.boardProviders.some((provider) => provider.state === "READY");
  const configuredFeeds = report.bookFeeds.filter((feed) => feed.configured).length;
  const readyFeeds = report.bookFeeds.filter((feed) => feed.state === "READY").length;
  const freshBoardAges = report.boardProviders.map((provider) => provider.freshnessMinutes).filter((value): value is number => typeof value === "number");
  const bestFreshness = freshBoardAges.length ? Math.min(...freshBoardAges) : null;
  const boardGames = report.boardProviders.reduce((sum, provider) => sum + provider.gameCount, 0);
  const blockers: string[] = [];
  const warnings = [...report.warnings];
  if (!report.selectedBoardProvider.providerKey) blockers.push("No selected live-board provider.");
  if (!boardReady && report.overallState !== "DEGRADED") blockers.push(`Live odds overall state is ${report.overallState}.`);
  if (!boardGames) blockers.push("Live odds board returned zero games.");
  if (bestFreshness == null) warnings.push("Live odds freshness timestamp is missing.");
  else if (bestFreshness > 45) blockers.push("Live odds board is older than 45 minutes.");
  else if (bestFreshness > 15) warnings.push("Live odds board is aging past 15 minutes.");
  const score = clampScore((report.overallState === "READY" ? 82 : report.overallState === "DEGRADED" ? 62 : 25) + (boardReady ? 8 : 0) + Math.min(8, boardGames) + Math.min(7, readyFeeds * 3) - (bestFreshness != null && bestFreshness > 15 ? 8 : 0));
  return {
    key: "ODDS",
    label: "Live odds readiness",
    status: statusFromScore(score, blockers),
    score,
    generatedAt: report.generatedAt,
    blockers: Array.from(new Set(blockers)),
    warnings: Array.from(new Set(warnings)),
    metrics: [
      { key: "board_provider", label: "Selected board provider", value: report.selectedBoardProvider.label ?? "none", status: report.selectedBoardProvider.providerKey ? "USABLE" : "BLOCKED" },
      { key: "board_games", label: "Board games", value: boardGames, status: metricStatus(boardGames ? 80 : 0, !boardGames) },
      { key: "best_freshness", label: "Best board freshness minutes", value: bestFreshness, status: bestFreshness == null ? "WEAK" : bestFreshness <= 5 ? "ELITE" : bestFreshness <= 15 ? "USABLE" : bestFreshness <= 45 ? "WEAK" : "BLOCKED" },
      { key: "configured_feeds", label: "Configured book feeds", value: configuredFeeds, status: metricStatus(configuredFeeds ? 70 : 35) },
      { key: "ready_feeds", label: "Ready book feeds", value: readyFeeds, status: metricStatus(readyFeeds ? 80 : 35) }
    ],
    recommendation: blockers.length ? "Live odds are not strong enough for official promotion. Use projection/watch only." : score >= 85 ? "Live odds are strong enough for official promotion gates." : "Live odds are usable but should remain under caution."
  };
}

function buildMmaLane(report: Awaited<ReturnType<typeof getUfcOperationalStatus>> | null, error: string | null): DataTowerLane {
  const generatedAt = new Date().toISOString();
  if (!report) {
    return { key: "MMA", label: "MMA data quality", status: "BLOCKED", score: 0, generatedAt, blockers: [error ?? "MMA operational status failed."], warnings: [], metrics: [], recommendation: "Do not promote MMA official plays until operational status returns successfully." };
  }
  const blockers: string[] = [];
  const warnings: string[] = [];
  const oddsProvider = report.providerReadiness.find((provider) => provider.provider === "odds-api");
  const predictionAge = ageMinutes(report.lastPredictionGeneratedAt);
  const calibrationAge = ageMinutes(report.latestCalibration?.generatedAt ?? null);
  const resolved = report.shadowResolvedCount;
  const pending = report.shadowPendingCount;
  const calibration = report.latestCalibration;
  if (!report.predictionCount) blockers.push("No MMA prediction rows found for the active model.");
  if (predictionAge == null) blockers.push("MMA prediction freshness timestamp is missing.");
  else if (predictionAge > 180) blockers.push("MMA predictions are older than 180 minutes.");
  else if (predictionAge > 60) warnings.push("MMA predictions are aging past 60 minutes.");
  if (!oddsProvider?.ready) warnings.push("MMA odds provider is not ready; projected winners can show, but official bet edge is unavailable.");
  if (!calibration) warnings.push("Latest MMA calibration snapshot is missing.");
  if (calibrationAge != null && calibrationAge > 30 * 24 * 60) warnings.push("MMA calibration snapshot is older than 30 days.");
  if (resolved < 25) warnings.push("MMA resolved sample is still under 25 fights.");
  const score = clampScore(34 + (oddsProvider?.ready ? 12 : 0) + Math.min(18, report.predictionCount) + Math.min(16, resolved) + (calibration ? 12 : 0) + (predictionAge != null && predictionAge <= 60 ? 8 : 0) - (pending > resolved * 2 ? 6 : 0));
  return {
    key: "MMA",
    label: "MMA data quality",
    status: statusFromScore(score, blockers),
    score,
    generatedAt,
    blockers: Array.from(new Set(blockers)),
    warnings: Array.from(new Set(warnings)),
    metrics: [
      { key: "odds_provider", label: "Odds provider ready", value: oddsProvider?.ready ? "yes" : "no", status: oddsProvider?.ready ? "USABLE" : "WEAK" },
      { key: "prediction_count", label: "Prediction rows", value: report.predictionCount, status: metricStatus(Math.min(100, report.predictionCount * 5), !report.predictionCount) },
      { key: "prediction_age", label: "Prediction freshness minutes", value: predictionAge, status: predictionAge == null ? "BLOCKED" : predictionAge <= 30 ? "ELITE" : predictionAge <= 60 ? "USABLE" : predictionAge <= 180 ? "WEAK" : "BLOCKED" },
      { key: "resolved", label: "Resolved shadow rows", value: resolved, status: resolved >= 50 ? "ELITE" : resolved >= 25 ? "USABLE" : resolved > 0 ? "WEAK" : "BLOCKED" },
      { key: "pending", label: "Pending shadow rows", value: pending, status: pending <= Math.max(8, resolved * 2) ? "USABLE" : "WEAK" },
      { key: "brier", label: "Latest calibration Brier", value: calibration?.brierScore ?? null, status: calibration?.brierScore == null ? "WEAK" : calibration.brierScore <= 0.21 ? "ELITE" : calibration.brierScore <= 0.25 ? "USABLE" : "WEAK" }
    ],
    recommendation: blockers.length ? "MMA should stay shadow/lean only until prediction freshness blockers clear." : score >= 85 ? "MMA data is strong enough for sport-scoped official promotion gates." : "MMA can run, but official PLAYs should require odds, sample, and CLV checks."
  };
}

export function deriveDataPromotionAllowed(lanes: DataTowerLane[]) {
  const hardBlocked = lanes.some((lane) => lane.status === "BLOCKED");
  const weakCount = lanes.filter((lane) => lane.status === "WEAK").length;
  return !hardBlocked && weakCount === 0;
}

export async function getDataControlTowerReport(options: ReportOptions = {}): Promise<DataControlTowerReport> {
  const generatedAt = new Date().toISOString();
  const scope = options.scope ?? "GLOBAL";
  const activeLaneKeys = activeKeysForScope(scope, Boolean(options.globalMode));
  const [mlbResult, oddsResult, mmaResult] = await Promise.allSettled([
    getMlbDataQualityReport({ lookbackDays: 7 }),
    getLiveOddsReadinessReport({ leagues: scope === "MMA" ? ["UFC"] : ["MLB"] }),
    getUfcOperationalStatus()
  ]);
  const lanes = [
    buildMlbLane(firstSettled(mlbResult), firstError(mlbResult)),
    buildOddsLane(firstSettled(oddsResult), firstError(oddsResult)),
    buildMmaLane(firstSettled(mmaResult), firstError(mmaResult))
  ];
  const activeLanes = lanes.filter((lane) => activeLaneKeys.includes(lane.key));
  const blockers = Array.from(new Set(activeLanes.flatMap((lane) => lane.blockers.map((item) => `${lane.key}: ${item}`))));
  const warnings = Array.from(new Set(activeLanes.flatMap((lane) => lane.warnings.map((item) => `${lane.key}: ${item}`))));
  const score = clampScore(activeLanes.reduce((sum, lane) => sum + lane.score, 0) / Math.max(1, activeLanes.length));
  const officialPromotionAllowed = deriveDataPromotionAllowed(activeLanes);
  const status = statusFromScore(score, officialPromotionAllowed ? [] : blockers.length ? blockers : activeLanes.some((lane) => lane.status === "WEAK") ? ["One or more active lanes are weak."] : []);
  const nextActions = activeLanes.flatMap((lane) => lane.status === "ELITE" ? [] : [lane.recommendation]);
  return { generatedAt, status, score, scope, officialPromotionAllowed, lanes, activeLaneKeys, blockers, warnings, nextActions: Array.from(new Set(nextActions)).slice(0, 8) };
}