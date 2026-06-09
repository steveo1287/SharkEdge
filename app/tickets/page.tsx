import Link from "next/link";

import { getLockedPickTickets } from "@/services/proof/locked-pick-tickets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function units(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value > 0 ? "+" : ""}${value.toFixed(2)}u` : "—";
}

function pct(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(1)}%` : "—";
}

function price(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value > 0 ? `+${Math.round(value)}` : String(Math.round(value));
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</div><div className="mt-2 font-display text-3xl font-black tracking-tight text-white">{value}</div><div className="mt-2 text-xs leading-5 text-slate-400">{note}</div></div>;
}

export default async function TicketsPage() {
  const data = await getLockedPickTickets(100);
  return <main className="min-h-screen bg-[#02060b] px-3 py-4 text-white sm:px-6"><div className="mx-auto grid max-w-7xl gap-5 pb-16"><section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950 p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300/75">Locked Tickets</div><h1 className="mt-2 font-display text-4xl font-black tracking-tight text-white sm:text-5xl">Permanent pick receipts</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Every ticket gets a stable ID, proof hash, market lane, odds state, settlement state, and source row link. This is the receipt layer.</p></div><div className="flex gap-2"><Link href="/proof" className="rounded-full border border-emerald-300/35 bg-emerald-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100">Proof</Link><Link href="/results" className="rounded-full border border-cyan-300/35 bg-cyan-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100">Results</Link></div></div></section><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Stat label="Tickets" value={String(data.summary.ticketCount)} note="Recent locked receipts from the results ledger." /><Stat label="Settled" value={String(data.summary.settled)} note="Win/loss/push rows only." /><Stat label="Losses shown" value={String(data.summary.losses)} note="Misses stay visible." /><Stat label="Pending" value={String(data.summary.pending)} note="Awaiting settlement." /><Stat label="Actual odds" value={String(data.summary.actualOdds)} note={`${data.summary.fallbackOdds} fallback`} /></div><section className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-4 sm:p-5"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Ticket ledger</div><div className="mt-5 grid gap-3">{data.tickets.length ? data.tickets.map((ticket) => <Link key={ticket.ticketId} href={ticket.href} className="rounded-[1.15rem] border border-white/10 bg-[#06101b]/82 p-4 transition hover:border-cyan-300/35"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">{ticket.ticketId} · {ticket.result} · {ticket.lockStatus}</div><h2 className="mt-2 font-display text-xl font-black tracking-tight text-white">{ticket.pickLabel}</h2><div className="mt-1 text-sm text-slate-400">{ticket.eventLabel}</div><div className="mt-2 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.12em]"><span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-slate-400">{ticket.marketLabel}</span><span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-slate-400">Hash {ticket.proofHash}</span>{ticket.integrity.visibleMiss ? <span className="rounded-full border border-red-400/25 bg-red-400/10 px-2 py-1 text-red-200">Visible miss</span> : null}{ticket.integrity.usesFallbackOdds ? <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-1 text-amber-200">Fallback odds</span> : null}</div></div><div className="text-right"><div className="text-xs text-slate-500">Model</div><div className="font-mono text-lg font-black text-cyan-100">{pct(ticket.modelProbabilityPct)}</div><div className="text-xs text-slate-500">{price(ticket.oddsAmerican)}</div><div className="text-xs text-emerald-200">{units(ticket.units)}</div></div></div></Link>) : <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.035] p-5 text-sm leading-6 text-slate-400">No tickets returned yet.</div>}</div></section></div></main>;
}
