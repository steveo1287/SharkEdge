import Link from "next/link";
import { notFound } from "next/navigation";

import { getLockedPickTicket } from "@/services/proof/locked-pick-tickets";
import { getTicketPlayerLinks } from "@/services/proof/ticket-player-links";

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

function signedPct(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value > 0 ? "+" : ""}${value.toFixed(1)}%` : "—";
}

function runs(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value > 0 ? "+" : ""}${value.toFixed(2)}` : "—";
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
  const playerLinks = await getTicketPlayerLinks(ticket);

  return <main className="min-h-screen bg-[#02060b] px-3 py-4 text-white sm:px-6"><div className="mx-auto grid max-w-5xl gap-5 pb-16"><section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950 p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300/75">Locked Ticket</div><h1 className="mt-2 font-display text-4xl font-black tracking-tight text-white">{ticket.ticketId}</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Permanent receipt for a SharkEdge pick row. The proof hash is generated from the source row payload, and player-profile links explain which MLB cards may be driving the edge.</p></div><div className="flex gap-2"><Link href="/tickets" className="rounded-full border border-cyan-300/35 bg-cyan-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100">Tickets</Link><Link href={`/api/tickets/${encodeURIComponent(ticket.ticketId)}/players`} className="rounded-full border border-emerald-300/35 bg-emerald-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100">Players JSON</Link><Link href={ticket.rowHref} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-300">Source</Link></div></div></section><section className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Pick</div><h2 className="mt-2 font-display text-3xl font-black tracking-tight text-white">{ticket.pickLabel}</h2><div className="mt-1 text-sm text-slate-400">{ticket.eventLabel}</div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Row label="Result" value={`${ticket.result} · ${ticket.lockStatus}`} /><Row label="Market" value={`${ticket.marketLabel} · ${ticket.sideLabel}`} /><Row label="Model" value={pct(ticket.modelProbabilityPct)} /><Row label="Market prob" value={pct(ticket.marketProbabilityPct)} /><Row label="Edge" value={pct(ticket.edgePct)} /><Row label="Odds" value={price(ticket.oddsAmerican)} /><Row label="Units" value={units(ticket.units)} /><Row label="Proof hash" value={ticket.proofHash} /></div></section><section className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5"><div className="flex items-center justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">Linked player edges</div><p className="mt-2 text-sm leading-6 text-slate-400">Matched from ticket text, team context, market type, and player profile strength.</p></div><Link href="/player-profiles" className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100">Profiles</Link></div><div className="mt-5 grid gap-3">{playerLinks.edges.map((edge) => <Link key={edge.playerId} href={edge.href} className="rounded-[1.15rem] border border-white/10 bg-[#06101b]/82 p-4 transition hover:border-emerald-300/35"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300">{edge.team} · {edge.role} · {edge.matchType} · strength {edge.matchStrength}</div><h3 className="mt-2 font-display text-xl font-black tracking-tight text-white">{edge.name}</h3><div className="mt-1 text-sm text-slate-400">{edge.archetypeHint} · {edge.roleTier}</div><p className="mt-2 text-xs leading-5 text-slate-500">{edge.propSignal}</p></div><div className="text-right"><div className="text-xs text-slate-500">Overall</div><div className="font-display text-3xl font-black text-white">{edge.overall ?? "—"}</div><div className="mt-1 font-mono text-xs text-emerald-200">{runs(edge.modelRunImpact)} runs</div><div className="font-mono text-xs text-cyan-200">{signedPct(edge.modelWinProbabilityImpactPct)}</div></div></div><div className="mt-3 grid gap-2">{edge.reasons.slice(0, 2).map((reason) => <div key={reason} className="rounded-2xl border border-white/10 bg-black/20 p-2 text-xs leading-5 text-slate-400">{reason}</div>)}</div></Link>)}{!playerLinks.edges.length ? <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.035] p-5 text-sm leading-6 text-slate-400">No player-profile edge matched this ticket yet. This usually means the ticket is a broad market or roster-intelligence rows need better player/team labels.</div> : null}</div></section><section className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">Integrity</div><div className="mt-4 grid gap-3 sm:grid-cols-2"><Row label="Captured at" value={value(ticket.capturedAt)} /><Row label="Settled at" value={value(ticket.settledAt)} /><Row label="Actual odds" value={ticket.integrity.hasActualOdds ? "yes" : "no"} /><Row label="Fallback odds" value={ticket.integrity.usesFallbackOdds ? "yes" : "no"} /><Row label="Visible miss" value={ticket.integrity.visibleMiss ? "yes" : "no"} /><Row label="Source row" value={ticket.sourceRowId} /></div></section></div></main>;
}
