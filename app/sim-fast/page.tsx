import Link from "next/link";
import type { ReactNode } from "react";

import {
  readSimCache,
  SIM_CACHE_KEYS,
  type SimHubSnapshot,
  type SimMarketSnapshot,
  type SimPrioritySnapshot,
  type SimRefreshStatusSnapshot
} from "@/services/simulation/sim-snapshot-service";
import { buildSimCardViewModels, type SimCardViewModel } from "@/services/simulation/build-sim-card-view-model";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const DISPLAY_TIME_ZONE = "America/Chicago";
const ACTIONS = ["bets", "totals", "all", "attack", "play", "lean", "watch", "pass"] as const;

type ActionFilter = typeof ACTIONS[number];
type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

function param(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function dateFrom(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function chicagoKeyFromDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: DISPLAY_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return `${parts.find((p) => p.type === "year")?.value ?? "0000"}-${parts.find((p) => p.type === "month")?.value ?? "00"}-${parts.find((p) => p.type === "day")?.value ?? "00"}`;
}

function chicagoKey(value: string | null | undefined) {
  const date = dateFrom(value);
  return date ? chicagoKeyFromDate(date) : "unknown";
}

function relativeKey(offsetDays: number) {
  return chicagoKeyFromDate(new Date(Date.now() + offsetDays * 86_400_000));
}

function dateLabel(key: string) {
  if (key === "all") return "All dates";
  if (key === relativeKey(-1)) return "Yesterday";
  if (key === relativeKey(0)) return "Today";
  if (key === relativeKey(1)) return "Tomorrow";
  const [year, month, day] = key.split("-").map(Number);
  if (!year || !month || !day) return "Unknown date";
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function ageMinutes(value: string | null | undefined) {
  const date = dateFrom(value);
  return date ? Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000)) : null;
}

function age(value: string | null | undefined) {
  const minutes = ageMinutes(value);
  if (minutes == null) return "unknown";
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem ? `${hours}h ${rem}m ago` : `${hours}h ago`;
}

function gameTime(value: string | null | undefined) {
  const date = dateFrom(value);
  if (!date) return "TBD";
  return new Intl.DateTimeFormat("en-US", { timeZone: DISPLAY_TIME_ZONE, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(date);
}

function pct(value: number | null | undefined, digits = 1) {
  return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "—";
}

function signedPct(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const scaled = value * 100;
  return `${scaled > 0 ? "+" : ""}${scaled.toFixed(digits)}%`;
}

function fmtOdds(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function fmtRunEdge(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)} runs`;
}

function actionClass(action: string) {
  if (action === "ATTACK") return "border-emerald-300/35 bg-emerald-300/10 text-emerald-100";
  if (action === "PLAY") return "border-cyan-300/35 bg-cyan-300/10 text-cyan-100";
  if (action === "LEAN") return "border-sky-300/25 bg-sky-300/[0.08] text-sky-100";
  if (action === "WATCH") return "border-amber-300/25 bg-amber-300/[0.08] text-amber-100";
  if (action === "NO_MARKET" || action === "NO MARKET") return "border-amber-300/25 bg-amber-300/[0.08] text-amber-100";
  return "border-white/10 bg-white/[0.03] text-slate-300";
}

function isBetAction(action: string) {
  return action === "ATTACK" || action === "PLAY";
}

function shouldShow(vm: SimCardViewModel, filter: ActionFilter): boolean {
  if (filter === "all") return true;
  if (filter === "totals") return vm.hasTotals;
  if (filter === "bets") return isBetAction(vm.primaryAction.action);
  return vm.primaryAction.action.toLowerCase() === filter;
}

function filterHref(date: string, actionFilter: ActionFilter) {
  return `/sim-fast?date=${encodeURIComponent(date)}&action=${actionFilter}`;
}

async function readSnapshots() {
  const [hub, priority, market, status] = await Promise.all([
    readSimCache<SimHubSnapshot>(SIM_CACHE_KEYS.hub).catch(() => null),
    readSimCache<SimPrioritySnapshot>(SIM_CACHE_KEYS.priority).catch(() => null),
    readSimCache<SimMarketSnapshot>(SIM_CACHE_KEYS.market).catch(() => null),
    readSimCache<SimRefreshStatusSnapshot>(SIM_CACHE_KEYS.refreshStatus).catch(() => null)
  ]);
  return { hub, priority, market, status };
}

function ButtonLink({ href, active = false, children }: { href: string; active?: boolean; children: ReactNode }) {
  return (
    <Link href={href} className={`rounded-xl border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${active ? "border-cyan-300/35 bg-cyan-300/12 text-cyan-100" : "border-white/10 bg-white/[0.03] text-slate-400"}`}>
      {children}
    </Link>
  );
}

function Tile({ label, value, note, ok = true }: { label: string; value: string | number; note: string; ok?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${ok ? "border-white/10 bg-white/[0.03]" : "border-amber-300/20 bg-amber-300/[0.055]"}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 font-mono text-2xl font-bold text-white">{value}</div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{note}</div>
    </div>
  );
}

function ProviderPanel({ lineCount, edgeCount, totalsCount, statusReason, hasMarket }: {
  lineCount: number;
  edgeCount: number;
  totalsCount: number;
  statusReason?: string;
  hasMarket: boolean;
}) {
  if (hasMarket) return null;
  return (
    <section className="rounded-[1.5rem] border border-amber-300/20 bg-amber-300/[0.055] p-5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-200">Odds feed unavailable</div>
      <h2 className="mt-2 font-display text-2xl font-semibold text-white">Projection-only slate loaded.</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
        No betting recommendations can be generated until sportsbook lines are joined. The page will not show fake PASS cards with missing EV or odds.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Tile label="Lines" value={lineCount} note="Sportsbook rows ingested" ok={false} />
        <Tile label="Edges" value={edgeCount} note="Market edge objects" ok={edgeCount > 0} />
        <Tile label="Totals" value={totalsCount} note="Priced over/under cards" ok={totalsCount > 0} />
      </div>
      {statusReason ? <p className="mt-3 text-xs leading-5 text-amber-100">Last refresh note: {statusReason}</p> : null}
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href="/api/sim/refresh?force=1&wait=1" className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100">Refresh Sim</Link>
        <Link href="/api/odds/health" className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-200">Odds Health</Link>
        <Link href="/api/sim/debug" className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-200">Debug JSON</Link>
      </div>
    </section>
  );
}

function ProjectionCard({ vm }: { vm: SimCardViewModel }) {
  const score = vm.projectedAwayRuns != null && vm.projectedHomeRuns != null
    ? `${vm.projectedAwayRuns.toFixed(1)}-${vm.projectedHomeRuns.toFixed(1)}`
    : "—";
  return (
    <article className="rounded-[1.35rem] border border-white/10 bg-slate-950/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-cyan-300/25 bg-cyan-300/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100">{vm.leagueKey}</span>
            <span className={`rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${actionClass("NO_MARKET")}`}>PROJECTION ONLY</span>
          </div>
          <h3 className="mt-3 font-display text-xl font-semibold text-white">{vm.awayTeam} <span className="text-slate-600">@</span> {vm.homeTeam}</h3>
          <div className="mt-1 text-xs text-slate-500">{gameTime(vm.startTime)} · {vm.status ?? "scheduled"}</div>
        </div>
        <Link href={vm.href} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Open</Link>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <Tile label="Lean" value={vm.lean.team} note={`${pct(vm.lean.pct)} sim win prob`} />
        <Tile label="Projected" value={score} note="Away – home runs" />
        <Tile label="Total" value={vm.projectedTotal != null ? vm.projectedTotal.toFixed(1) : "—"} note="Projected runs" />
        <Tile label="Confidence" value={pct(vm.confidence)} note="Projection confidence" ok={false} />
      </div>
      <div className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.055] px-3 py-2 text-xs leading-5 text-amber-100">
        Sportsbook market was not joined. No EV, odds, stake, or betting action available for this game.
      </div>
    </article>
  );
}

function BettingCard({ vm, filter }: { vm: SimCardViewModel; filter: ActionFilter }) {
  const view = filter === "totals" ? (vm.totalsView ?? vm.primaryAction) : vm.primaryAction;
  const action = view.action;
  const isTotalCard = view.marketType === "total";
  const marketLabel = isTotalCard ? (view.side === "over" ? "OVER" : "UNDER") : (view.side === "home" ? "HOME ML" : view.side === "away" ? "AWAY ML" : "MONEYLINE");

  return (
    <article className="rounded-[1.35rem] border border-white/10 bg-slate-950/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-cyan-300/25 bg-cyan-300/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100">{vm.leagueKey}</span>
            <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-200">{marketLabel}</span>
            <span className={`rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${actionClass(action)}`}>{action}</span>
          </div>
          <h3 className="mt-3 font-display text-xl font-semibold text-white">{vm.awayTeam} <span className="text-slate-600">@</span> {vm.homeTeam}</h3>
          <div className="mt-1 text-xs text-slate-500">{gameTime(vm.startTime)} · {vm.status ?? "scheduled"}</div>
        </div>
        <Link href={vm.href} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Open</Link>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-5">
        <Tile
          label="EV"
          value={signedPct(view.ev)}
          note="Expected value"
          ok={view.ev == null || view.ev > 0}
        />
        <Tile
          label={isTotalCard ? "Run edge" : "Edge"}
          value={isTotalCard ? fmtRunEdge(view.projectedRunEdge) : signedPct(view.probabilityEdge)}
          note={isTotalCard ? "Proj vs line" : "Model vs market"}
          ok={view.probabilityEdge == null || view.probabilityEdge > 0}
        />
        <Tile
          label={isTotalCard ? "Line" : "Odds"}
          value={isTotalCard ? (vm.marketTotal != null ? vm.marketTotal.toFixed(1) : "—") : fmtOdds(view.odds)}
          note={isTotalCard ? `Proj ${vm.projectedTotal?.toFixed(1) ?? "—"}` : (view.sportsbook ?? "market")}
        />
        <Tile
          label="Stake"
          value={view.stakeUnits > 0 ? `${view.stakeUnits.toFixed(2)}u` : "0u"}
          note="Quarter-Kelly sizing"
          ok={isBetAction(action) ? view.stakeUnits > 0 : true}
        />
        <Tile
          label="Score"
          value={view.actionScore ?? "—"}
          note={`${pct(view.modelProbability)} model vs ${pct(view.marketProbability)} market`}
        />
      </div>

      {view.reasons.length > 0 ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs leading-5 text-slate-400">
          {view.reasons.join(" · ")}
          {view.hardStops.length > 0 ? (
            <div className="mt-1 text-red-300">Hard stop: {view.hardStops.join(" · ")}</div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function GameCard({ vm, filter }: { vm: SimCardViewModel; filter: ActionFilter }) {
  if (vm.mode === "projection_only") return <ProjectionCard vm={vm} />;
  return <BettingCard vm={vm} filter={filter} />;
}

export default async function FastSimHubPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const selectedDate = param(resolved, "date") === "all" ? "all" : param(resolved, "date") || relativeKey(0);
  const rawAction = String(param(resolved, "action") ?? "all").toLowerCase();
  const actionFilter = (ACTIONS as readonly string[]).includes(rawAction) ? rawAction as ActionFilter : "all";

  const { hub, priority, market, status } = await readSnapshots();

  const rows = priority?.rows ?? [];
  const marketEdges = (market?.edges ?? []) as NonNullable<SimMarketSnapshot["edges"]>;

  const allModels = buildSimCardViewModels(rows, marketEdges);
  const availableDates = [...new Set(allModels.map((vm) => chicagoKey(vm.startTime)).filter((k) => k !== "unknown"))].sort();

  const dateModels = selectedDate === "all" ? allModels : allModels.filter((vm) => chicagoKey(vm.startTime) === selectedDate);
  const cards = dateModels.filter((vm) => shouldShow(vm, actionFilter));

  const betCount = dateModels.filter((vm) => isBetAction(vm.primaryAction.action)).length;
  const attackCount = dateModels.filter((vm) => vm.primaryAction.action === "ATTACK").length;
  const playCount = dateModels.filter((vm) => vm.primaryAction.action === "PLAY").length;
  const totalsCount = dateModels.filter((vm) => vm.hasTotals).length;
  const marketJoinedCount = dateModels.filter((vm) => vm.mode === "betting").length;

  const simAge = status?.lastSuccessAt ?? priority?.generatedAt ?? hub?.generatedAt ?? null;
  const simFresh = (ageMinutes(simAge) ?? 999) <= 20;
  const marketFresh = (ageMinutes(market?.generatedAt) ?? 999) <= 15;
  const hasMarket = Boolean(market?.lineCount && market.lineCount > 0 && marketJoinedCount > 0);

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      {/* Hero */}
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/80 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">MLB Simulation Hub</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">SharkEdge Sim Hub</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              {hasMarket
                ? "Odds live · Market-joined cards ready. Betting cards require priced sportsbook lines."
                : "Projection-only slate loaded. No betting recommendations until sportsbook lines are joined."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/api/sim/refresh?force=1&wait=1" className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100">Refresh Sim</Link>
            <Link href="/api/odds/health" className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Odds Health</Link>
            <Link href="/api/sim/debug" className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Debug</Link>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Tile
            label="Best bets"
            value={hasMarket ? betCount : 0}
            note={hasMarket ? `${attackCount} attack · ${playCount} play` : "Odds required"}
            ok={hasMarket && betCount > 0}
          />
          <Tile
            label="Totals"
            value={hasMarket ? totalsCount : 0}
            note="Priced over/under cards"
            ok={hasMarket && totalsCount > 0}
          />
          <Tile
            label="Slate"
            value={dateModels.length}
            note={hasMarket ? `${marketJoinedCount} market joined` : "Projection-only"}
            ok={dateModels.length > 0}
          />
          <Tile
            label="Projections"
            value={simFresh ? "Fresh" : allModels.length > 0 ? "Stale" : "Missing"}
            note={`Last success ${age(simAge)}`}
            ok={simFresh && allModels.length > 0}
          />
          <Tile
            label="Odds"
            value={hasMarket ? "Live" : marketFresh ? "Stale" : "Missing"}
            note={hasMarket ? `${age(market?.generatedAt)}` : "No lines joined"}
            ok={hasMarket}
          />
          <Tile
            label="MLB lines"
            value={market?.lineCount ?? 0}
            note={`${hub?.summary.mlbCount ?? priority?.summary.mlbCount ?? marketEdges.length} MLB games`}
            ok={hasMarket}
          />
        </div>
      </section>

      {/* Provider warning — only when no market data */}
      <ProviderPanel
        lineCount={market?.lineCount ?? 0}
        edgeCount={marketEdges.length}
        totalsCount={totalsCount}
        statusReason={status?.reason}
        hasMarket={hasMarket}
      />

      {/* Filters */}
      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Filters</div>
            <h2 className="mt-1 font-display text-2xl font-semibold text-white">{dateLabel(selectedDate)} · {actionFilter.toUpperCase()}</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Best Bets = ATTACK + PLAY only. Totals only shows when priced over/under data is joined.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={filterHref(relativeKey(-1), actionFilter)} active={selectedDate === relativeKey(-1)}>Yesterday</ButtonLink>
            <ButtonLink href={filterHref(relativeKey(0), actionFilter)} active={selectedDate === relativeKey(0)}>Today</ButtonLink>
            <ButtonLink href={filterHref(relativeKey(1), actionFilter)} active={selectedDate === relativeKey(1)}>Tomorrow</ButtonLink>
            <ButtonLink href={filterHref("all", actionFilter)} active={selectedDate === "all"}>All</ButtonLink>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {ACTIONS.map((value) => (
            <ButtonLink key={value} href={filterHref(selectedDate, value)} active={actionFilter === value}>{value}</ButtonLink>
          ))}
        </div>
        <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="action" value={actionFilter} />
          <label className="grid gap-1 text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Specific date</span>
            <input type="date" name="date" defaultValue={selectedDate === "all" ? relativeKey(0) : selectedDate} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
          </label>
          <button type="submit" className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100">Apply date</button>
          {availableDates.length > 0 ? (
            <span className="text-xs text-slate-500">Available: {availableDates.map(dateLabel).join(" · ")}</span>
          ) : null}
        </form>
      </section>

      {/* Cards */}
      {cards.length === 0 ? (
        <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-6">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">No cards</div>
          <h2 className="mt-2 font-display text-2xl font-semibold text-white">No cards match this filter.</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Games: {allModels.length}. Market-joined: {marketJoinedCount}. Lines: {market?.lineCount ?? 0}. Totals: {totalsCount}. Last note: {status?.reason ?? "none"}.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href={filterHref(selectedDate, "all")} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">View all</Link>
            <Link href="/api/sim/refresh?force=1&wait=1" className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100">Refresh now</Link>
            <Link href="/api/odds/health" className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Odds Health</Link>
          </div>
        </section>
      ) : (
        <section className="grid gap-3 2xl:grid-cols-2">
          {cards.map((vm) => <GameCard key={vm.gameId} vm={vm} filter={actionFilter} />)}
        </section>
      )}
    </main>
  );
}
