import Link from "next/link";

import { getMlbV8PromotionReport, type MlbV8PromotionBucket, type MlbV8PromotionMetricSet } from "@/services/simulation/mlb-v8-promotion-comparator";
import { getMlbV8ProductionMode } from "@/services/simulation/mlb-v8-production-control";
import { getMlbV8PromotionGate } from "@/services/simulation/mlb-v8-promotion-gate";

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
  if (status === "PROMOTE" || status === "broad_promotion" || status === "gated") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (status === "SHADOW" || status === "INSUFFICIENT_DATA" || status === "bucket_promotion" || status === "shadow") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return "border-red-300/25 bg-red-300/10 text-red-100";
}

function capturePath(mode: string) {
  if (mode === "force_v7") return "premium_v7_fallback";
  if (mode === "shadow") return "v8_shadow_capture";
  if (mode === "off") return "disabled";
  return "v8_gated_capture";
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

function MetricGrid({ title, metrics }: { title: string; metrics: MlbV8PromotionMetricSet }) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">{title}</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Tile label="Rows" value={metrics.count} note={`${metrics.wins}-${metrics.losses} · ${pct(metrics.winRate)}`} />
        <Tile label="Impact coverage" value={pct(metrics.playerImpactRate)} note={`${metrics.playerImpactRows} rows applied`} />
        <Tile label="Baseline Brier" value={num(metrics.baselineBrier)} note="Raw pre-V8 projection" />
        <Tile label="V8 Brier" value={num(metrics.v8ImpactBrier)} note={`Lift ${signed(metrics.v8EdgeVsBaseline)}`} />
        <Tile label="Final Brier" value={num(metrics.finalCalibratedBrier)} note={`Vs market ${signed(metrics.finalEdgeVsMarket)}`} />
      </div>
    </section>
  );
}

function BucketTable({ title, rows }: { title: string; rows: MlbV8PromotionBucket[] }) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">{title}</div>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-white/10 text-slate-500">
            <tr>
              <th className="px-2 py-2">Bucket</th>
              <th className="px-2 py-2 text-right">N</th>
              <th className="px-2 py-2 text-right">Impact</th>
              <th className="px-2 py-2 text-right">Base Brier</th>
              <th className="px-2 py-2 text-right">V8 Brier</th>
              <th className="px-2 py-2 text-right">V8 Lift</th>
              <th className="px-2 py-2 text-right">Final Lift</th>
              <th className="px-2 py-2 text-right">CLV</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row) => (
              <tr key={row.bucket} className="border-b border-white/5 last:border-none">
                <td className="px-2 py-2 font-semibold text-slate-200">{row.bucket}</td>
                <td className="px-2 py-2 text-right font-mono text-slate-300">{row.count}</td>
                <td className="px-2 py-2 text-right font-mono text-slate-300">{pct(row.playerImpactRate)}</td>
                <td className="px-2 py-2 text-right font-mono text-slate-300">{num(row.baselineBrier)}</td>
                <td className="px-2 py-2 text-right font-mono text-slate-300">{num(row.v8ImpactBrier)}</td>
                <td className={row.v8EdgeVsBaseline != null && row.v8EdgeVsBaseline > 0 ? "px-2 py-2 text-right font-mono text-emerald-300" : "px-2 py-2 text-right font-mono text-red-300"}>{signed(row.v8EdgeVsBaseline)}</td>
                <td className={row.finalEdgeVsBaseline != null && row.finalEdgeVsBaseline > 0 ? "px-2 py-2 text-right font-mono text-emerald-300" : "px-2 py-2 text-right font-mono text-red-300"}>{signed(row.finalEdgeVsBaseline)}</td>
                <td className={row.avgClv != null && row.avgClv > 0 ? "px-2 py-2 text-right font-mono text-emerald-300" : "px-2 py-2 text-right font-mono text-red-300"}>{signed(row.avgClv, 3)}</td>
              </tr>
            )) : (
              <tr><td colSpan={8} className="px-2 py-4 text-center text-slate-500">No settled rows yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MessageList({ title, rows }: { title: string; rows: string[] }) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">{title}</div>
      <div className="mt-3 grid gap-2 text-sm text-slate-300">
        {rows.length ? rows.map((row) => <div key={row} className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2">{row}</div>) : <div className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-slate-500">None.</div>}
      </div>
    </section>
  );
}

export default async function MlbV8PromotionPage() {
  const [report, gate] = await Promise.all([
    getMlbV8PromotionReport(180),
    getMlbV8PromotionGate(180)
  ]);
  const productionMode = getMlbV8ProductionMode();

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/80 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">MLB V8 Promotion Comparator</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Shadow-mode proof before promotion</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Compares raw baseline probability, V8 player-impact probability, final V7-calibrated probability, and no-vig market probability on settled V7 ledger rows. The production control panel shows what the cron path is allowed to publish.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.14em]">
            <Link href="/sim/mlb/v7/accuracy" className="text-cyan-200 hover:text-cyan-100">V7 accuracy</Link>
            <Link href="/sim/mlb/calibration-lab" className="text-cyan-200 hover:text-cyan-100">Calibration lab</Link>
            <Link href="/api/sim/mlb-v8/promotion" className="text-cyan-200 hover:text-cyan-100">API JSON</Link>
          </div>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-cyan-300/15 bg-slate-950/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Production control</div>
            <div className="mt-2 text-sm text-slate-300">Cron capture path: {capturePath(productionMode)}. Gate mode: {gate.mode}.</div>
          </div>
          <div className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${statusClass(productionMode)}`}>{productionMode}</div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Tile label="Capture path" value={capturePath(productionMode)} note="Active cron behavior" />
          <Tile label="Gate mode" value={gate.mode} note="Promotion decision" />
          <Tile label="Official V8" value={gate.allowOfficialV8Promotion && productionMode !== "off" ? "Allowed" : "Blocked"} note="Official pick capture" />
          <Tile label="Attack picks" value={gate.allowAttackPicks && productionMode === "gated" ? "Allowed" : "Blocked"} note="Aggressive tier" />
          <Tile label="Shadow" value={gate.requireShadowCapture || productionMode === "shadow" ? "Required" : "Optional"} note="Snapshot capture" />
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Promotion verdict</div>
            <div className="mt-2 text-sm text-slate-300">{report.summary}</div>
          </div>
          <div className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${statusClass(report.status)}`}>{report.status}</div>
        </div>
      </section>

      <MetricGrid title="Official picks" metrics={report.officialPicks} />
      <MetricGrid title="Snapshot rows" metrics={report.snapshots} />

      <section className="grid gap-4 xl:grid-cols-3">
        <MessageList title="Blockers" rows={report.blockers} />
        <MessageList title="Warnings" rows={report.warnings} />
        <MessageList title="Recommendations" rows={report.recommendations} />
      </section>

      <BucketTable title="Player-impact buckets" rows={report.buckets.playerImpact} />
      <BucketTable title="Confidence buckets" rows={report.buckets.confidence} />
      <BucketTable title="Brier-lift buckets" rows={report.buckets.lift} />
    </main>
  );
}
