import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

type WorkerSpec = {
  name: string;
  command: string;
  args: string[];
  intervalMinutes: number;
  runImmediately: boolean;
  enabled: boolean;
  activeUtcHours?: number[];
};

type RunningTask = {
  lastStartedAt: number | null;
  running: boolean;
};

function truthy(value: string | undefined | null) {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function intEnv(name: string, fallback: number, min: number, max: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
}

function csvHours(value: string | undefined) {
  if (!value) return null;
  const hours = value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23);
  return hours.length ? hours : null;
}

function shouldRunNow(spec: WorkerSpec) {
  if (!spec.activeUtcHours || !spec.activeUtcHours.length) return true;
  return spec.activeUtcHours.includes(new Date().getUTCHours());
}

function envArgs(args: Record<string, string | number | boolean | undefined>) {
  return Object.entries(args)
    .filter(([, value]) => value !== undefined && value !== null && `${value}`.length > 0)
    .flatMap(([key, value]) => [`--${key}`, `${value}`]);
}

function buildWorkerSpecs(): WorkerSpec[] {
  const repoRoot = process.cwd();
  const baseNodeArgs = ["run"];
  return [
    {
      name: "sim-worker",
      command: "npm",
      args: [...baseNodeArgs, "worker:sim:local"],
      intervalMinutes: intEnv("LOCAL_SIM_WORKER_INTERVAL_MINUTES", 15, 5, 180),
      runImmediately: true,
      enabled: true,
      activeUtcHours: csvHours(process.env.SIM_REFRESH_ACTIVE_UTC_HOURS)
    },
    {
      name: "mlb-odds-worker",
      command: "npm",
      args: [...baseNodeArgs, "worker:mlb-odds:local"],
      intervalMinutes: intEnv("LOCAL_MLB_ODDS_WORKER_INTERVAL_MINUTES", 15, 5, 180),
      runImmediately: true,
      enabled: true,
      activeUtcHours: csvHours(process.env.MLB_ODDS_ACTIVE_UTC_HOURS)
    },
    {
      name: "ufc-worker",
      command: "npm",
      args: [...baseNodeArgs, "worker:ufc:local"],
      intervalMinutes: intEnv("LOCAL_UFC_WORKER_INTERVAL_MINUTES", 60, 15, 360),
      runImmediately: true,
      enabled: truthy(process.env.LOCAL_ENABLE_UFC_WORKER ?? "true")
    },
    {
      name: "maintenance-worker",
      command: "npm",
      args: [...baseNodeArgs, "worker:maintenance:local"],
      intervalMinutes: intEnv("LOCAL_MAINTENANCE_WORKER_INTERVAL_MINUTES", 24 * 60, 60, 7 * 24 * 60),
      runImmediately: true,
      enabled: truthy(process.env.LOCAL_ENABLE_MAINTENANCE_WORKER ?? "true")
    }
  ];
}

function runChild(spec: WorkerSpec) {
  const cwd = process.cwd();
  const child = spawn(spec.command, spec.args, {
    cwd,
    env: {
      ...process.env,
      SHARKEDGE_WORKER_MODE: "local",
      SHARKEDGE_DISABLE_WORKERS: "false",
      ALLOW_RAILWAY_HEAVY_WORKER: "false"
    },
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  return new Promise<void>((resolve) => {
    child.on("exit", (code) => {
      console.info(`[local-workers] ${spec.name} exited code=${code ?? "null"}`);
      resolve();
    });
  });
}

async function runLoop(spec: WorkerSpec, state: RunningTask) {
  if (!spec.enabled) {
    console.info(`[local-workers] ${spec.name} disabled`);
    return;
  }

  const intervalMs = spec.intervalMinutes * 60_000;
  const runCycle = async () => {
    if (!shouldRunNow(spec)) {
      console.info(`[local-workers] ${spec.name} skipped outside active UTC hours`);
      return;
    }
    if (state.running) return;
    state.running = true;
    state.lastStartedAt = Date.now();
    console.info(`[local-workers] ${spec.name} start`);
    try {
      await runChild(spec);
    } catch (error) {
      console.error(`[local-workers] ${spec.name} failed`, error instanceof Error ? error.message : error);
    } finally {
      state.running = false;
      console.info(`[local-workers] ${spec.name} done`);
    }
  };

  if (spec.runImmediately) {
    await runCycle();
  }

  setInterval(() => {
    void runCycle();
  }, intervalMs);
}

async function main() {
  const repoRoot = process.cwd();
  loadEnvFile(path.join(repoRoot, ".env.local-workers"));
  loadEnvFile(path.join(repoRoot, ".env.local-oddsharvester"));
  process.env.SHARKEDGE_WORKER_MODE = "local";
  process.env.SHARKEDGE_DISABLE_WORKERS = "false";
  process.env.ALLOW_RAILWAY_HEAVY_WORKER = "false";

  const supervisorEnabled = !truthy(process.env.LOCAL_WORKERS_DISABLED);
  if (!supervisorEnabled) {
    console.info("[local-workers] supervisor disabled by LOCAL_WORKERS_DISABLED=true");
    return;
  }

  const specs = buildWorkerSpecs();
  console.info(`[local-workers] supervisor start ${JSON.stringify(specs.map((spec) => ({ name: spec.name, intervalMinutes: spec.intervalMinutes, enabled: spec.enabled, runImmediately: spec.runImmediately })))}`);

  for (const spec of specs) {
    void runLoop(spec, { lastStartedAt: null, running: false });
  }

  process.on("SIGINT", () => {
    console.info("[local-workers] SIGINT received; exiting.");
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    console.info("[local-workers] SIGTERM received; exiting.");
    process.exit(0);
  });

  await new Promise(() => {});
}

main().catch((error) => {
  console.error("[local-workers] fatal", error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
