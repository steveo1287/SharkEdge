import Link from "next/link";

import { buildGeneratedSystemAttachments, type GeneratedSystemAttachmentGame, type GeneratedSystemAttachmentSignal } from "@/services/trends/generated-system-attachments";

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

function parseBool(value: string | undefined) {
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function fmtPct(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "TBD";
  return `${value}%`;
}

function fmtUnits(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(Math.abs(value) >= 10 ? 1 : 2)}u`;
}

function fmtTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function gateClass(gate: string) {
  if (gate === "promote_candidate") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (gate === "watch_candidate") return "border-sky-400/25 bg-sky-400/10 text-sky-200";
  if (gate === "research_candidate") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return "border-red-400/25 bg-red-400/10 text-red-200";
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

function SignalCard({ signal }: { signal: GeneratedSystemAttachmentSignal }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="line-clamp-2 text-sm font-semibold leading-5 text-white">{signal.name}</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-500">{signal.market} · {signal.side} · grade {signal.grade}</div>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] ${gateClass(signal.qualityGate)}`}>{signal.qualityGate.replace(/_/g, " ")}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-400 sm:grid-cols-4">
        <span>{signal.record}</span>
        <span>{fmtUnits(signal.profitUnits)}</span>
        <span>{fmtPct(signal.roiPct)} ROI</span>
        <span>Rank {signal.rankScore}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-500 sm:grid-cols-4">
        <span>Sample {signal.sampleSize}</span>
        <span>Win {fmtPct(signal.winRatePct)}</span>
        <span>CLV {fmtPct(signal.clvPct)}</span>
        <span>Last 10 {signal.last10 ?? "TBD"}</span>
      </div>
      {signal.matchedConditions.length ? <div className="mt-3 text-xs leading-5 text-emerald-100/80">Matched: {signal.matchedConditions.slice(0, 4).join(" · ")}</div> : null}
      {signal.unmatchedConditions.length ? <div className="mt-2 text-[11px] leading-5 text-slate-500">Needs live/source validation: {signal.unmatchedConditions.slice(0, 4).join(" · ")}</div> : null}
      {signal.blockers.length ? <div className="mt-2 text-[11px] leading-5 text-amber-100/80">Blockers: {signal.blockers.slice(0, 3).join(" · ")}</div> : null}
    </article>
  );
}

function GameCard({ game }: { game: GeneratedSystemAttachmentGame }) {
  return (
    <section className="rounded-[1.5rem] border border-cyan-300/15 bg-cyan-300/[0.035] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">{game.league} · {game.status}</div>
          <h2 className="mt-2 text-lg font-semibold text-white">{game.eventLabel}</h2>
          <div className="mt-1 text-xs leading-5 text-slate-500">{fmtTime(game.startTime)} · {game.sourceNote}</div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-[10px] uppercase tracking-[0.12em] text-slate-500">
          <div className="rounded-xl border border-white/10 bg-black/25 px-2 py-2"><div className="text-sm font-semibold text-white">{game.topSystems.length}</div>top</div>
          <div className="rounded-xl border border-white/10 bg-black/25 px-2 py-2"><div className="text-sm font-semibold text-white">{game.allMatchedCount}</div>matched</div>
          <div className="rounded-xl border border-white/10 bg-black/25 px-2 py-2"><div className="text-sm font-semibold text-white">{game.collapsedRelated.length}</div>groups</div>
        </div>
      </div>
      <div className="mt-4 grid gap-3 xl:grid-cols-3">
        {game.topSystems.map((signal) => <SignalCard key={`${game.eventId}:${signal.systemId}`} signal={signal} />)}
      </div>
      {game.collapsedRelated.length ? (
        <details className="mt-4 rounded-xl border border-white/10 bg-black/25 p-3">
          <summary className="cursor-pointer list-none text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Collapsed related systems</summary>
          <div className="mt-3 grid gap-2 text-xs leading-5 text-slate-400">
            {game.collapsedRelated.map((group) => <div key={group.relatedKey}>{group.count} related · {group.relatedKey} · top {group.topSystemId}</div>)}
          </div>
        </details>
      ) : null}
    </section>
  );
}

export default async function GeneratedAttachmentsPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const league = (readValue(resolved, "league") ?? "ALL").toUpperCase();
  const date = readValue(resolved, "date") || undefined;
  const limitEvents = parseIntValue(readValue(resolved, "limitEvents"), 100, 1, 300);
  const topSystemsPerGame = parseIntValue(readValue(resolved, "topSystemsPerGame"), 3, 1, 10);
  const includeResearch = parseBool(readValue(resolved, "includeResearch"));
  const payload = await buildGeneratedSystemAttachments({ league, date, limitEvents, topSystemsPerGame, includeResearch });

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/70 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Generated System Attachments</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Today’s generated-system fits</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">PR #166 preview: attach persisted generated systems to today’s games, rank top systems per game, and collapse related systems. This is not yet promoted to the main command board.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.14em]"><Link href="/sharktrends" className="text-cyan-200 hover:text-cyan-100">Command board</Link><Link href="/sharktrends/factory" className="text-cyan-200 hover:text-cyan-100">Factory</Link><Link href="/sharktrends/backtest" className="text-cyan-200 hover:text-cyan-100">Backtest</Link><Link href="/api/sharktrends/generated-attachments" className="text-cyan-200 hover:text-cyan-100">API</Link></div>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-4">
        <form method="get" className="grid gap-3 md:grid-cols-5">
          <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">League</span><select name="league" defaultValue={league} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">{["ALL", "MLB", "NBA", "NFL", "NHL", "NCAAF", "UFC", "BOXING"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Date</span><input type="date" name="date" defaultValue={date} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /></label>
          <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Events</span><input name="limitEvents" defaultValue={String(limitEvents)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /></label>
          <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Top per game</span><input name="topSystemsPerGame" defaultValue={String(topSystemsPerGame)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /></label>
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-300"><input type="checkbox" name="includeResearch" value="1" defaultChecked={includeResearch} className="h-4 w-4 accent-cyan-300" />Research</label>
          <button className="md:col-span-5 rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100 hover:bg-cyan-300/15">Attach generated systems</button>
        </form>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Metric label="Events scanned" value={payload.stats.eventsScanned} note="Today’s events considered." />
        <Metric label="Systems scanned" value={payload.stats.systemsScanned} note="Persisted generated systems loaded." />
        <Metric label="Games attached" value={payload.stats.gamesWithGeneratedSystems} note="Games with at least one generated fit." />
        <Metric label="Attached systems" value={payload.stats.attachedSystems} note="Total generated-system matches." />
        <Metric label="Blocked" value={payload.stats.blockedSystems} note="Systems withheld by blockers." />
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4 text-sm leading-6 text-slate-400">{payload.sourceNote}</section>

      <section className="grid gap-4">
        {payload.games.length ? payload.games.map((game) => <GameCard key={game.eventId} game={game} />) : <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4 text-sm leading-6 text-slate-400">No generated-system attachments found. This usually means generated systems have not been persisted yet, today’s events are empty, or filters are too narrow.</div>}
      </section>
    </main>
  );
}
