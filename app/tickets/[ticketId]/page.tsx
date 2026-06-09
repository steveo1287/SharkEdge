import Link from "next/link";
import { notFound } from "next/navigation";

import { getLockedPickTicket } from "@/services/proof/locked-pick-tickets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { params: Promise<{ ticketId: string }> };

function value(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

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

function Row({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</div><div className="mt-2 break-words font-mono text-sm font-black text-white">{value}</div></div>;
}

export default async function TicketPage({ params }: PageProps) {
  const { ticketId } = await params;
  const ticket = await getLockedPickTicket(ticketId);
  if (!ticket) notFound();

  return <main className="min-h-screen bg-[#02060b] px-3 py-4 text-white sm:px-6"><div className="mx-auto grid max-w-5xl gap-5 pb-16"><section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950 p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300/75">Locked Ticket</div><h1 className="mt-2 font-display text-4xl font-black tracking-tight text-white">{ticket.ticketId}</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Permanent receipt for a SharkEdge pick row. The proof hash is generated from the source row payload.</p></div><div className="flex gap-2"><Link href="/tickets" className="rounded-full border border-cyan-300/35 bg-cyan-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100">Tickets</Link><Link href={ticket.rowHref} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-300">Source</Link></div></div></section><section className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Pick</div><h2 className="mt-2 font-display text-3xl font-black tracking-tight text-white">{ticket.pickLabel}</h2><div className="mt-1 text-sm text-slate-400">{ticket.eventLabel}</div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Row label="Result" value={`${ticket.result} · ${ticket.lockStatus}`} /><Row label="Market" value={`${ticket.marketLabel} · ${ticket.sideLabel}`} /><Row label="Model" value={pct(ticket.modelProbabilityPct)} /><Row label="Market prob" value={pct(ticket.marketProbabilityPct)} /><Row label="Edge" value={pct(ticket.edgePct)} /><Row label="Odds" value={price(ticket.oddsAmerican)} /><Row label="Units" value={units(ticket.units)} /><Row label="Proof hash" value={ticket.proofHash} /></div></section><section className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">Integrity</div><div className="mt-4 grid gap-3 sm:grid-cols-2"><Row label="Captured at" value={value(ticket.capturedAt)} /><Row label="Settled at" value={value(ticket.settledAt)} /><Row label="Actual odds" value={ticket.integrity.hasActualOdds ? "yes" : "no"} /><Row label="Fallback odds" value={ticket.integrity.usesFallbackOdds ? "yes" : "no"} /><Row label="Visible miss" value={ticket.integrity.visibleMiss ? "yes" : "no"} /><Row label="Source row" value={ticket.sourceRowId} /></div></section></div></main>;
}
