import Link from "next/link";

import { getResultsCenter, normalizeResultsMarket } from "@/services/results/mlb-results-center";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { params?: Promise<{ market?: string }> };

function valuePct(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(1)}%` : "—";
}

function valueProb(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "—";
}

function valueUnits(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value > 0 ? "+" : ""}${value.toFixed(2)}u` : "—";
}

function valuePrice(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value > 0 ? `+${Math.round(value)}` : String(Math.round(value));
}

export default async function MarketResultsPage({ params }: PageProps) {
  const resolved = await params;
  const market = normalizeResultsMarket(resolved?.market);
  const data = await getResultsCenter(market);
  const summary = data.summary;
  return <main className="min-h-screen bg-[#02060b] px-3 py-4 text-white sm:px-6"><div className="mx-auto grid max-w-7xl gap-5 pb-16"><section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950 p-5"><div className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300/75">{data.windowLabel}</div><h1 className="mt-2 font-display text-4xl font-black tracking-tight text-white sm:text-5xl">{data.title}</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">{data.subtitle}</p><div className="mt-5 flex gap-2 overflow-x-auto pb-1">{data.marketCards.map((card) => <Link key={card.key} href={card.href} className={card.key === data.selectedMarket ? "shrink-0 rounded-full border border-cyan-300/45 bg-cyan-300/15 px-3.5 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-cyan-100" : "shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 hover:text-cyan-100"}>{card.label}</Link>)}</div></section><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Metric label="Hits" value={String(summary.wins)} note={`${summary.pushes} push · ${summary.edgePicks} rows`} /><Metric label="Misses" value={String(summary.losses)} note={`${valuePct(summary.winRatePct)} win rate`} /><Metric label="Pending" value={String(summary.pending)} note="Open rows stay pending until settlement locks." /><Metric label="Units net" value={valueUnits(summary.unitsNet)} note={`${summary.actualOddsCount} actual odds · ${summary.fallbackOddsCount} fallback`} /><Metric label="ROI" value={valuePct(summary.roiPct)} note={`Avg edge ${valuePct(summary.avgEdgePct)} · CLV ${valuePct(summary.avgClvCents)}`} /></div><section className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-4 sm:p-5"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Locked result ledger</div><h2 className="mt-1 font-display text-2xl font-black tracking-tight text-white">Recent rows</h2><div className="mt-5 grid gap-3">{data.rows.length ? data.rows.map((row) => <Link key={row.id} href={row.detailHref} className="rounded-[1.15rem] border border-white/10 bg-[#06101b]/82 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">{row.marketLabel} · {row.result} · {row.lockStatus}</div><h3 className="mt-2 font-display text-xl font-black tracking-tight text-white">{row.pickLabel}</h3><div className="mt-1 text-sm text-slate-400">{row.eventLabel}</div><p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{row.note}</p></div><div className="text-right"><div className="font-mono text-lg font-black text-cyan-100">{valueProb(row.modelProbability)}</div><div className="text-xs text-slate-500">{valuePrice(row.oddsAmerican)}</div><div className="text-xs text-emerald-200">{valueUnits(row.units)}</div></div></div></Link>) : <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.035] p-5 text-sm leading-6 text-slate-400">No rows returned for this results lane yet.</div>}</div></section></div></main>;
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</div><div className="mt-2 font-display text-3xl font-black tracking-tight text-white">{value}</div><div className="mt-2 text-xs leading-5 text-slate-400">{note}</div></div>;
}
