import type { MlbSettledBatterPropProbabilityRow } from "@/services/simulation/mlb-batter-prop-probability-calibration";

export type MlbPlayerPropBacktestRow = MlbSettledBatterPropProbabilityRow & {
  oddsAmerican?: number | null;
  book?: string | null;
};

export type MlbPlayerPropBacktestBucket = {
  key: string;
  sampleSize: number;
  wins: number;
  losses: number;
  hitRate: number;
  averagePredicted: number;
  observedRate: number;
  brierScore: number;
  logLoss: number;
  roi: number;
  profitUnits: number;
  calibrationDrift: number;
};

export type MlbPlayerPropBacktestReport = {
  modelVersion: "mlb-player-prop-backtest-v1";
  generatedAt: string;
  sampleSize: number;
  wins: number;
  losses: number;
  hitRate: number;
  averagePredicted: number;
  observedRate: number;
  brierScore: number;
  logLoss: number;
  roi: number;
  profitUnits: number;
  calibrationDrift: number;
  byMarket: MlbPlayerPropBacktestBucket[];
  byPlayer: MlbPlayerPropBacktestBucket[];
  byMatchupCluster: MlbPlayerPropBacktestBucket[];
  warnings: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function decimalOdds(americanOdds: number | null | undefined) {
  if (!americanOdds || !Number.isFinite(americanOdds)) return 1.91;
  return americanOdds < 0 ? 1 + 100 / Math.abs(americanOdds) : 1 + americanOdds / 100;
}

function profit(row: MlbPlayerPropBacktestRow) {
  if (row.won) return decimalOdds(row.oddsAmerican) - 1;
  return -1;
}

function brier(rows: MlbPlayerPropBacktestRow[]) {
  return mean(rows.map((row) => Math.pow(clamp(row.modelProbability, 0.01, 0.99) - (row.won ? 1 : 0), 2)));
}

function logLoss(rows: MlbPlayerPropBacktestRow[]) {
  return mean(rows.map((row) => {
    const p = clamp(row.modelProbability, 0.01, 0.99);
    return row.won ? -Math.log(p) : -Math.log(1 - p);
  }));
}

function bucket(key: string, rows: MlbPlayerPropBacktestRow[]): MlbPlayerPropBacktestBucket {
  const wins = rows.filter((row) => row.won).length;
  const losses = rows.length - wins;
  const profitUnits = rows.reduce((sum, row) => sum + profit(row), 0);
  const averagePredicted = mean(rows.map((row) => clamp(row.modelProbability, 0.01, 0.99)));
  const observedRate = rows.length ? wins / rows.length : 0;
  return {
    key,
    sampleSize: rows.length,
    wins,
    losses,
    hitRate: round(observedRate, 4),
    averagePredicted: round(averagePredicted, 4),
    observedRate: round(observedRate, 4),
    brierScore: round(brier(rows), 4),
    logLoss: round(logLoss(rows), 4),
    roi: round(rows.length ? profitUnits / rows.length : 0, 4),
    profitUnits: round(profitUnits, 4),
    calibrationDrift: round(observedRate - averagePredicted, 4)
  };
}

function group(rows: MlbPlayerPropBacktestRow[], keyer: (row: MlbPlayerPropBacktestRow) => string | null, limit: number) {
  const groups = new Map<string, MlbPlayerPropBacktestRow[]>();
  for (const row of rows) {
    const key = keyer(row);
    if (!key) continue;
    const current = groups.get(key) ?? [];
    current.push(row);
    groups.set(key, current);
  }
  return [...groups.entries()]
    .map(([key, bucketRows]) => bucket(key, bucketRows))
    .sort((a, b) => b.sampleSize - a.sampleSize || Math.abs(b.calibrationDrift) - Math.abs(a.calibrationDrift))
    .slice(0, limit);
}

export function buildMlbPlayerPropBacktestReport(rows: MlbPlayerPropBacktestRow[]): MlbPlayerPropBacktestReport {
  const validRows = rows.filter((row) =>
    ["HITS", "TOTAL_BASES", "HOME_RUN", "WALKS", "STRIKEOUTS"].includes(row.market) &&
    ["OVER", "UNDER"].includes(row.side) &&
    Number.isFinite(row.line) &&
    Number.isFinite(row.modelProbability)
  );
  const warnings: string[] = [];
  if (validRows.length !== rows.length) warnings.push(`${rows.length - validRows.length} backtest row(s) rejected.`);
  if (!validRows.length) warnings.push("No valid MLB player prop backtest rows available.");
  const total = bucket("ALL", validRows);

  return {
    modelVersion: "mlb-player-prop-backtest-v1",
    generatedAt: new Date().toISOString(),
    sampleSize: total.sampleSize,
    wins: total.wins,
    losses: total.losses,
    hitRate: total.hitRate,
    averagePredicted: total.averagePredicted,
    observedRate: total.observedRate,
    brierScore: total.brierScore,
    logLoss: total.logLoss,
    roi: total.roi,
    profitUnits: total.profitUnits,
    calibrationDrift: total.calibrationDrift,
    byMarket: group(validRows, (row) => `${row.market}:${row.line}:${row.side}`, 20),
    byPlayer: group(validRows, (row) => row.playerId ? `${row.playerName ?? row.playerId}:${row.playerId}` : null, 20),
    byMatchupCluster: group(validRows, (row) => row.matchupClusterKey ?? (row.hitterArchetype && row.pitcherArchetype ? `${row.hitterArchetype}_vs_${row.pitcherArchetype}` : null), 20),
    warnings
  };
}
