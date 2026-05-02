import type { ReactNode } from "react";

import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

type SimAccuracyRecordSummary = {
  predictionCount: number;
  settledCount: number;
  pendingCount: number;
  wins: number;
  losses: number;
  pushes: number;
  brierScoreAvg: number | null;
  logLossAvg: number | null;
};

type SimAccuracyRecordRow = {
  prediction_count: bigint | number | string | null;
  settled_count: bigint | number | string | null;
  pending_count: bigint | number | string | null;
  wins: bigint | number | string | null;
  losses: bigint | number | string | null;
  pushes: bigint | number | string | null;
  brier_score_avg: number | string | null;
  log_loss_avg: number | string | null;
};

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return 0;
}

function toNullableNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function pct(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(digits)}%`;
}

function num(value: number | null | undefined, digits = 4) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

async function readOverallRecord(): Promise<SimAccuracyRecordSummary | null> {
  if (!hasUsableServerDatabaseUrl()) return null;

  try {
    const rows = await prisma.$queryRaw<SimAccuracyRecordRow[]>`
      SELECT
        COUNT(*) AS prediction_count,
        COUNT(*) FILTER (WHERE graded_at IS NOT NULL) AS settled_count,
        COUNT(*) FILTER (WHERE graded_at IS NULL) AS pending_count,
        COUNT(*) FILTER (
          WHERE graded_at IS NOT NULL
            AND final_home_score IS NOT NULL
            AND final_away_score IS NOT NULL
            AND home_won IS NOT NULL
            AND final_home_score <> final_away_score
            AND (
              (model_home_win_pct >= 0.5 AND home_won = TRUE)
              OR (model_home_win_pct < 0.5 AND home_won = FALSE)
            )
        ) AS wins,
        COUNT(*) FILTER (
          WHERE graded_at IS NOT NULL
            AND final_home_score IS NOT NULL
            AND final_away_score IS NOT NULL
            AND home_won IS NOT NULL
            AND final_home_score <> final_away_score
            AND NOT (
              (model_home_win_pct >= 0.5 AND home_won = TRUE)
              OR (model_home_win_pct < 0.5 AND home_won = FALSE)
            )
        ) AS losses,
        COUNT(*) FILTER (
          WHERE graded_at IS NOT NULL
            AND final_home_score IS NOT NULL
            AND final_away_score IS NOT NULL
            AND final_home_score = final_away_score
        ) AS pushes,
        AVG(brier) FILTER (WHERE graded_at IS NOT NULL AND brier IS NOT NULL) AS brier_score_avg,
        AVG(log_loss) FILTER (WHERE graded_at IS NOT NULL AND log_loss IS NOT NULL) AS log_loss_avg
      FROM sim_prediction_snapshots;
    `;

    const row = rows[0];
    if (!row) return null;

    return {
      predictionCount: toNumber(row.prediction_count),
      settledCount: toNumber(row.settled_count),
      pendingCount: toNumber(row.pending_count),
      wins: toNumber(row.wins),
      losses: toNumber(row.losses),
      pushes: toNumber(row.pushes),
      brierScoreAvg: toNullableNumber(row.brier_score_avg),
      logLossAvg: toNullableNumber(row.log_loss_avg)
    };
  } catch {
    return null;
  }
}

function RecordTile({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 font-mono text-2xl font-bold text-white">{value}</div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{note}</div>
    </div>
  );
}

async function SimAccuracyRecordBanner() {
  const record = await readOverallRecord();

  if (!record) {
    return (
      <section className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <div className="rounded-[1.5rem] border border-amber-300/20 bg-amber-300/[0.055] p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-200">Sim Accuracy Record</div>
          <div className="mt-2 text-sm leading-6 text-amber-100/80">Overall W/L and Brier score will show here once the sim prediction snapshot ledger is available.</div>
        </div>
      </section>
    );
  }

  const decisions = record.wins + record.losses;
  const winRate = decisions > 0 ? record.wins / decisions : null;
  const recordText = `${record.wins}-${record.losses}${record.pushes ? `-${record.pushes}` : ""}`;

  return (
    <section className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
      <div className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/80 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Sim Accuracy Record</div>
            <h2 className="mt-2 font-display text-2xl font-semibold text-white">Overall W/L and Brier score</h2>
            <p className="mt-1 text-sm leading-6 text-slate-400">Graded from settled rows in the simulation prediction snapshot ledger. Pushes are shown in the record but excluded from win rate.</p>
          </div>
          <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">
            {record.settledCount} settled
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <RecordTile label="Overall record" value={recordText} note="Wins-losses-pushes" />
          <RecordTile label="Win rate" value={pct(winRate)} note="Pushes excluded" />
          <RecordTile label="Brier" value={num(record.brierScoreAvg)} note="Lower is better" />
          <RecordTile label="Log loss" value={num(record.logLossAvg)} note="Overconfidence penalty" />
          <RecordTile label="Predictions" value={record.predictionCount} note="Captured model snapshots" />
          <RecordTile label="Pending" value={record.pendingCount} note="Awaiting final grading" />
        </div>
      </div>
    </section>
  );
}

export default function SimAccuracyLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SimAccuracyRecordBanner />
      {children}
    </>
  );
}
