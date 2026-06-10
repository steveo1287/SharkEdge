export type WorkerMode = "disabled" | "local" | "railway";

export type HeavyWorkerGate = {
  ok: boolean;
  mode: WorkerMode;
  message: string;
};

function normalizeMode(value: string | undefined | null): WorkerMode {
  const mode = (value ?? "").trim().toLowerCase();
  if (mode === "local" || mode === "pc" || mode === "windows") return "local";
  if (mode === "railway") return "railway";
  return "disabled";
}

function truthy(value: string | undefined | null) {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

export function isLocalWorkerMode() {
  return normalizeMode(process.env.SHARKEDGE_WORKER_MODE) === "local";
}

export function isRailwayHeavyWorkerAllowed() {
  return truthy(process.env.ALLOW_RAILWAY_HEAVY_WORKER);
}

export function shouldRunHeavyWorker(workerName: string): HeavyWorkerGate {
  if (truthy(process.env.SHARKEDGE_DISABLE_WORKERS)) {
    return {
      ok: false,
      mode: "disabled",
      message: `${workerName} is disabled because SHARKEDGE_DISABLE_WORKERS=true.`
    };
  }

  const mode = normalizeMode(process.env.SHARKEDGE_WORKER_MODE);
  if (mode === "local") {
    return {
      ok: true,
      mode,
      message: `${workerName} is allowed in local worker mode.`
    };
  }

  if (mode === "railway" && isRailwayHeavyWorkerAllowed()) {
    return {
      ok: true,
      mode,
      message: `${workerName} is explicitly allowed on Railway.`
    };
  }

  return {
    ok: false,
    mode,
    message:
      `${workerName} is disabled by default. Set SHARKEDGE_WORKER_MODE=local on your PC or SHARKEDGE_WORKER_MODE=railway with ALLOW_RAILWAY_HEAVY_WORKER=true if you intentionally want Railway to run it.`
  };
}
