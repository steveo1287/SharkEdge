import Link from "next/link";

import { getMlbAccuracyMarketLedger } from "@/services/sim/mlb-accuracy-market-ledger";
import { getSimModelScorecard } from "@/services/sim/mlb-moneyline-scorecard";

export const revalidate = 3600;

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

const WINDOWS = [
  { label: "7D", value: "7", days: 7 },
  { label: "30D", value: "30", days: 30 },
  { label: "90D", value: "90", days: 90 },
  { label: "365D", value: "365", days: 365 },
  { label: "All", value: "all", days: null }
];

function param(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}
function selectedWindow(value?: string) {
  const normalized = String(value ?? "30").toLowerCase();
  return WINDOWS.find((item) => item.value === normalized || String(item.days) === normalized) ?? WINDOWS[1];
}
function pct(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "—";
}
function record(wins = 0, losses = 0, pushes = 0) {
  return pushes ? `${wins}-${losses}-${pushes}` : `${wins}-${losses}`;
}
function units(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value > 0 ? "+" : ""}${value.toFixed(1)}u` : "—";
}
function when(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}
function href(params: Record<string, string | null | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  return `/sim/accuracy/mlb?${query.toString()}`;
}
function total(summaries: Array<{ predictionCount: number; settledCount: number; pendingCount: number; winCount: number; lossCount: number; pushCount: number }>) {
  const out = summaries.reduce((acc, row) => ({
    predictionCount: acc.predictionCount + row.predictionCount,
    settledCount: acc.settledCount + row.settledCount,
    pendingCount: acc.pendingCount + row.pendingCount,
    winCount: acc.winCount + row.winCount,
    lossCount: acc.lossCount + row.lossCount,
    pushCount: acc.pushCount + row.pushCount
  }), { predictionCount: 0, settledCount: 0, pendingCount: 0, winCount: 0, lossCount: 0, pushCount: 0 });
  return { ...out, winRate: out.winCount + out.lossCount > 0 ? out.winCount / (out.winCount + out.lossCount) : null };
}
function Card({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</div><div className="mt-2 font-mono text-2xl font-bold text-white">{value}</div><div className="mt-2 text-xs leading-5 text-slate-400">{note}</div></div>;
}

export default async function MlbAccuracyPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const active = selectedWindow(param(params, "window") ?? param(params, "windowDays"));
  const date = param(params, "date") ?? null;
  const days = active.days ?? 3650;
  const [ledger, scorecard] = await Promise.all([
    getMlbAccuracyMarketLedger({ date, windowDays: days, limit: date ? 1000 : 250 }),
    getSimModelScorecard({ league: "MLB", market: "ALL", modelVersion: "ALL", windowDays: days })
  ]);
  const overall = total(ledger.summaries);

  return <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
    <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/80 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300">MLB Accuracy</div><h1 className="mt-2 font-display text-4xl font-black tracking-[-0.05em] text-white">Baseball records only</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">This page is isolated from UFC. It only counts MLB moneyline, full-game totals, first-five, and NRFI/YRFI audit rows.</p><div className="mt-3 text-xs text-slate-500">Generated {when(ledger.generatedAt)} · Source: sim_prediction_snapshots</div></div><div className="flex flex-wrap gap-3 text-xs font-bold uppercase tracking-[0.14em]"><Link href="/sim/accuracy" className="text-cyan-200">Hub</Link><Link href="/sim/accuracy/ufc" className="text-cyan-200">UFC Accuracy</Link><Link href="/api/sim/accuracy" className="text-cyan-200">API</Link></div></div>
    </section>
    <nav className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-slate-950/70 p-3">{WINDOWS.map((item) => <Link key={item.value} href={href({ window: item.value })} className={`rounded-xl border px-4 py-2 text-xs font-black uppercase tracking-[0.14em] ${item.value === active.value && !date ? "border-cyan-300/40 bg-cyan-300/15 text-cyan-100" : "border-white/10 bg-white/[0.03] text-slate-400"}`}>{item.label}</Link>)}</nav>
    <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-4"><form action="/sim/accuracy/mlb" className="flex flex-wrap items-end gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">Date audit</div><input name="date" type="date" defaultValue={ledger.dateNavigation.selectedDate} className="mt-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white" /></div><input type="hidden" name="window" value={active.value} /><button className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-cyan-100">Load MLB Date</button><Link href={href({ date: ledger.dateNavigation.previousDate, window: active.value })} className="rounded-xl border border-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-slate-300">Previous</Link><Link href={href({ date: ledger.dateNavigation.nextDate, window: active.value })} className="rounded-xl border border-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-slate-300">Next</Link></form></section>
    <section className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.04] p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">MLB-only record</div><h2 className="mt-1 text-3xl font-black text-white">{record(overall.winCount, overall.lossCount, overall.pushCount)} · {pct(overall.winRate)}</h2><p className="mt-2 text-sm text-slate-400">No UFC rows included.</p></div><div className="text-right"><div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Settled / tracked</div><div className="font-mono text-4xl font-black text-white">{overall.settledCount}/{overall.predictionCount}</div></div></div><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{ledger.summaries.map((row) => <Card key={row.market} label={row.label} value={record(row.winCount, row.lossCount, row.pushCount)} note={`${pct(row.winRate)} · ${row.settledCount} graded · ${row.statusNote}`} />)}</div></section>
    <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-5"><div className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">Legacy MLB units</div><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Card label="Moneyline units" value={units(scorecard.totals?.unitsNet)} note={`${scorecard.totals?.roi ?? "—"}% ROI`} /><Card label="Totals units" value={units(scorecard.totalsScorecard?.unitsNet)} note={`${scorecard.totalsScorecard?.roi ?? "—"}% ROI`} /><Card label="Pending MLB" value={String(overall.pendingCount)} note="Tracked but not graded" /><Card label="Rows visible" value={String(ledger.rows.length)} note="Use the JSON endpoint for raw row proof" /></div></section>
  </main>;
}
