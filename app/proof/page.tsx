import Link from "next/link";

import { getResultsCenter } from "@/services/results/mlb-results-center";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function pct(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(1)}%` : "—";
}

function units(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value > 0 ? "+" : ""}${value.toFixed(2)}u` : "—";
}

function price(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value > 0 ? `+${Math.round(value)}` : String(Math.round(value));
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</div><div className="mt-2 font-display text-3xl font-black tracking-tight text-white">{value}</div><div className="mt-2 text-xs leading-5 text-slate-400">{note}</div></div>;
}

export default async function ProofPage() {
  const data = await getResultsCenter("overview");
  const s = data.summary;
  const graded = s.wins + s.losses + s.pushes;
  const integrity = [
    "Wins, losses, pushes, and pending rows are shown together.",
    "Actual captured odds are separated from fallback odds.",
    "Railway health and smoke checks are part of the deploy path.",
    "Results link back to market-specific ledgers."
  ];

  return <main className="min-h-screen bg-[#02060b] px-3 py-4 text-white sm:px-6"><div className="mx-auto grid max-w-7xl gap-5 pb-16"><section className="rounded-[1.75rem] border border-emerald-300/20 bg-slate-950 p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-[10px] font-black uppercase tracking-[0.28em] text-emerald-300/80">Proof Room</div><h1 className="mt-2 font-display text-4xl font-black tracking-tight text-white sm:text-5xl">Audited betting intelligence</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">The product moat is not a prettier pick card. It is a visible ledger: hits, misses, pending rows, captured odds, market lanes, locked tickets, and deploy health in one place.</p></div><div className="flex gap-2"><Link href="/tickets" className="rounded-full border border-emerald-300/35 bg-emerald-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100">Tickets</Link><Link href="/results" className="rounded-full border border-cyan-300/35 bg-cyan-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100">Results</Link><Link href="/" className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-300">Home</Link></div></div></section><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Stat label="Graded" value={String(graded)} note={`${s.wins} win · ${s.losses} loss · ${s.pushes} push`} /><Stat label="Pending" value={String(s.pending)} note="Unsettled rows stay visible instead of disappearing." /><Stat label="Win rate" value={pct(s.winRatePct)} note="Calculated from wins and losses only." /><Stat label="Units" value={units(s.unitsNet)} note={`${s.actualOddsCount} actual odds · ${s.fallbackOddsCount} fallback`} /><Stat label="ROI" value={pct(s.roiPct)} note="Directional until sample size matures." /></div><section className="grid gap-3 md:grid-cols-2"><div className="rounded-[1.35rem] border border-white/10 bg-slate-950/75 p-5"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">Integrity checklist</div><div className="mt-4 grid gap-3">{integrity.map((item) => <div key={item} className="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm leading-6 text-slate-300">{item}</div>)}</div></div><div className="rounded-[1.35rem] border border-white/10 bg-slate-950/75 p-5"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Market lanes</div><div className="mt-4 grid gap-3">{data.marketCards.map((card) => <Link key={card.key} href={card.href} className="rounded-2xl border border-white/10 bg-black/20 p-3 transition hover:border-cyan-300/35"><div className="flex items-center justify-between gap-3"><div><div className="text-sm font-black text-white">{card.label}</div><div className="mt-1 text-xs text-slate-500">{card.note}</div></div><div className="text-right text-xs text-slate-400">{card.summary.wins}-{card.summary.losses}<div className="font-mono text-emerald-200">{units(card.summary.unitsNet)}</div></div></div></Link>)}</div></div></section><section className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-4 sm:p-5"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Recent proof rows</div><div className="mt-5 grid gap-3">{data.rows.slice(0, 16).map((row) => <Link key={row.id} href={row.detailHref} className="rounded-[1.15rem] border border-white/10 bg-[#06101b]/82 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">{row.marketLabel} · {row.result} · {row.lockStatus}</div><div className="mt-2 font-display text-lg font-black tracking-tight text-white">{row.pickLabel}</div><div className="mt-1 text-sm text-slate-400">{row.eventLabel}</div><p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{row.note}</p></div><div className="text-right"><div className="text-xs text-slate-500">Odds</div><div className="font-mono text-cyan-100">{price(row.oddsAmerican)}</div><div className="text-xs text-emerald-200">{units(row.units)}</div></div></div></Link>)}{!data.rows.length ? <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.035] p-5 text-sm leading-6 text-slate-400">No proof rows returned yet.</div> : null}</div></section></div></main>;
}
