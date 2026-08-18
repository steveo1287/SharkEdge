import { shouldRunHeavyWorker } from "./worker-mode";

type WorkerTask = {
  name: string;
  path: string;
  intervalSeconds: number;
  runImmediately: boolean;
};

const DEFAULT_WEB_INTERNAL_URL = "http://sharkedge-web:3000";

function intEnv(name: string, fallback: number, min: number, max: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
}

function boolEnv(name: string, fallback = false) {
  const raw = process.env[name];
  if (raw == null) return fallback;
  return !["0", "false", "no", "off"].includes(raw.trim().toLowerCase());
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

function tasks(): WorkerTask[] {
  const targetCardDate = process.env.UFC_LEDGER_TARGET_CARD_DATE?.trim() || "2026-08-15";
  return [
    {
      name: "ufc-autopilot",
      path:
        process.env.RAILWAY_UFC_AUTOPILOT_PATH?.trim() ||
        "/api/internal/cron/ufc-autopilot?autoBuildFeatures=1&hydrate=1&simulate=1&forceRegenerate=0&allowFallbackFeatures=0&includeMvp=1&includeEspn=0&includeTapology=0&includeUfcCom=0&limit=40&horizonDays=180&simulations=10000",
      intervalSeconds: intEnv("UFC_AUTOPILOT_INTERVAL_SECONDS", 21_600, 1_800, 86_400),
      runImmediately: boolEnv("UFC_AUTOPILOT_RUN_IMMEDIATELY", true)
    },
    {
      name: "ufc-pick-lock",
      path:
        process.env.RAILWAY_UFC_PICK_LOCK_PATH?.trim() ||
        "/api/internal/cron/ufc-pick-lock?windowMinutes=15&limit=40&simulations=10000",
      intervalSeconds: intEnv("UFC_PICK_LOCK_INTERVAL_SECONDS", 300, 60, 3_600),
      runImmediately: boolEnv("UFC_PICK_LOCK_RUN_IMMEDIATELY", true)
    },
    {
      name: "ufc-ledger-reconcile",
      path:
        process.env.RAILWAY_UFC_LEDGER_RECONCILE_PATH?.trim() ||
        `/api/internal/cron/ufc-ledger-reconcile?discoverCompleted=1&eventLimit=3&horizonDays=365&lockGraceMinutes=2&targetCardDate=${encodeURIComponent(targetCardDate)}`,
      intervalSeconds: intEnv("UFC_LEDGER_RECONCILE_INTERVAL_SECONDS", 900, 300, 21_600),
      runImmediately: boolEnv("UFC_LEDGER_RECONCILE_RUN_IMMEDIATELY", true)
    }
  ];
}

async function callTask(task: WorkerTask, baseUrl: string, secret: string) {
  const startedAt = Date.now();
  const url = taskUrl(baseUrl, task.path);
  try {
    const response = await fetch(url, {
      headers: secret
        ? { authorization: `Bearer ${secret}`, "x-api-key": secret, "x-cron-secret": secret }
        : {},
      cache: "no-store"
    });
    const text = await response.text();
    const sample = text.length > 1_200 ? `${text.slice(0, 1_200)}...` : text;
    console.info(`[railway-ufc-worker] ${task.name} status=${response.status} elapsedMs=${Date.now() - startedAt} body=${sample}`);
  } catch (error) {
    console.error(
      `[railway-ufc-worker] ${task.name} failed elapsedMs=${Date.now() - startedAt}`,
      error instanceof Error ? error.message : error
    );
  }
}

async function startTask(task: WorkerTask, baseUrl: string, secret: string) {
  if (task.runImmediately) await callTask(task, baseUrl, secret);
  setInterval(() => {
    void callTask(task, baseUrl, secret);
  }, task.intervalSeconds * 1_000);
}

async function main() {
  const gate = shouldRunHeavyWorker("ufc-worker");
  if (!gate.ok) {
    console.info(`[railway-ufc-worker] disabled mode=${gate.mode} reason=${gate.message}`);
    return;
  }

  const baseUrl = serviceBaseUrl();
  const secret = authSecret();
  const configuredTasks = tasks();
  console.info(
    `[railway-ufc-worker] start baseUrl=${baseUrl} tasks=${configuredTasks.map((task) => `${task.name}:${task.intervalSeconds}s`).join(",")}`
  );
  if (!secret) console.warn("[railway-ufc-worker] CRON_SECRET/INTERNAL_API_KEY is missing; protected endpoints will return 401.");

  await Promise.all(configuredTasks.map((task) => startTask(task, baseUrl, secret)));
}

main().catch((error) => {
  console.error("[railway-ufc-worker] fatal", error instanceof Error ? error.message : error);
  process.exit(1);
});
