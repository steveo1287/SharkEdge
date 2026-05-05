import Link from "next/link";

import { getMlbIntelV7LedgerSummary } from "@/services/simulation/mlb-intel-v7-ledgers";
import { getMlbRosterIntelligenceSummary } from "@/services/simulation/mlb-roster-intelligence";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function num(value: number | null | undefined, digits = 3) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

function pct(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(digits)}%`;
}

function pctRaw(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function Tile({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 font-mono text-2xl font-bold text-white">{value}</div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{note}</div>
    </div>
  );
}

function RoleRows({ rows }: { rows: Array<{ role: string; count: number; avgOverall: number | null }> }) {
  if (!rows.length) return <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-slate-500">No role rows captured yet.</div>;
  return (
    <div className="grid gap-2">
      {rows.map((row) => (
        <div key={row.role} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs">
          <span className="font-semibold text-slate-200">{row.role}</span>
          <span className="font-mono text-slate-400">{row.count} · avg {num(row.avgOverall, 1)}</span>
        </div>
      ))}
    </div>
  );
}

export default async function MlbIntelV7Page() {
  const [ledger, roster] = await Promise.all([
    getMlbIntelV7LedgerSummary(90),
    getMlbRosterIntelligenceSummary()
  ]);

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/80 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">MLB Intel v7</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Calibration + roster intelligence</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              MLB v7 separates model snapshots from official picks, tracks raw versus calibrated probability, and prepares roster-aware ratings for hitters, starters, bullpen arms, and lineup snapshots.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.14em]">
            <Link href="/sim/accuracy" className="text-cyan-200 hover:text-cyan-100">Accuracy</Link>
            <Link href="/api/sim/mlb-intel-v7/ledger?action=run" className="text-cyan-200 hover:text-cyan-100">Run v7 ledger</Link>
            <Link href="/api/sim/mlb/roster-intelligence?action=ensure" className="text-cyan-200 hover:text-cyan-100">Ensure roster tables</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Tile label="Snapshot rows" value={ledger.ok ? ledger.snapshotLedger.total : "--"} note="Calibration snapshots, not official picks" />
        <Tile label="Official picks" value={ledger.ok ? ledger.officialPickLedger.total : "--"} note="Dedupe by game/market/side/model" />
        <Tile label="Neutral Brier" value={ledger.ok ? num(ledger.neutralBaselines.brier, 4) : "--"} note="50/50 benchmark to beat" />
        <Tile label="Neutral log loss" value={ledger.ok ? num(ledger.neutralBaselines.logLoss, 4) : "--"} note="Overconfidence benchmark" />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Snapshot calibration ledger</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Tile label="Settled" value={ledger.ok ? ledger.snapshotLedger.settled : "--"} note="Rows with final scores" />
            <Tile label="Pending" value={ledger.ok ? ledger.snapshotLedger.pending : "--"} note="Awaiting result" />
            <Tile label="Brier" value={ledger.ok ? num(ledger.snapshotLedger.brier, 4) : "--"} note="Lower than .250 is the target" />
            <Tile label="Log loss" value={ledger.ok ? num(ledger.snapshotLedger.logLoss, 4) : "--"} note="Lower than .693 is the target" />
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Official pick ledger</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Tile label="Win rate" value={ledger.ok ? pct(ledger.officialPickLedger.winRate) : "--"} note="Official picks only" />
            <Tile label="CLV" value={ledger.ok ? pctRaw(ledger.officialPickLedger.clv) : "--"} note="Close-line movement proof" />
            <Tile label="Brier" value={ledger.ok ? num(ledger.officialPickLedger.brier, 4) : "--"} note="Pick probability calibration" />
            <Tile label="ROI" value={ledger.ok ? pctRaw(ledger.officialPickLedger.roi) : "--"} note="Future staking layer" />
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Hitter ratings</div>
          <div className="mt-2 text-sm text-slate-400">{roster.ok ? `${roster.hitters.total} hitter rows across ${roster.hitters.teams} teams.` : "Roster tables are not ready."}</div>
          <div className="mt-4"><RoleRows rows={roster.ok ? roster.hitters.roles : []} /></div>
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Pitcher ratings</div>
          <div className="mt-2 text-sm text-slate-400">{roster.ok ? `${roster.pitchers.total} pitcher rows across ${roster.pitchers.teams} teams.` : "Roster tables are not ready."}</div>
          <div className="mt-4"><RoleRows rows={roster.ok ? roster.pitchers.roles : []} /></div>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Lineup snapshot readiness</div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Tile label="Lineup snapshots" value={roster.ok ? roster.lineupSnapshots.total : "--"} note="Projected or confirmed batting orders" />
          <Tile label="Confirmed" value={roster.ok ? roster.lineupSnapshots.confirmed : "--"} note="Official lineup lock rows" />
          <Tile label="Model target" value="Roster-aware" note="Stars, starters, bench, aces, rotation tiers, bullpen roles" />
        </div>
      </section>
    </main>
  );
}
