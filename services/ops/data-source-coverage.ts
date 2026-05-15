import { getDataControlTowerReport, type DataTowerStatus } from "@/services/ops/data-control-tower";

export type SourceCoverageStatus = "LIVE" | "CONFIGURED" | "MISSING" | "STALE" | "FALLBACK" | "PAID_REQUIRED";
export type SourceCoverageSport = "MLB" | "MMA" | "ODDS";
export type SourceCoveragePriority = "critical" | "high" | "medium" | "nice";

export type DataSourceCoverageRow = {
  key: string;
  sport: SourceCoverageSport;
  category: string;
  label: string;
  status: SourceCoverageStatus;
  priority: SourceCoveragePriority;
  scoreImpact: number;
  configured: boolean;
  runtimeEvidence: string | null;
  envKeys: string[];
  nextAction: string;
};

export type DataSourceCoverageGroup = {
  sport: SourceCoverageSport;
  label: string;
  score: number;
  status: DataTowerStatus;
  criticalMissing: number;
  rows: DataSourceCoverageRow[];
};

export type DataSourceCoverageReport = {
  generatedAt: string;
  score: number;
  status: DataTowerStatus;
  eliteReady: boolean;
  criticalMissing: number;
  configuredCount: number;
  liveCount: number;
  missingCount: number;
  paidRequiredCount: number;
  staleCount: number;
  groups: DataSourceCoverageGroup[];
  blockers: string[];
  nextActions: string[];
};

type RuntimeHints = {
  mlbLane?: Awaited<ReturnType<typeof getDataControlTowerReport>>["lanes"][number];
  oddsLane?: Awaited<ReturnType<typeof getDataControlTowerReport>>["lanes"][number];
  mmaLane?: Awaited<ReturnType<typeof getDataControlTowerReport>>["lanes"][number];
};

function hasEnv(keys: string[]) {
  return keys.some((key) => Boolean(process.env[key]));
}

function envLabel(keys: string[]) {
  return keys.length ? keys.join(" / ") : "none";
}

function metricValue(lane: RuntimeHints["mlbLane"], key: string) {
  return lane?.metrics.find((metric) => metric.key === key)?.value ?? null;
}

function metricStatus(lane: RuntimeHints["mlbLane"], key: string) {
  return lane?.metrics.find((metric) => metric.key === key)?.status ?? null;
}

function pctNumber(value: string | number | null) {
  if (typeof value !== "number") return null;
  return value > 1 ? value / 100 : value;
}

function statusFromTower(status: DataTowerStatus | null | undefined): SourceCoverageStatus {
  if (status === "ELITE" || status === "USABLE") return "LIVE";
  if (status === "WEAK") return "STALE";
  if (status === "BLOCKED") return "MISSING";
  return "MISSING";
}

function coverageStatus(value: string | number | null, towerStatus: DataTowerStatus | null | undefined, fallbackStatus: SourceCoverageStatus = "MISSING") {
  const pct = pctNumber(value);
  if (pct == null) return statusFromTower(towerStatus) === "LIVE" ? "CONFIGURED" : fallbackStatus;
  if (pct >= 0.8) return "LIVE";
  if (pct >= 0.45) return "FALLBACK";
  if (pct > 0) return "STALE";
  return fallbackStatus;
}

function row(args: Omit<DataSourceCoverageRow, "configured">): DataSourceCoverageRow {
  return {
    ...args,
    configured: args.status === "LIVE" || args.status === "CONFIGURED" || args.status === "STALE" || args.status === "FALLBACK"
  };
}

function runtimeEvidence(label: string, value: string | number | null) {
  return value == null ? null : `${label}: ${value}`;
}

function buildMlbRows(hints: RuntimeHints): DataSourceCoverageRow[] {
  const mlb = hints.mlbLane;
  const odds = hints.oddsLane;
  const teamCoverage = metricValue(mlb, "team_boxscores");
  const marketCoverage = metricValue(mlb, "markets");
  const officialCoverage = metricValue(mlb, "official_results");
  const closingCoverage = metricValue(mlb, "closing_lines");
  const marketAge = metricValue(mlb, "market_age");
  const teamStatAge = metricValue(mlb, "team_stat_age");

  return [
    row({
      key: "mlb-live-odds",
      sport: "MLB",
      category: "market",
      label: "Live moneyline/totals odds",
      status: statusFromTower(metricStatus(odds, "board_games") ?? odds?.status),
      priority: "critical",
      scoreImpact: 16,
      runtimeEvidence: runtimeEvidence("Board games", metricValue(odds, "board_games")),
      envKeys: ["ODDS_API_KEY", "THE_ODDS_API_KEY"],
      nextAction: "Keep live odds provider healthy; official plays should not exist without current market lines."
    }),
    row({
      key: "mlb-closing-lines",
      sport: "MLB",
      category: "market",
      label: "Closing-line archive",
      status: coverageStatus(closingCoverage, metricStatus(mlb, "closing_lines"), "MISSING"),
      priority: "critical",
      scoreImpact: 14,
      runtimeEvidence: runtimeEvidence("Coverage", closingCoverage),
      envKeys: ["MLB_CLOSING_LINES_URL", "ODDS_HISTORY_URL"],
      nextAction: "Store closing odds per market so CLV and official-play ROI can be trusted."
    }),
    row({
      key: "mlb-official-results",
      sport: "MLB",
      category: "settlement",
      label: "Official game results",
      status: coverageStatus(officialCoverage, metricStatus(mlb, "official_results"), "MISSING"),
      priority: "critical",
      scoreImpact: 14,
      runtimeEvidence: runtimeEvidence("Coverage", officialCoverage),
      envKeys: ["MLB_RESULTS_URL", "MLB_SCHEDULE_URL"],
      nextAction: "Use official MLB result settlement for win/loss, totals, and ledger truth."
    }),
    row({
      key: "mlb-team-boxscores",
      sport: "MLB",
      category: "team form",
      label: "Team boxscores / recent form",
      status: coverageStatus(teamCoverage, metricStatus(mlb, "team_boxscores"), "MISSING"),
      priority: "high",
      scoreImpact: 10,
      runtimeEvidence: runtimeEvidence("Coverage", teamCoverage),
      envKeys: ["MLB_TEAM_ANALYTICS_URL"],
      nextAction: "Wire the team analytics feed for recent scoring, allowed runs, bullpen state, and form."
    }),
    row({
      key: "mlb-statcast-splits",
      sport: "MLB",
      category: "player quality",
      label: "Statcast pitcher/batter splits",
      status: hasEnv(["MLB_STATCAST_SPLITS_URL"]) ? "CONFIGURED" : "MISSING",
      priority: "high",
      scoreImpact: 10,
      runtimeEvidence: null,
      envKeys: ["MLB_STATCAST_SPLITS_URL"],
      nextAction: "Wire Statcast splits for pitcher quality, handedness splits, xwOBA, K%, BB%, barrel%, and hard-hit profile."
    }),
    row({
      key: "mlb-fangraphs-player-feed",
      sport: "MLB",
      category: "player quality",
      label: "FanGraphs player analytics",
      status: hasEnv(["FANGRAPHS_PLAYER_FEED_URL"]) ? "CONFIGURED" : "MISSING",
      priority: "high",
      scoreImpact: 9,
      runtimeEvidence: null,
      envKeys: ["FANGRAPHS_PLAYER_FEED_URL"],
      nextAction: "Wire FanGraphs-style player form for starters, relievers, batter projections, and matchup context."
    }),
    row({
      key: "mlb-probable-starters",
      sport: "MLB",
      category: "game context",
      label: "Probable / confirmed starters",
      status: hasEnv(["MLB_PROBABLE_STARTERS_URL", "MLB_STARTERS_URL"]) ? "CONFIGURED" : "MISSING",
      priority: "critical",
      scoreImpact: 12,
      runtimeEvidence: null,
      envKeys: ["MLB_PROBABLE_STARTERS_URL", "MLB_STARTERS_URL"],
      nextAction: "Promotions should require confirmed or high-confidence probable starters."
    }),
    row({
      key: "mlb-confirmed-lineups",
      sport: "MLB",
      category: "game context",
      label: "Confirmed batting lineups",
      status: hasEnv(["MLB_CONFIRMED_LINEUPS_URL", "MLB_LINEUPS_URL"]) ? "CONFIGURED" : "MISSING",
      priority: "high",
      scoreImpact: 9,
      runtimeEvidence: null,
      envKeys: ["MLB_CONFIRMED_LINEUPS_URL", "MLB_LINEUPS_URL"],
      nextAction: "Late lineup scratches and rest days should downgrade official PLAYs."
    }),
    row({
      key: "mlb-bullpen-fatigue",
      sport: "MLB",
      category: "game context",
      label: "Bullpen fatigue / availability",
      status: hasEnv(["MLB_BULLPEN_FATIGUE_URL", "MLB_TEAM_ANALYTICS_URL"]) ? "CONFIGURED" : "MISSING",
      priority: "high",
      scoreImpact: 8,
      runtimeEvidence: runtimeEvidence("Team stat age min", teamStatAge),
      envKeys: ["MLB_BULLPEN_FATIGUE_URL", "MLB_TEAM_ANALYTICS_URL"],
      nextAction: "Track bullpen usage over the last 3 games and closer/high-leverage availability."
    }),
    row({
      key: "mlb-weather",
      sport: "MLB",
      category: "environment",
      label: "Weather / wind / temp / precipitation",
      status: hasEnv(["MLB_WEATHER_URL", "WEATHER_API_KEY", "OPENWEATHER_API_KEY", "VISUAL_CROSSING_API_KEY"]) ? "CONFIGURED" : "MISSING",
      priority: "high",
      scoreImpact: 8,
      runtimeEvidence: null,
      envKeys: ["MLB_WEATHER_URL", "WEATHER_API_KEY", "OPENWEATHER_API_KEY", "VISUAL_CROSSING_API_KEY"],
      nextAction: "Use ballpark-specific wind direction/speed, temp, roof status, and precipitation for totals."
    }),
    row({
      key: "mlb-park-factors",
      sport: "MLB",
      category: "environment",
      label: "Park factors / roof effects",
      status: hasEnv(["MLB_PARK_FACTORS_URL"]) ? "CONFIGURED" : "MISSING",
      priority: "medium",
      scoreImpact: 6,
      runtimeEvidence: null,
      envKeys: ["MLB_PARK_FACTORS_URL"],
      nextAction: "Add ballpark run/HR factors and roof-state adjustments for totals and HR-prone matchups."
    }),
    row({
      key: "mlb-market-freshness",
      sport: "MLB",
      category: "freshness",
      label: "Market freshness monitor",
      status: typeof marketAge === "number" ? Number(marketAge) <= 45 ? "LIVE" : Number(marketAge) <= 120 ? "STALE" : "MISSING" : "MISSING",
      priority: "critical",
      scoreImpact: 12,
      runtimeEvidence: runtimeEvidence("Market age minutes", marketAge),
      envKeys: [],
      nextAction: "Official plays should downgrade when odds age exceeds freshness thresholds."
    })
  ];
}

function buildOddsRows(hints: RuntimeHints): DataSourceCoverageRow[] {
  const odds = hints.oddsLane;
  const configuredFeeds = metricValue(odds, "configured_feeds");
  const readyFeeds = metricValue(odds, "ready_feeds");
  const bestFreshness = metricValue(odds, "best_freshness");

  return [
    row({
      key: "odds-primary-board",
      sport: "ODDS",
      category: "market",
      label: "Primary odds board provider",
      status: statusFromTower(metricStatus(odds, "board_games") ?? odds?.status),
      priority: "critical",
      scoreImpact: 16,
      runtimeEvidence: runtimeEvidence("Selected provider", metricValue(odds, "board_provider")),
      envKeys: ["ODDS_API_KEY", "THE_ODDS_API_KEY"],
      nextAction: "Keep the primary board provider live and under the freshness threshold."
    }),
    row({
      key: "odds-book-feeds",
      sport: "ODDS",
      category: "market",
      label: "Book-level odds feeds",
      status: typeof readyFeeds === "number" && readyFeeds > 0 ? "LIVE" : typeof configuredFeeds === "number" && configuredFeeds > 0 ? "CONFIGURED" : "MISSING",
      priority: "high",
      scoreImpact: 10,
      runtimeEvidence: `Configured: ${configuredFeeds ?? "—"}; Ready: ${readyFeeds ?? "—"}`,
      envKeys: ["DRAFTKINGS_ODDS_URL", "FANDUEL_ODDS_URL", "BETMGM_ODDS_URL", "CAESARS_ODDS_URL"],
      nextAction: "Multiple books improve consensus quality and reduce bad single-book edges."
    }),
    row({
      key: "odds-freshness",
      sport: "ODDS",
      category: "freshness",
      label: "Odds freshness SLA",
      status: typeof bestFreshness === "number" ? Number(bestFreshness) <= 15 ? "LIVE" : Number(bestFreshness) <= 45 ? "STALE" : "MISSING" : "MISSING",
      priority: "critical",
      scoreImpact: 12,
      runtimeEvidence: runtimeEvidence("Best freshness minutes", bestFreshness),
      envKeys: [],
      nextAction: "Official plays should require fresh odds, not stale cached market lines."
    }),
    row({
      key: "odds-history",
      sport: "ODDS",
      category: "market",
      label: "Historical odds / movement",
      status: hasEnv(["ODDS_HISTORY_URL", "ODDS_HISTORY_API_KEY"]) ? "CONFIGURED" : "PAID_REQUIRED",
      priority: "high",
      scoreImpact: 9,
      runtimeEvidence: null,
      envKeys: ["ODDS_HISTORY_URL", "ODDS_HISTORY_API_KEY"],
      nextAction: "Historical odds unlock open-to-close movement, CLV, and stronger edge validation."
    })
  ];
}

function buildMmaRows(hints: RuntimeHints): DataSourceCoverageRow[] {
  const mma = hints.mmaLane;
  const predictionCount = metricValue(mma, "prediction_count");
  const predictionAge = metricValue(mma, "prediction_age");
  const resolved = metricValue(mma, "resolved");
  const brier = metricValue(mma, "brier");

  return [
    row({
      key: "mma-odds",
      sport: "MMA",
      category: "market",
      label: "UFC winner odds",
      status: statusFromTower(metricStatus(mma, "odds_provider") ?? mma?.status),
      priority: "critical",
      scoreImpact: 16,
      runtimeEvidence: runtimeEvidence("Odds provider", metricValue(mma, "odds_provider")),
      envKeys: ["ODDS_API_KEY", "THE_ODDS_API_KEY"],
      nextAction: "Winner market odds are required before MMA can produce official PLAYs."
    }),
    row({
      key: "mma-closing-lines",
      sport: "MMA",
      category: "market",
      label: "UFC closing-line archive",
      status: hasEnv(["MMA_CLOSING_LINES_URL", "UFC_CLOSING_LINES_URL", "ODDS_HISTORY_URL"]) ? "CONFIGURED" : "PAID_REQUIRED",
      priority: "critical",
      scoreImpact: 14,
      runtimeEvidence: null,
      envKeys: ["MMA_CLOSING_LINES_URL", "UFC_CLOSING_LINES_URL", "ODDS_HISTORY_URL"],
      nextAction: "Store open and closing odds per fighter to measure CLV and market quality."
    }),
    row({
      key: "mma-fighter-profiles",
      sport: "MMA",
      category: "fighter stats",
      label: "Fighter profile / biographical stats",
      status: hasEnv(["MMA_FIGHTER_PROFILE_URL", "UFC_FIGHTER_PROFILE_URL"]) ? "CONFIGURED" : "MISSING",
      priority: "high",
      scoreImpact: 10,
      runtimeEvidence: null,
      envKeys: ["MMA_FIGHTER_PROFILE_URL", "UFC_FIGHTER_PROFILE_URL"],
      nextAction: "Profiles should include age, reach, stance, height, camp, weight class, and layoff."
    }),
    row({
      key: "mma-fight-history",
      sport: "MMA",
      category: "fighter stats",
      label: "Fight history / opponent strength",
      status: hasEnv(["MMA_FIGHT_HISTORY_URL", "UFC_FIGHT_HISTORY_URL"]) ? "CONFIGURED" : "MISSING",
      priority: "high",
      scoreImpact: 10,
      runtimeEvidence: null,
      envKeys: ["MMA_FIGHT_HISTORY_URL", "UFC_FIGHT_HISTORY_URL"],
      nextAction: "Track opponent quality, recent form, layoffs, finishes, and decision profile."
    }),
    row({
      key: "mma-striking-grappling",
      sport: "MMA",
      category: "fighter stats",
      label: "Striking / grappling metrics",
      status: hasEnv(["MMA_ADVANCED_STATS_URL", "UFC_STATS_URL"]) ? "CONFIGURED" : "MISSING",
      priority: "high",
      scoreImpact: 11,
      runtimeEvidence: null,
      envKeys: ["MMA_ADVANCED_STATS_URL", "UFC_STATS_URL"],
      nextAction: "Wire SLpM, SApM, sig strike accuracy, TD average, TD defense, submission rate, and control time."
    }),
    row({
      key: "mma-event-card",
      sport: "MMA",
      category: "event context",
      label: "Event card / bout order / cancellations",
      status: hasEnv(["MMA_EVENT_CARD_URL", "UFC_EVENT_CARD_URL"]) ? "CONFIGURED" : "MISSING",
      priority: "critical",
      scoreImpact: 11,
      runtimeEvidence: runtimeEvidence("Prediction rows", predictionCount),
      envKeys: ["MMA_EVENT_CARD_URL", "UFC_EVENT_CARD_URL"],
      nextAction: "Fight cards must update cancellations, replacements, catchweights, and bout order."
    }),
    row({
      key: "mma-weigh-ins",
      sport: "MMA",
      category: "event context",
      label: "Weigh-ins / short-notice flags",
      status: hasEnv(["MMA_WEIGH_INS_URL", "UFC_WEIGH_INS_URL"]) ? "CONFIGURED" : "MISSING",
      priority: "medium",
      scoreImpact: 7,
      runtimeEvidence: null,
      envKeys: ["MMA_WEIGH_INS_URL", "UFC_WEIGH_INS_URL"],
      nextAction: "Missed weight, short-notice replacements, and bad cuts should downgrade confidence."
    }),
    row({
      key: "mma-results",
      sport: "MMA",
      category: "settlement",
      label: "Official fight result settlement",
      status: typeof resolved === "number" && resolved >= 25 ? "LIVE" : typeof resolved === "number" && resolved > 0 ? "FALLBACK" : "MISSING",
      priority: "critical",
      scoreImpact: 14,
      runtimeEvidence: runtimeEvidence("Resolved rows", resolved),
      envKeys: ["MMA_RESULTS_URL", "UFC_RESULTS_URL"],
      nextAction: "Settle winner, method, round, and no-contest states for proof and calibration."
    }),
    row({
      key: "mma-calibration",
      sport: "MMA",
      category: "proof",
      label: "MMA calibration sample",
      status: typeof brier === "number" ? "LIVE" : "MISSING",
      priority: "high",
      scoreImpact: 8,
      runtimeEvidence: runtimeEvidence("Latest Brier", brier),
      envKeys: [],
      nextAction: "Keep resolved sample and calibration snapshots current before promoting MMA official plays."
    }),
    row({
      key: "mma-prediction-freshness",
      sport: "MMA",
      category: "freshness",
      label: "Prediction freshness SLA",
      status: typeof predictionAge === "number" ? Number(predictionAge) <= 60 ? "LIVE" : Number(predictionAge) <= 180 ? "STALE" : "MISSING" : "MISSING",
      priority: "critical",
      scoreImpact: 10,
      runtimeEvidence: runtimeEvidence("Prediction age minutes", predictionAge),
      envKeys: [],
      nextAction: "Fight predictions should refresh after odds, card, weigh-in, or fighter-status changes."
    })
  ];
}

function scoreStatus(status: SourceCoverageStatus) {
  if (status === "LIVE") return 1;
  if (status === "CONFIGURED") return 0.75;
  if (status === "FALLBACK") return 0.45;
  if (status === "STALE") return 0.35;
  if (status === "PAID_REQUIRED") return 0.2;
  return 0;
}

function statusFromScore(score: number, criticalMissing: number): DataTowerStatus {
  if (criticalMissing > 0) return "BLOCKED";
  if (score >= 85) return "ELITE";
  if (score >= 70) return "USABLE";
  if (score >= 45) return "WEAK";
  return "BLOCKED";
}

function buildGroup(sport: SourceCoverageSport, label: string, rows: DataSourceCoverageRow[]): DataSourceCoverageGroup {
  const possible = rows.reduce((sum, source) => sum + source.scoreImpact, 0);
  const actual = rows.reduce((sum, source) => sum + source.scoreImpact * scoreStatus(source.status), 0);
  const criticalMissing = rows.filter((source) => source.priority === "critical" && (source.status === "MISSING" || source.status === "PAID_REQUIRED" || source.status === "STALE")).length;
  const score = Math.round((actual / Math.max(1, possible)) * 100);
  return {
    sport,
    label,
    score,
    status: statusFromScore(score, criticalMissing),
    criticalMissing,
    rows
  };
}

export async function getDataSourceCoverageReport(): Promise<DataSourceCoverageReport> {
  const tower = await getDataControlTowerReport();
  const hints: RuntimeHints = {
    mlbLane: tower.lanes.find((lane) => lane.key === "MLB"),
    oddsLane: tower.lanes.find((lane) => lane.key === "ODDS"),
    mmaLane: tower.lanes.find((lane) => lane.key === "MMA")
  };

  const groups = [
    buildGroup("MLB", "MLB stats pipeline", buildMlbRows(hints)),
    buildGroup("ODDS", "Odds and market pipeline", buildOddsRows(hints)),
    buildGroup("MMA", "MMA stats pipeline", buildMmaRows(hints))
  ];
  const rows = groups.flatMap((group) => group.rows);
  const possible = groups.reduce((sum, group) => sum + group.rows.reduce((inner, source) => inner + source.scoreImpact, 0), 0);
  const actual = rows.reduce((sum, source) => sum + source.scoreImpact * scoreStatus(source.status), 0);
  const criticalMissing = rows.filter((source) => source.priority === "critical" && (source.status === "MISSING" || source.status === "PAID_REQUIRED" || source.status === "STALE")).length;
  const score = Math.round((actual / Math.max(1, possible)) * 100);
  const status = statusFromScore(score, criticalMissing);
  const blockers = rows
    .filter((source) => source.priority === "critical" && (source.status === "MISSING" || source.status === "PAID_REQUIRED" || source.status === "STALE"))
    .map((source) => `${source.sport}: ${source.label} is ${source.status}`);
  const nextActions = rows
    .filter((source) => source.status !== "LIVE")
    .sort((a, b) => b.scoreImpact - a.scoreImpact)
    .map((source) => `${source.sport}: ${source.nextAction} (${envLabel(source.envKeys)})`)
    .slice(0, 12);

  return {
    generatedAt: new Date().toISOString(),
    score,
    status,
    eliteReady: status === "ELITE" || status === "USABLE",
    criticalMissing,
    configuredCount: rows.filter((source) => source.configured).length,
    liveCount: rows.filter((source) => source.status === "LIVE").length,
    missingCount: rows.filter((source) => source.status === "MISSING").length,
    paidRequiredCount: rows.filter((source) => source.status === "PAID_REQUIRED").length,
    staleCount: rows.filter((source) => source.status === "STALE").length,
    groups,
    blockers,
    nextActions
  };
}
