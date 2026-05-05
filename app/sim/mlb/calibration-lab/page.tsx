import Link from "next/link";

import { getMlbV8CalibrationLabReport, type MlbCalibrationBucket } from "@/services/simulation/mlb-v8-calibration-lab";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function num(value: number | null | undefined, digits = 4) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

function pct(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(digits)}%`;
}

function signed(value: number | null | undefined, digits = 4) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function statusClass(status: string) {
  if (status === "GREEN") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (status === "YELLOW" || status === "INSUFFICIENT_DATA") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return "border-red-300/25 bg-red-300/10 text-red-100";
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

function BucketTable({ title, rows }: { title: string; rows: MlbCalibrationBucket[] }) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">{title}</div>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-white/10 text-slate-500">
            <tr>
              <th className="px-2 py-2">Bucket</th>
              <th className="px-2 py-2 text-right">N</th>
              <th className="px-2 py-2 text-right">Win%</th>
              <th className="px-2 py-2 text-right">Avg P</th>
              <th className="px-2 py-2 text-right">Brier</th>
              <th className="px-2 py-2 text-right">Mkt Brier</th>
              <th className="px-2 py-2 text-right">Δ Brier</th>
              <th className="px-2 py-2 text-right">CLV</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row) => (
              <tr key={row.bucket} className="border-b border-white/5 last:border-none">
                <td className="px-2 py-2 font-semibold text-slate-200">{row.bucket}</td>
                <td className="px-2 py-2 text-right font-mono text-slate-300">{row.count}</td>
                <td className="px-2 py-2 text-right font-mono text-slate-300">{pct(row.winRate)}</td>
                <td className="px-2 py-2 text-right font-mono text-slate-300">{pct(row.avgProbability)}</td>
                <td className="px-2 py-2 text-right font-mono text-slate-300">{num(row.brier)}</td>
                <td className="px-2 py-2 text-right font-mono text-slate-300">{num(row.marketBrier)}</td>
                <td className={row.brierEdgeVsMarket != null && row.brierEdgeVsMarket > 0 ? "px-2 py-2 text-right font-mono text-emerald-300" : "px-2 py-2 text-right font-mono text-red-300"}>{signed(row.brierEdgeVsMarket)}</td>
                <td className={row.avgClv != null && row.avgClv > 0 ? "px-2 py-2 text-right font-mono text-emerald-300" : "px-2 py-2 text-right font-mono text-red-300"}>{signed(row.avgClv, 3)}</td>
              </tr>
            )) : (
              <tr><td colSpan={8} className="px-2 py-4 text-center text-slate-500">No settled rows yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MessageList({ title, rows }: { title: string; rows: string[] }) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">{title}</div>
      <div className="mt-3 grid gap-2 text-sm text-slate-300">
        {rows.length ? rows.map((row) => <div key={row} className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2">{row}</div>) : <div className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-slate-500">None.</div>}
      </div>
    </div>
  );
}

export default async function MlbCalibrationLabPage() {
  const report = await getMlbV8CalibrationLabReport(180);
  const official = report.officialPicks;
  const snapshots = report.snapshots;

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/80 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">MLB Calibration Lab</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Model vs market calibration</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Scores the promoted MLB v8/v7 brain against neutral and no-vig market baselines. This is the proving ground for Brier, log loss, CLV, buckets, and pick gating.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.14em]">
            <Link href="/sim/main-brain" className="text-cyan-200 hover:text-cyan-100">Main brain</Link>
            <Link href="/api/sim/mlb-v8/calibration-lab" className="text-cyan-200 hover:text-cyan-100">API JSON</Link>
            <Link href="/sim/mlb/v7/live" className="text-cyan-200 hover:text-cyan-100">MLB live</Link>
          </div>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Verdict</div>
            <div className="mt-2 text-sm text-slate-300">{report.verdict.summary}</div>
          </div>
          <div className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${statusClass(report.verdict.status)}`}>{report.verdict.status}</div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Tile label="Official picks" value={official.count} note={`${official.wins}-${official.losses} · ${pct(official.winRate)}`} />
        <Tile label="Official Brier" value={num(official.brier)} note={`Market ${num(official.marketBrier)} · Δ ${signed(official.brierEdgeVsMarket)}`} />
        <Tile label="Official log loss" value={num(official.logLoss)} note={`Market ${num(official.marketLogLoss)} · Δ ${signed(official.logLossEdgeVsMarket)}`} />
        <Tile label="Official CLV" value={signed(official.avgClv, 3)} note="Average closing-line value" />
        <Tile label="Snapshot rows" value={snapshots.count} note={`Brier ${num(snapshots.brier)} · Log ${num(snapshots.logLoss)}`} />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <MessageList title="Blockers" rows={report.verdict.blockers} />
        <MessageList title="Warnings" rows={report.verdict.warnings} />
        <MessageList title="Recommendations" rows={report.verdict.recommendations} />
      </section>

      <section className="grid gap-4">
        <BucketTable title="Probability calibration buckets" rows={report.buckets.probability} />
        <BucketTable title="Edge buckets" rows={report.buckets.edge} />
        <BucketTable title="CLV buckets" rows={report.buckets.clv} />
        <BucketTable title="Tier buckets" rows={report.buckets.tier} />
        <BucketTable title="Player-impact buckets" rows={report.buckets.playerImpact} />
        <BucketTable title="Profile status buckets" rows={report.buckets.profileStatus} />
      </section>
    </main>
  );
}
