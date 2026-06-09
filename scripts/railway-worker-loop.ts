type WorkerTask = {
  name: string;
  path: string;
  intervalSeconds: number;
  runImmediately: boolean;
  activeUtcHours?: Set<number>;
};

export {};

const DEFAULT_WEB_INTERNAL_URL = "http://sharkedge-web:3000";
// MLB useful refresh window: roughly 10am-1am US Central during normal game days.
// This avoids burning calls overnight while still covering morning board build, line moves,
// lineups, games, and post-game settlement windows.
const DEFAULT_MLB_ACTIVE_UTC_HOURS = new Set([0, 1, 2, 3, 4, 5, 6, 15, 16, 17, 18, 19, 20, 21, 22, 23]);

function intEnv(name: string, fallback: number, min: number, max: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
}

function boolEnv(name: string, fallback = false) {
  const raw = process.env[name];
  if (raw == null) return fallback;
  return !["0", "false", "no", "off"].includes(raw.trim().toLowerCase());
}

function csvSetEnv(name: string) {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  return new Set(
    raw
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((value) => Number.isInteger(value) && value >= 0 && value <= 23)
  );
}

function mlbActiveUtcHours(name: string) {
  return csvSetEnv(name) ?? DEFAULT_MLB_ACTIVE_UTC_HOURS;
}

function serviceBaseUrl() {
  return (
    process.env.RAILWAY_WEB_INTERNAL_URL?.trim() ||
    process.env.SHARKEDGE_INTERNAL_URL?.trim() ||
    process.env.SHARKEDGE_BACKEND_URL?.trim() ||
    DEFAULT_WEB_INTERNAL_URL
  ).replace(/\/+$/, "");
}

function authSecret() {
  return process.env.CRON_SECRET?.trim() || process.env.INTERNAL_API_KEY?.trim() || process.env.INTERNAL_API_KEY2?.trim() || "";
}

function taskUrl(baseUrl: string, path: string) {
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function shouldRun(task: WorkerTask, date = new Date()) {
  if (!task.activeUtcHours?.size) return true;
  return task.activeUtcHours.has(date.getUTCHours());
}

function simTasks(): WorkerTask[] {
  const mlbLookbackDays = intEnv("MLB_SIM_PREFLIGHT_LOOKBACK_DAYS", 45, 7, 365);
  const mlbLimit = intEnv("MLB_SIM_PREFLIGHT_LIMIT", 1500, 100, 5000);
  const statsGuardMinutes = intEnv("MLB_STATS_PIPELINE_GUARD_MINUTES", 360, 60, 1440);
  const simActiveHours = mlbActiveUtcHours("SIM_REFRESH_ACTIVE_UTC_HOURS");
  const marketActiveHours = mlbActiveUtcHours("SIM_MARKET_REFRESH_ACTIVE_UTC_HOURS");

  return [
    {
      name: "mlb-stats-ingest",
      path:
        process.env.RAILWAY_MLB_STATS_INGEST_PATH?.trim() ||
        `/api/internal/cron/stats-ingest?includeNba=0&lookbackDays=${intEnv("MLB_STATS_LOOKBACK_DAYS", 3, 1, 14)}&advancedLookbackDays=${intEnv("MLB_ADVANCED_STATS_LOOKBACK_DAYS", 7, 1, 14)}`,
      // Heavy-ish warehouse pull. Twice daily by default; override if needed.
      intervalSeconds: intEnv("MLB_STATS_INGEST_INTERVAL_SECONDS", 43200, 3600, 86400),
      runImmediately: boolEnv("MLB_STATS_INGEST_RUN_IMMEDIATELY", false),
      activeUtcHours: csvSetEnv("MLB_STATS_INGEST_ACTIVE_UTC_HOURS") ?? new Set([11, 23])
    },
    {
      name: "mlb-populate-feed",
      path:
        process.env.RAILWAY_MLB_POPULATE_FEED_PATH?.trim() ||
        `/api/internal/cron/mlb-populate-feed?season=${intEnv("MLB_ROSTER_RATING_SEASON", new Date().getUTCFullYear(), 2020, 2035)}&rosterType=${process.env.MLB_ROSTER_RATING_TYPE?.trim() || "active"}&includeStatsApiStats=1&includeStatcastMicro=${boolEnv("MLB_POPULATE_STATCAST_MICRO", false) ? 1 : 0}`,
      // Daily active-roster/player rating refresh. This is DB-backed and intentionally
      // decoupled from page renders so game centers read real persisted intelligence.
      intervalSeconds: intEnv("MLB_POPULATE_FEED_INTERVAL_SECONDS", 21600, 3600, 86400),
      runImmediately: boolEnv("MLB_POPULATE_FEED_RUN_IMMEDIATELY", true),
      activeUtcHours: mlbActiveUtcHours("MLB_POPULATE_FEED_ACTIVE_UTC_HOURS")
    },
    {
      name: "mlb-player-prop-inning-grade",
      path:
        process.env.RAILWAY_MLB_PLAYER_PROP_GRADE_PATH?.trim() ||
        `/api/internal/cron/mlb-player-prop-inning-grade?limit=${intEnv("MLB_PLAYER_PROP_GRADE_LIMIT", 2000, 1, 5000)}`,
      // Not needed every hour for sim readiness. Keep it warm every 3 hours in active windows.
      intervalSeconds: intEnv("MLB_PLAYER_PROP_GRADE_INTERVAL_SECONDS", 10800, 1800, 86400),
      runImmediately: boolEnv("MLB_PLAYER_PROP_GRADE_RUN_IMMEDIATELY", false),
      activeUtcHours: mlbActiveUtcHours("MLB_PLAYER_PROP_GRADE_ACTIVE_UTC_HOURS")
    },
    {
      name: "mlb-player-market-calibration",
      path:
        process.env.RAILWAY_MLB_PLAYER_MARKET_CALIBRATION_PATH?.trim() ||
        `/api/internal/cron/mlb-player-market-calibration?limit=${intEnv("MLB_PLAYER_MARKET_CALIBRATION_LIMIT", 25000, 100, 100000)}`,
      // Daily calibration is enough unless actively backfilling.
      intervalSeconds: intEnv("MLB_PLAYER_MARKET_CALIBRATION_INTERVAL_SECONDS", 86400, 21600, 604800),
      runImmediately: boolEnv("MLB_PLAYER_MARKET_CALIBRATION_RUN_IMMEDIATELY", false),
      activeUtcHours: csvSetEnv("MLB_PLAYER_MARKET_CALIBRATION_ACTIVE_UTC_HOURS") ?? new Set([9])
    },
    {
      name: "sim-refresh",
      path:
        process.env.RAILWAY_SIM_REFRESH_PATH?.trim() ||
        `/api/cron/sim-refresh?statsPreflight=1&runMlb=1&runUfc=0&includeLineups=1&statsGuardMinutes=${statsGuardMinutes}&mlbLookbackDays=${mlbLookbackDays}&mlbLimit=${mlbLimit}`,
      // Main board/projection refresh. Every 30 minutes inside MLB active hours.
      // The stats preflight has its own 6-hour guard, so this does not rebuild player ratings every run.
      intervalSeconds: intEnv("SIM_REFRESH_INTERVAL_SECONDS", 1800, 900, 21600),
      runImmediately: boolEnv("SIM_REFRESH_RUN_IMMEDIATELY", true),
      activeUtcHours: simActiveHours
    },
    {
      name: "sim-market-refresh",
      path: process.env.RAILWAY_SIM_MARKET_REFRESH_PATH?.trim() || "/api/cron/sim-market-refresh",
      // Market context/line overlay. Every 15 minutes inside MLB active hours.
      intervalSeconds: intEnv("SIM_MARKET_REFRESH_INTERVAL_SECONDS", 900, 300, 7200),
      runImmediately: boolEnv("SIM_MARKET_RUN_IMMEDIATELY", true),
      activeUtcHours: marketActiveHours
    }
  ];
}

function mlbOddsTasks(): WorkerTask[] {
  return [
    {
      name: "mlb-odds-api-io",
      path:
        process.env.RAILWAY_MLB_ODDS_PATH?.trim() ||
        `/api/cron/odds-api-io/mlb?eventLimit=${intEnv("ODDS_API_IO_EVENT_LIMIT", 20, 1, 40)}`,
      // Raw odds/provider pull. Every 15 minutes during MLB active hours.
      intervalSeconds: intEnv("MLB_ODDS_REFRESH_INTERVAL_SECONDS", 900, 300, 21600),
      runImmediately: boolEnv("MLB_ODDS_RUN_IMMEDIATELY", true),
      activeUtcHours: mlbActiveUtcHours("MLB_ODDS_ACTIVE_UTC_HOURS")
    }
  ];
}

function ufcTasks(): WorkerTask[] {
  return [
    {
      name: "ufc-autopilot",
      path:
        process.env.RAILWAY_UFC_AUTOPILOT_PATH?.trim() ||
        "/api/internal/cron/ufc-autopilot?autoBuildFeatures=1&hydrate=1&simulate=1&allowFallbackFeatures=0&includeMvp=1&includeEspn=0&includeTapology=0&includeUfcCom=0&limit=40&horizonDays=180&simulations=10000",
      intervalSeconds: intEnv("UFC_AUTOPILOT_INTERVAL_SECONDS", 21600, 1800, 86400),
      runImmediately: boolEnv("UFC_AUTOPILOT_RUN_IMMEDIATELY", true)
    }
  ];
}

function maintenanceTasks(): WorkerTask[] {
  return [
    {
      name: "db-space-repair",
      path: process.env.RAILWAY_DB_SPACE_REPAIR_PATH?.trim() || "/api/internal/cron/db-space-repair",
      intervalSeconds: intEnv("DB_SPACE_REPAIR_INTERVAL_SECONDS", 86400, 3600, 604800),
      runImmediately: boolEnv("DB_SPACE_REPAIR_RUN_IMMEDIATELY", false)
    },
    {
      name: "settle-sim-predictions",
      path: process.env.RAILWAY_SETTLE_SIM_PATH?.trim() || "/api/internal/cron/settle-sim-predictions",
      intervalSeconds: intEnv("SETTLE_SIM_INTERVAL_SECONDS", 3600, 600, 86400),
      runImmediately: boolEnv("SETTLE_SIM_RUN_IMMEDIATELY", false)
    }
  ];
}

function tasksForKind(kind: string): WorkerTask[] {
  if (kind === "sim-worker") return simTasks();
  if (kind === "mlb-odds-worker") return mlbOddsTasks();
  if (kind === "ufc-worker") return ufcTasks();
  if (kind === "maintenance-worker") return maintenanceTasks();
  if (kind === "all") return [...simTasks(), ...mlbOddsTasks(), ...ufcTasks(), ...maintenanceTasks()];
  throw new Error(`Unknown Railway worker kind '${kind}'. Use sim-worker, mlb-odds-worker, ufc-worker, maintenance-worker, or all.`);
}

async function callTask(task: WorkerTask, baseUrl: string, secret: string) {
  if (!shouldRun(task)) {
    console.info(`[railway-worker] skip ${task.name}: outside active UTC hours`);
    return;
  }

  const startedAt = Date.now();
  const url = taskUrl(baseUrl, task.path);
  try {
    const response = await fetch(url, {
      headers: secret ? { authorization: `Bearer ${secret}`, "x-api-key": secret, "x-cron-secret": secret } : {},
      cache: "no-store"
    });
    const text = await response.text();
    const sample = text.length > 700 ? `${text.slice(0, 700)}...` : text;
    console.info(`[railway-worker] ${task.name} status=${response.status} elapsedMs=${Date.now() - startedAt} body=${sample}`);
  } catch (error) {
    console.error(`[railway-worker] ${task.name} failed elapsedMs=${Date.now() - startedAt}`, error instanceof Error ? error.message : error);
  }
}

async function runTaskLoop(task: WorkerTask, baseUrl: string, secret: string) {
  if (task.runImmediately) await callTask(task, baseUrl, secret);
  setInterval(() => {
    void callTask(task, baseUrl, secret);
  }, task.intervalSeconds * 1000);
}

async function main() {
  const kind = process.env.RAILWAY_WORKER_KIND?.trim() || process.argv[2]?.trim() || process.env.SHARKEDGE_SERVICE_MODE?.trim() || "sim-worker";
  const baseUrl = serviceBaseUrl();
  const secret = authSecret();
  const tasks = tasksForKind(kind);

  console.info(`[railway-worker] start kind=${kind} baseUrl=${baseUrl} tasks=${tasks.map((task) => `${task.name}:${task.intervalSeconds}s`).join(",")}`);
  if (!secret) console.warn("[railway-worker] CRON_SECRET/INTERNAL_API_KEY is missing; protected endpoints will return 401.");

  await Promise.all(tasks.map((task) => runTaskLoop(task, baseUrl, secret)));
}

main().catch((error) => {
  console.error("[railway-worker] fatal", error instanceof Error ? error.message : error);
  process.exit(1);
});
