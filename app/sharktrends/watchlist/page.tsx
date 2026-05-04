import Link from "next/link";

import { buildSmartWatchlist, type SavedWatchlistSystem, type SmartWatchlistAlertCandidate } from "@/services/trends/smart-watchlist";

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

function fmtTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function severityClass(severity: string) {
  if (severity === "action") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (severity === "risk") return "border-red-400/25 bg-red-400/10 text-red-200";
  if (severity === "watch") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return "border-sky-400/25 bg-sky-400/10 text-sky-200";
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

function SavedSystemCard({ system }: { system: SavedWatchlistSystem }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300">{system.systemKind} · {system.status}</div>
          <div className="mt-2 text-sm font-semibold leading-5 text-white">{system.name}</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-500">{system.league} · {system.market} · {system.side ?? "any side"}</div>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-300">saved</span>
      </div>
      <div className="mt-3 text-xs leading-5 text-slate-400">{system.notes ?? "No notes saved."}</div>
      <div className="mt-3 text-[11px] text-slate-500">Saved {fmtTime(system.createdAt)} · {system.alertRules.length ? system.alertRules.join(" · ") : "default smart rules"}</div>
      {system.tags.length ? <div className="mt-3 flex flex-wrap gap-1.5">{system.tags.map((tag) => <span key={tag} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] text-slate-400">{tag}</span>)}</div> : null}
    </article>
  );
}

function AlertCard({ alert }: { alert: SmartWatchlistAlertCandidate }) {
  return (
    <article className="rounded-[1.35rem] border border-white/10 bg-slate-950/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">{alert.alertType.replace(/_/g, " ")}</div>
          <div className="mt-2 text-lg font-semibold text-white">{alert.title}</div>
          <div className="mt-1 text-xs leading-5 text-slate-500">{alert.eventLabel ?? "system-level alert"}</div>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] ${severityClass(alert.severity)}`}>{alert.severity}</span>
      </div>
      <div className="mt-3 text-sm leading-6 text-slate-400">{alert.message}</div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/5 p-3"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">Reasons</div><div className="mt-2 grid gap-1 text-xs leading-5 text-slate-300">{alert.reasons.length ? alert.reasons.slice(0, 5).map((reason) => <div key={reason}>+ {reason}</div>) : <div className="text-slate-500">No positive reasons listed.</div>}</div></div>
        <div className="rounded-xl border border-amber-300/15 bg-amber-300/5 p-3"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-300">Watch</div><div className="mt-2 grid gap-1 text-xs leading-5 text-slate-300">{alert.blockers.length ? alert.blockers.slice(0, 5).map((blocker) => <div key={blocker}>- {blocker}</div>) : <div className="text-slate-500">No blockers listed.</div>}</div></div>
      </div>
    </article>
  );
}

export default async function SmartWatchlistPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const savedBy = readValue(resolved, "savedBy") ?? "default";
  const league = (readValue(resolved, "league") ?? "ALL").toUpperCase();
  const market = (readValue(resolved, "market") ?? "ALL").toLowerCase();
  const limit = parseIntValue(readValue(resolved, "limit"), 100, 1, 500);
  const payload = await buildSmartWatchlist({ savedBy, league, market, limit });

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/70 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Smart Watchlist</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Saved systems and alerts</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Track saved systems and surface smart alerts when verification, current game attachment, price availability, and market intelligence line up.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.14em]"><Link href="/sharktrends" className="text-cyan-200 hover:text-cyan-100">Command board</Link><Link href="/sharktrends/verification" className="text-cyan-200 hover:text-cyan-100">Verification</Link><Link href="/api/sharktrends/watchlist" className="text-cyan-200 hover:text-cyan-100">API</Link></div>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-4">
        <form method="get" className="grid gap-3 md:grid-cols-5">
          <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Saved by</span><input name="savedBy" defaultValue={savedBy} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /></label>
          <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">League</span><select name="league" defaultValue={league} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">{["ALL", "MLB", "NBA", "NFL", "NHL", "NCAAF", "UFC", "BOXING"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Market</span><select name="market" defaultValue={market} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">{["ALL", "moneyline", "spread", "total", "player_prop", "fight_winner"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Limit</span><input name="limit" defaultValue={String(limit)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /></label>
          <button className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100 hover:bg-cyan-300/15">Load watchlist</button>
        </form>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Metric label="Saved" value={payload.stats.savedCount} note="Saved systems in this watchlist." />
        <Metric label="Alerts" value={payload.stats.alertCount} note="Smart alert candidates." />
        <Metric label="Action" value={payload.stats.actionCount} note="Verified/attached alerts." />
        <Metric label="Watch" value={payload.stats.watchCount} note="Monitor but not action-gated." />
        <Metric label="Risk" value={payload.stats.riskCount} note="Risk or blocker warnings." />
        <Metric label="Suggested" value={payload.stats.suggestedCount} note="Verified systems to consider saving." />
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4 text-sm leading-6 text-slate-400">{payload.sourceNote}</section>

      <section className="grid gap-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Smart alerts</div>
        {payload.alerts.length ? payload.alerts.map((alert) => <AlertCard key={alert.id} alert={alert} />) : <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4 text-sm leading-6 text-slate-400">No smart alerts are available. Save systems first, or wait for verified systems to attach to current games.</div>}
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Saved systems</div>
          <div className="grid gap-3">{payload.savedSystems.length ? payload.savedSystems.map((system) => <SavedSystemCard key={system.id} system={system} />) : <div className="rounded-xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-slate-400">No systems have been saved yet.</div>}</div>
        </div>
        <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Suggested verified systems</div>
          <div className="grid gap-3">{payload.suggestedSystems.length ? payload.suggestedSystems.map((system) => <div key={system.systemId} className="rounded-2xl border border-white/10 bg-black/25 p-4"><div className="text-sm font-semibold text-white">{system.name}</div><div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-500">{system.league} · {system.market} · {system.grade} {system.score}</div><div className="mt-3 text-xs leading-5 text-slate-400">{system.reason}</div></div>) : <div className="rounded-xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-slate-400">No verified unsaved systems are available under this view.</div>}</div>
        </div>
      </section>
    </main>
  );
}
