import Link from "next/link";

import { getAccuracyDashboard, type AccuracyDashboardPick, type AccuracyRecord, type AccuracyWindowSummary } from "@/services/accuracy/accuracy-dashboard";

export const revalidate = 300;

function pct(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(digits)}%`;
}

function pctRaw(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function units(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}u`;
}

function odds(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function record(stats: AccuracyRecord) {
  return stats.pushes ? `${stats.wins}-${stats.losses}-${stats.pushes}` : `${stats.wins}-${stats.losses}`;
}

function when(value: string | null | undefined) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function barWidth(value: number | null | undefined, maxAbs: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || maxAbs <= 0) return "0%";
  return `${Math.min(100, Math.abs(value) / maxAbs * 100).toFixed(1)}%`;
}

function winLossWidths(stats: AccuracyRecord) {
  const total = Math.max(1, stats.wins + stats.losses + stats.pushes);
  return {
    win: `${(stats.wins / total * 100).toFixed(1)}%`,
    loss: `${(stats.losses / total * 100).toFixed(1)}%`,
    push: `${(stats.pushes / total * 100).toFixed(1)}%`
  };
}

function MetricCard({ label, value, note, tone = "slate" }: { label: string; value: string; note: string; tone?: "slate" | "green" | "cyan" | "amber" }) {
  const tones = {
    slate: "border-white/10 bg-white/[0.035]",
    green: "border-emerald-300/20 bg-emerald-300/[0.07]",
    cyan: "border-cyan-300/20 bg-cyan-300/[0.07]",
    amber: "border-amber-300/20 bg-amber-300/[0.07]"
  };
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 font-display text-3xl font-black tracking-[-0.06em] text-white">{value}</div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{note}</div>
    </div>
  );
}

function SegmentSummary({ title, subtitle, stats, tone }: { title: string; subtitle: string; stats: AccuracyRecord; tone: "green" | "cyan" }) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">{title}</div>
          <h2 className="mt-1 font-display text-4xl font-black tracking-[-0.07em] text-white">{record(stats)}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">{subtitle}</p>
        </div>
        {stats.sampleWarning ? <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-amber-200">{stats.sampleWarning}</span> : null}
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <MetricCard label="Win rate" value={pct(stats.winRate)} note={`${stats.graded} graded, ${stats.pending} pending`} tone={tone} />
        <MetricCard label="Units" value={units(stats.units)} note="Flat 1u stake per graded pick" />
        <MetricCard label="ROI" value={pctRaw(stats.roi)} note={`${stats.actualOddsCount} actual odds, ${stats.fallbackOddsCount} fallback`} />
      </div>
    </section>
  );
}

function RoiChart({ windows }: { windows: AccuracyWindowSummary[] }) {
  const maxAbs = Math.max(10, ...windows.flatMap((window) => [Math.abs(window.topPlays.roi ?? 0), Math.abs(window.everyPick.roi ?? 0)]));
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">ROI chart</div>
          <h2 className="mt-1 font-display text-2xl font-black tracking-[-0.05em] text-white">Top plays vs every pick</h2>
        </div>
        <div className="text-xs text-slate-500">Green is top plays. Blue is every tracked pick.</div>
      </div>
      <div className="mt-5 grid gap-4">
        {windows.map((window) => (
          <div key={window.key} className="grid gap-2 md:grid-cols-[7rem_1fr_4rem] md:items-center">
            <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">{window.label}</div>
            <div className="grid gap-2">
              <div className="h-3 overflow-hidden rounded-full bg-white/[0.06]"><div className={`h-full rounded-full ${window.topPlays.roi != null && window.topPlays.roi < 0 ? "bg-rose-400" : "bg-emerald-400"}`} style={{ width: barWidth(window.topPlays.roi, maxAbs) }} /></div>
              <div className="h-3 overflow-hidden rounded-full bg-white/[0.06]"><div className={`h-full rounded-full ${window.everyPick.roi != null && window.everyPick.roi < 0 ? "bg-rose-400" : "bg-cyan-400"}`} style={{ width: barWidth(window.everyPick.roi, maxAbs) }} /></div>
            </div>
            <div className="text-right font-mono text-xs text-slate-300">{pctRaw(window.topPlays.roi)} / {pctRaw(window.everyPick.roi)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function WinLossChart({ windows }: { windows: AccuracyWindowSummary[] }) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5">
      <div>
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Record chart</div>
        <h2 className="mt-1 font-display text-2xl font-black tracking-[-0.05em] text-white">Win/loss split by window</h2>
      </div>
      <div className="mt-5 grid gap-4">
        {windows.map((window) => {
          const widths = winLossWidths(window.everyPick);
          return (
            <div key={window.key}>
              <div className="mb-2 flex justify-between text-xs text-slate-400">
                <span>{window.label}</span>
                <span>{record(window.everyPick)} - {pct(window.everyPick.winRate)}</span>
              </div>
              <div className="flex h-4 overflow-hidden rounded-full bg-white/[0.06]">
                <div className="bg-emerald-400" style={{ width: widths.win }} />
                <div className="bg-rose-400" style={{ width: widths.loss }} />
                <div className="bg-slate-500" style={{ width: widths.push }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function WindowTable({ windows }: { windows: AccuracyWindowSummary[] }) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5">
      <div>
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">History windows</div>
        <h2 className="mt-1 font-display text-2xl font-black tracking-[-0.05em] text-white">Weekly, bi-weekly, monthly, all-time</h2>
      </div>
      <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-white/10 bg-white/[0.04] text-slate-400">
            <tr>
              <th className="px-3 py-3">Window</th>
              <th className="px-3 py-3">Lane</th>
              <th className="px-3 py-3 text-right">Record</th>
              <th className="px-3 py-3 text-right">Win %</th>
              <th className="px-3 py-3 text-right">Units</th>
              <th className="px-3 py-3 text-right">ROI</th>
              <th className="px-3 py-3 text-right">Avg Odds</th>
            </tr>
          </thead>
          <tbody>
            {windows.flatMap((window) => [
              { window, label: "Top plays", stats: window.topPlays },
              { window, label: "Every pick", stats: window.everyPick }
            ]).map((row) => (
              <tr key={`${row.window.key}-${row.label}`} className="border-b border-white/5 last:border-none">
                <td className="px-3 py-3 font-semibold text-white">{row.window.label}</td>
                <td className="px-3 py-3 text-slate-300">{row.label}</td>
                <td className="px-3 py-3 text-right font-mono text-white">{record(row.stats)}</td>
                <td className="px-3 py-3 text-right font-mono text-sky-200">{pct(row.stats.winRate)}</td>
                <td className="px-3 py-3 text-right font-mono text-emerald-200">{units(row.stats.units)}</td>
                <td className="px-3 py-3 text-right font-mono text-emerald-200">{pctRaw(row.stats.roi)}</td>
                <td className="px-3 py-3 text-right font-mono text-slate-300">{odds(row.stats.avgOddsAmerican)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RecentTable({ title, rows }: { title: string; rows: AccuracyDashboardPick[] }) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Recent ledger</div>
          <h2 className="mt-1 font-display text-2xl font-black tracking-[-0.05em] text-white">{title}</h2>
        </div>
      </div>
      <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-white/10 bg-white/[0.04] text-slate-400">
            <tr><th className="px-3 py-3">Pick</th><th className="px-3 py-3">Side</th><th className="px-3 py-3 text-right">Odds</th><th className="px-3 py-3 text-right">Result</th><th className="px-3 py-3 text-right">Date</th></tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row) => (
              <tr key={row.id} className="border-b border-white/5 last:border-none">
                <td className="px-3 py-3"><div className="font-semibold text-white">{row.label}</div><div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-slate-500">{row.league} - {row.market.replace("_", " ")}</div></td>
                <td className="px-3 py-3 text-slate-300">{row.side}</td>
                <td className="px-3 py-3 text-right font-mono text-emerald-200">{odds(row.oddsAmerican)}</td>
                <td className="px-3 py-3 text-right font-mono text-white">{row.result}</td>
                <td className="px-3 py-3 text-right font-mono text-slate-400">{when(row.predictionTime)}</td>
              </tr>
            )) : <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">No rows yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function AccuracyPage() {
  const dashboard = await getAccuracyDashboard();
  const allTime = dashboard.windows.find((window) => window.key === "allTime") ?? dashboard.windows[dashboard.windows.length - 1];
  const monthly = dashboard.windows.find((window) => window.key === "monthly") ?? allTime;

  return (
    <main className="min-h-screen bg-[#02060b] px-3 py-5 text-white sm:px-6">
      <div className="mx-auto grid max-w-7xl gap-5">
        <section className="rounded-[1.75rem] border border-cyan-300/15 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_22rem),rgba(2,6,12,0.95)] p-5 shadow-[0_0_80px_rgba(14,165,233,0.08)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300/75">Accuracy scoreboard</div>
              <h1 className="mt-2 font-display text-4xl font-black tracking-[-0.07em] text-white sm:text-5xl">Keep it simple: record, ROI, proof.</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                Top plays are separated from every tracked pick, with the same weekly, bi-weekly, monthly, and all-time windows across the whole ledger.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.14em]">
              <Link href="/accuracy/mlb" className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-slate-300 hover:text-white">MLB detail</Link>
              <Link href="/accuracy/mma" className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-slate-300 hover:text-white">MMA detail</Link>
              <Link href="/accuracy/calibration" className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-slate-300 hover:text-white">Calibration</Link>
              <Link href="/sim" className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-cyan-100">SimHub</Link>
            </div>
          </div>
        </section>

        {dashboard.warnings.length ? (
          <section className="rounded-[1.25rem] border border-amber-300/20 bg-amber-300/[0.07] p-4 text-sm text-amber-100">
            <div className="font-black uppercase tracking-[0.16em]">Data notes</div>
            <div className="mt-2 grid gap-1 text-xs leading-5 text-amber-100/80">
              {dashboard.warnings.slice(0, 4).map((warning) => <div key={warning}>- {warning}</div>)}
            </div>
          </section>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <SegmentSummary title="Top play record" subtitle="Only promoted/high-confidence plays. This is the number that should matter most." stats={allTime.topPlays} tone="green" />
          <SegmentSummary title="Every pick record" subtitle="Every tracked model pick, including lower-confidence rows, so we can see the whole machine." stats={allTime.everyPick} tone="cyan" />
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Monthly top plays" value={record(monthly.topPlays)} note={`${pct(monthly.topPlays.winRate)} - ${units(monthly.topPlays.units)} - ${pctRaw(monthly.topPlays.roi)} ROI`} tone="green" />
          <MetricCard label="Monthly every pick" value={record(monthly.everyPick)} note={`${pct(monthly.everyPick.winRate)} - ${units(monthly.everyPick.units)} - ${pctRaw(monthly.everyPick.roi)} ROI`} tone="cyan" />
          <MetricCard label="All-time top ROI" value={pctRaw(allTime.topPlays.roi)} note={`${allTime.topPlays.graded} graded top plays`} tone="green" />
          <MetricCard label="All-time all-pick ROI" value={pctRaw(allTime.everyPick.roi)} note={`${allTime.everyPick.graded} graded tracked picks`} tone="cyan" />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <RoiChart windows={dashboard.windows} />
          <WinLossChart windows={dashboard.windows} />
        </div>

        <WindowTable windows={dashboard.windows} />

        <div className="grid gap-4 lg:grid-cols-2">
          <RecentTable title="Latest top plays" rows={dashboard.recentTopPlays} />
          <RecentTable title="Latest every-pick rows" rows={dashboard.recentEveryPick} />
        </div>
      </div>
    </main>
  );
}
