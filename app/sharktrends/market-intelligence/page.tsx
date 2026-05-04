import Link from "next/link";

import { buildMarketIntelligencePayload, type MarketIntelligenceSignal } from "@/services/trends/market-intelligence";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readValue(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function parseIntValue(value: string | undefined, fallback: number, min: number, max: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback;
}

function price(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "TBD";
  return value > 0 ? `+${value}` : String(value);
}

function pct(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "TBD";
  return `${value}%`;
}

function time(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function statusClass(status: string) {
  if (status === "sourced") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (status === "partial") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return "border-slate-500/25 bg-slate-800/60 text-slate-300";
}

function Metric({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{note}</div>
    </div>
  );
}

function SignalCard({ signal }: { signal: MarketIntelligenceSignal }) {
  return (
    <article className="rounded-[1.35rem] border border-white/10 bg-slate-950/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">{signal.league} · {signal.status}</div>
          <div className="mt-2 text-lg font-semibold text-white">{signal.eventLabel}</div>
          <div className="mt-1 text-xs leading-5 text-slate-500">{time(signal.startTime)}</div>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] ${statusClass(signal.sourceStatus)}`}>{signal.sourceStatus}</span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-black/25 p-3"><div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Line move</div><div className="mt-1 text-sm font-semibold text-white">{price(signal.lineMovement.openPrice)} → {price(signal.lineMovement.currentPrice ?? signal.lineMovement.closingPrice)}</div><div className="mt-1 text-[11px] text-slate-500">{signal.lineMovement.moveDirection.replace(/_/g, " ")} · {signal.lineMovement.moveAmount ?? "TBD"}</div></div>
        <div className="rounded-xl border border-white/10 bg-black/25 p-3"><div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">CLV</div><div className="mt-1 text-sm font-semibold text-white">{pct(signal.clv.clvPct)}</div><div className="mt-1 text-[11px] text-slate-500">{signal.clv.label}</div></div>
        <div className="rounded-xl border border-white/10 bg-black/25 p-3"><div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Book spread</div><div className="mt-1 text-sm font-semibold text-white">{price(signal.bookDisagreement.bestPrice)} / {price(signal.bookDisagreement.worstPrice)}</div><div className="mt-1 text-[11px] text-slate-500">{signal.bookDisagreement.bookCount} books · {signal.bookDisagreement.label}</div></div>
        <div className="rounded-xl border border-white/10 bg-black/25 p-3"><div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Splits</div><div className="mt-1 text-sm font-semibold text-white">Bets {pct(signal.splits.betPct)} · Money {pct(signal.splits.moneyPct)}</div><div className="mt-1 text-[11px] text-slate-500">{signal.splits.label.replace(/_/g, " ")} · diff {pct(signal.splits.diffPct)}</div></div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2">
        <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/5 p-3"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">Reasons</div><div className="mt-2 grid gap-1 text-xs leading-5 text-slate-300">{signal.reasons.length ? signal.reasons.map((reason) => <div key={reason}>+ {reason}</div>) : <div className="text-slate-500">No sourced market-support reasons yet.</div>}</div></div>
        <div className="rounded-xl border border-amber-300/15 bg-amber-300/5 p-3"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-300">Missing / Watch</div><div className="mt-2 grid gap-1 text-xs leading-5 text-slate-300">{signal.blockers.length ? signal.blockers.map((blocker) => <div key={blocker}>- {blocker}</div>) : <div className="text-slate-500">No market blockers listed.</div>}</div></div>
      </div>
    </article>
  );
}

export default async function MarketIntelligencePage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const league = (readValue(resolved, "league") ?? "ALL").toUpperCase();
  const date = readValue(resolved, "date") || undefined;
  const limitEvents = parseIntValue(readValue(resolved, "limitEvents"), 100, 1, 300);
  const payload = await buildMarketIntelligencePayload({ league, date, limitEvents });

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/70 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Market Intelligence</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Line movement, CLV, books, and splits</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Sourced market context for today’s games. Missing splits or odds are labeled unavailable; this page does not invent public betting data.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.14em]"><Link href="/sharktrends" className="text-cyan-200 hover:text-cyan-100">Command board</Link><Link href="/sharktrends/generated-attachments" className="text-cyan-200 hover:text-cyan-100">Generated attachments</Link><Link href="/api/sharktrends/market-intelligence" className="text-cyan-200 hover:text-cyan-100">API</Link></div>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-4">
        <form method="get" className="grid gap-3 md:grid-cols-4">
          <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">League</span><select name="league" defaultValue={league} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">{["ALL", "MLB", "NBA", "NFL", "NHL", "NCAAF", "UFC", "BOXING"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Date</span><input type="date" name="date" defaultValue={date} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /></label>
          <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Events</span><input name="limitEvents" defaultValue={String(limitEvents)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /></label>
          <button className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100 hover:bg-cyan-300/15">Load market intelligence</button>
        </form>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Events" value={payload.stats.eventsScanned} note="Games scanned for sourced market context." />
        <Metric label="Sourced" value={payload.stats.sourcedSignals} note="Odds and splits both available." />
        <Metric label="Partial" value={payload.stats.partialSignals} note="At least one source available." />
        <Metric label="Unavailable" value={payload.stats.unavailableSignals} note="No compatible market source yet." />
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4 text-sm leading-6 text-slate-400">{payload.sourceNote}</section>

      <section className="grid gap-4">
        {payload.signals.length ? payload.signals.map((signal) => <SignalCard key={signal.eventId} signal={signal} />) : <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4 text-sm leading-6 text-slate-400">No market-intelligence rows are available for this view.</div>}
      </section>
    </main>
  );
}
