import { getMlbIntelV7LedgerSummary } from "@/services/simulation/mlb-intel-v7-ledgers";
import { buildMlbIntelV7LiveBoard } from "@/services/simulation/mlb-intel-v7-live-board";

export type MlbIntelV7HealthStatus = "GREEN" | "YELLOW" | "RED";

export type MlbIntelV7HealthInput = {
  rowCount: number;
  marketCoverage: number;
  rosterCoverage: number;
  lineupLockCoverage: number;
  snapshotBrier?: number | null;
  snapshotLogLoss?: number | null;
  officialPickCount: number;
  warningCount: number;
};

export type MlbIntelV7HealthReport = MlbIntelV7HealthInput & {
  status: MlbIntelV7HealthStatus;
  canPublishAttackPicks: boolean;
  blockers: string[];
  warnings: string[];
  recommendations: string[];
};

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function classifyMlbIntelV7Health(input: MlbIntelV7HealthInput): MlbIntelV7HealthReport {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];

  if (input.rowCount <= 0) blockers.push("No active MLB v7 live-board rows are available.");
  if (input.marketCoverage < 0.5) blockers.push(`No-vig market coverage is too low at ${pct(input.marketCoverage)}.`);
  if (typeof input.snapshotBrier === "number" && input.snapshotBrier > 0.27) blockers.push(`Snapshot Brier ${input.snapshotBrier.toFixed(4)} is above the emergency threshold.`);
  if (typeof input.snapshotLogLoss === "number" && input.snapshotLogLoss > 0.75) blockers.push(`Snapshot log loss ${input.snapshotLogLoss.toFixed(4)} is above the emergency threshold.`);

  if (input.marketCoverage >= 0.5 && input.marketCoverage < 0.8) warnings.push(`No-vig market coverage is only ${pct(input.marketCoverage)}.`);
  if (input.rosterCoverage < 0.5) warnings.push(`Roster intelligence coverage is low at ${pct(input.rosterCoverage)}.`);
  if (input.lineupLockCoverage < 0.25) warnings.push(`Confirmed lineup-lock coverage is low at ${pct(input.lineupLockCoverage)}.`);
  if (input.officialPickCount < 30) warnings.push(`Official-pick sample is small at ${input.officialPickCount} rows.`);
  if (input.warningCount > 0) warnings.push(`Live board reported ${input.warningCount} warnings.`);
  if (typeof input.snapshotBrier === "number" && input.snapshotBrier > 0.25 && input.snapshotBrier <= 0.27) warnings.push(`Snapshot Brier ${input.snapshotBrier.toFixed(4)} is worse than the neutral .250 benchmark.`);
  if (typeof input.snapshotLogLoss === "number" && input.snapshotLogLoss > 0.693 && input.snapshotLogLoss <= 0.75) warnings.push(`Snapshot log loss ${input.snapshotLogLoss.toFixed(4)} is worse than the neutral .693 benchmark.`);

  if (input.marketCoverage < 0.8) recommendations.push("Prioritize moneyline no-vig market capture before allowing strong MLB v7 picks.");
  if (input.rosterCoverage < 0.75) recommendations.push("Load hitter, pitcher, and lineup snapshots through the MLB roster-intelligence ingest endpoint.");
  if (input.lineupLockCoverage < 0.5) recommendations.push("Keep early outputs in WATCH/PASS until confirmed lineups are available.");
  if (input.officialPickCount < 100) recommendations.push("Treat ROI/CLV as directional until the official-pick sample reaches at least 100 rows.");

  const status: MlbIntelV7HealthStatus = blockers.length ? "RED" : warnings.length ? "YELLOW" : "GREEN";
  const canPublishAttackPicks = status === "GREEN" || (status === "YELLOW" && input.marketCoverage >= 0.8 && input.rowCount > 0);

  return {
    ...input,
    marketCoverage: round(input.marketCoverage),
    rosterCoverage: round(input.rosterCoverage),
    lineupLockCoverage: round(input.lineupLockCoverage),
    status,
    canPublishAttackPicks,
    blockers,
    warnings,
    recommendations
  };
}

export async function getMlbIntelV7HealthReport(limit = 60) {
  const [board, ledger] = await Promise.all([
    buildMlbIntelV7LiveBoard({ limit }),
    getMlbIntelV7LedgerSummary(90)
  ]);

  const rowCount = board.rowCount;
  const marketRows = board.rows.filter((row) => typeof row.market.homeNoVigProbability === "number" && Number.isFinite(row.market.homeNoVigProbability)).length;
  const rosterRows = board.rows.filter((row) => row.roster.away.available && row.roster.home.available).length;
  const lineupRows = board.rows.filter((row) => row.lock.lineupsConfirmed).length;
  const snapshotLedger = ledger.ok && "snapshotLedger" in ledger ? ledger.snapshotLedger : null;
  const officialPickLedger = ledger.ok && "officialPickLedger" in ledger ? ledger.officialPickLedger : null;

  const input: MlbIntelV7HealthInput = {
    rowCount,
    marketCoverage: rowCount > 0 ? marketRows / rowCount : 0,
    rosterCoverage: rowCount > 0 ? rosterRows / rowCount : 0,
    lineupLockCoverage: rowCount > 0 ? lineupRows / rowCount : 0,
    snapshotBrier: snapshotLedger?.brier ?? null,
    snapshotLogLoss: snapshotLedger?.logLoss ?? null,
    officialPickCount: officialPickLedger?.total ?? 0,
    warningCount: board.warnings.length
  };

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    modelVersion: "mlb-intel-v7",
    health: classifyMlbIntelV7Health(input),
    board: {
      rowCount: board.rowCount,
      gameCount: board.gameCount,
      warnings: board.warnings
    },
    ledger: ledger.ok ? ledger : null
  };
}
