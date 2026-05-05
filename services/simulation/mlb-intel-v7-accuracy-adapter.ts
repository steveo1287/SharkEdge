import { getMlbIntelV7LedgerSummary } from "@/services/simulation/mlb-intel-v7-ledgers";

type LedgerBlock = {
  total?: number | null;
  settled?: number | null;
  pending?: number | null;
  wins?: number | null;
  losses?: number | null;
  winRate?: number | null;
  brier?: number | null;
  logLoss?: number | null;
  clv?: number | null;
  roi?: number | null;
};

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function nullableNum(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function settleRate(ledger: LedgerBlock) {
  const total = num(ledger.total);
  return total > 0 ? Number((num(ledger.settled) / total).toFixed(4)) : null;
}

function explicitWinRate(ledger: LedgerBlock) {
  const wins = num(ledger.wins);
  const losses = num(ledger.losses);
  return wins + losses > 0 ? Number((wins / (wins + losses)).toFixed(4)) : null;
}

function normalizeLedger(ledger: LedgerBlock) {
  return {
    total: num(ledger.total),
    settled: num(ledger.settled),
    pending: num(ledger.pending),
    wins: num(ledger.wins),
    losses: num(ledger.losses),
    settleRate: settleRate(ledger),
    winRate: nullableNum(ledger.winRate) ?? explicitWinRate(ledger),
    brier: nullableNum(ledger.brier),
    logLoss: nullableNum(ledger.logLoss),
    clv: nullableNum(ledger.clv),
    roi: nullableNum(ledger.roi)
  };
}

function warningsFor(snapshot: ReturnType<typeof normalizeLedger>, official: ReturnType<typeof normalizeLedger>) {
  const warnings: string[] = [];

  if (snapshot.total > 0 && snapshot.settled === 0) {
    warnings.push("Open V7 rows captured. Awaiting final grading.");
  }

  if (official.total > 0 && official.settled === 0) {
    warnings.push("Open V7 official picks captured. Awaiting final grading.");
  }

  if (snapshot.total === 0 && official.total === 0) {
    warnings.push("No MLB Intel V7 ledger rows found for this window.");
  }

  if (snapshot.settled > 0 && snapshot.settled < 30) {
    warnings.push("Very small MLB V7 settled sample. Treat calibration as directional only.");
  }

  return warnings;
}

function statusFor(snapshot: ReturnType<typeof normalizeLedger>, official: ReturnType<typeof normalizeLedger>) {
  if (snapshot.settled > 0 || official.settled > 0) return "grading";
  if (snapshot.pending > 0 || official.pending > 0) return "capturing";
  return "waiting_for_rows";
}

export async function getMlbIntelV7AccuracyProof(windowDays = 90) {
  const summary = await getMlbIntelV7LedgerSummary(windowDays);

  if (!summary.ok) {
    return {
      ok: false,
      modelVersion: "mlb-intel-v7",
      windowDays,
      error: summary.error ?? "MLB Intel V7 ledger summary is unavailable."
    };
  }

  const snapshot = normalizeLedger(summary.snapshotLedger ?? {});
  const official = normalizeLedger(summary.officialPickLedger ?? {});

  return {
    ok: true,
    modelVersion: "mlb-intel-v7",
    windowDays: summary.windowDays ?? windowDays,
    status: statusFor(snapshot, official),
    sourceTables: ["mlb_model_snapshot_ledger", "mlb_official_pick_ledger"],
    accuracyRules: {
      gradedRowsOnly: true,
      pendingExcludedFromWinRate: true,
      pendingExcludedFromRoi: true,
      historicalV6Preserved: true
    },
    snapshotLedger: snapshot,
    officialPickLedger: official,
    neutralBaselines: summary.neutralBaselines ?? { brier: 0.25, logLoss: 0.6931 },
    warnings: warningsFor(snapshot, official)
  };
}
