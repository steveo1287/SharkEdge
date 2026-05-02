export type SimRunDepthMode = "board" | "detail" | "verdict" | "backtest";

export const SIM_RUN_DEPTH_DEFAULTS: Record<SimRunDepthMode, number> = {
  board: 5_000,
  detail: 10_000,
  verdict: 25_000,
  backtest: 25_000
};

const SIM_RUN_DEPTH_ENV: Record<SimRunDepthMode, string[]> = {
  board: ["NBA_PLAYER_SIM_RUNS_BOARD", "SIM_RUNS_BOARD"],
  detail: ["NBA_PLAYER_SIM_RUNS_DETAIL", "SIM_RUNS_DETAIL"],
  verdict: ["NBA_PLAYER_SIM_RUNS_VERDICT", "SIM_RUNS_VERDICT"],
  backtest: ["NBA_PLAYER_SIM_RUNS_BACKTEST", "SIM_RUNS_BACKTEST"]
};

export function clampSimRuns(value: number, min = 1_000, max = 25_000) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(Math.round(value), max));
}

function readEnvInt(keys: string[]) {
  for (const key of keys) {
    const raw = process.env[key]?.trim();
    if (!raw) continue;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

export function getSimRunDepth(mode: SimRunDepthMode = "detail") {
  return clampSimRuns(readEnvInt(SIM_RUN_DEPTH_ENV[mode]) ?? SIM_RUN_DEPTH_DEFAULTS[mode]);
}
