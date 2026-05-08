import Link from "next/link";
import type { ReactNode } from "react";

import {
  readSimCache,
  SIM_CACHE_KEYS,
  type SimHubSnapshot,
  type SimMarketSnapshot,
  type SimPriorityRow,
  type SimPrioritySnapshot,
  type SimRefreshStatusSnapshot
} from "@/services/simulation/sim-snapshot-service";
import { buildDisplayAction, edgeHasTotalMarket } from "@/services/simulation/sim-card-display-fallback";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const DISPLAY_TIME_ZONE = "America/Chicago";
const ACTIONS = ["bets", "totals", "all", "attack", "play", "lean", "watch", "pass"] as const;

type ActionFilter = typeof ACTIONS[number];
type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };
type DisplayAction = Record<string, any>;
type MarketEdge = NonNullable<SimMarketSnapshot>["edges"][number] & {
  signal?: Record<string, any> | null;
  totalsAction?: Record<string, any> | null;
  market?: Record<string, any> | null;
  sportsbook?: string | null;
  gameId: string;
  startTime?: string | null;
  status?: string | null;
};
type Card = { id: string; row: SimPriorityRow; edge: MarketEdge | null };

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
  return `${parts.find((part) => part.type === "year")?.value ?? "0000"}-${parts.find((part) => part.type === "month")?.value ?? "00"}-${parts.find((part) => part.type === "day")?.value ?? "00"}`;
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

function time(value: string | null | undefined) {
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

function odds(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function runEdge(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)} runs`;
}

function actionClass(value: string) {
  if (value === "ATTACK") return "border-emerald-300/35 bg-emerald-300/10 text-emerald-100";
  if (value === "PLAY") return "border-cyan-300/35 bg-cyan-300/10 text-cyan-100";
  if (value === "LEAN") return "border-sky-300/25 bg-sky-300/8 text-sky-100";
  if (value === "WATCH") return "border-amber-300/25 bg-amber-300/8 text-amber-100";
  if (value === "NO MARKET") return "border-amber-300/25 bg-amber-300/8 text-amber-100";
  return "border-white/10 bg-white/[0.03] text-slate-300";
}

function isBetAction(action: string) {
  return action === "ATTACK" || action === "PLAY";
}

function actionRank(action: string) {
  if (action === "ATTACK") return 6;
  if (action === "PLAY") return 5;
  if (action === "LEAN") return 4;
  if (action === "WATCH") return 3;
  if (action === "PASS") return 1;
  return 2;
}

function asDisplayAction(edge: MarketEdge | null, filter: ActionFilter): DisplayAction {
  return buildDisplayAction(edge, filter) as DisplayAction;
}

function hasRealMarket(edge: MarketEdge | null) {
  if (!edge?.market) return false;
  return edge.market.homeMoneyline != null || edge.market.awayMoneyline != null || edge.market.total != null || edge.market.overPrice != null || edge.market.underPrice != null;
}

function rowFromEdge(edge: MarketEdge): SimPriorityRow {
  const home = edge.matchup?.home ?? edge.market?.homeTeam ?? "Home";
  const away = edge.matchup?.away ?? edge.market?.awayTeam ?? "Away";
  const homeWinPct = typeof edge.projection?.distribution?.homeWinPct === "number" ? edge.projection.distribution.homeWinPct : 0.5;
  const awayWinPct = typeof edge.projection?.distribution?.awayWinPct === "number" ? edge.projection.distribution.awayWinPct : 0.5;
  const lean = homeWinPct >= awayWinPct ? { team: home, pct: homeWinPct, edge: homeWinPct - awayWinPct } : { team: away, pct: awayWinPct, edge: awayWinPct - homeWinPct };
  return {
    id: edge.gameId,
    leagueKey: "MLB" as any,
    status: edge.status ?? "scheduled",
    startTime: edge.startTime ?? new Date().toISOString(),
    matchup: { away, home },
    lean,
    tier: String(edge.signal?.takeAction?.action ?? edge.totalsAction?.action ?? "watch").toLowerCase(),
    confidence: typeof edge.projection?.mlbIntel?.governor?.confidence === "number" ? edge.projection.mlbIntel.governor.confidence : null,
    homeEdge: typeof edge.projection?.mlbIntel?.homeEdge === "number" ? edge.projection.mlbIntel.homeEdge : null,
    edgeMatched: Boolean(edge.market),
    href: `/sim/mlb/${encodeURIComponent(edge.gameId)}`
  };
}

function buildCards(rows: SimPriorityRow[], edges: MarketEdge[]) {
  const edgeMap = new Map(edges.map((edge) => [edge.gameId, edge]));
  const cards = new Map<string, Card>();

  for (const row of rows) cards.set(row.id, { id: row.id, row, edge: edgeMap.get(row.id) ?? null });
  for (const edge of edges) if (!cards.has(edge.gameId)) cards.set(edge.gameId, { id: edge.gameId, row: rowFromEdge(edge), edge });

  return [...cards.values()].sort((left, right) => {
    const leftAction = String(asDisplayAction(left.edge, "all").action ?? "WATCH").toUpperCase();
    const rightAction = String(asDisplayAction(right.edge, "all").action ?? "WATCH").toUpperCase();
    const leftTime = dateFrom(left.row.startTime)?.getTime() ?? 0;
    const rightTime = dateFrom(right.row.startTime)?.getTime() ?? 0;
    return actionRank(rightAction) - actionRank(leftAction) || leftTime - rightTime;
  });
}

function cardDate(card: Card) {
  return chicagoKey(card.edge?.startTime ?? card.row.startTime);
}

function hasCardTotals(card: Card) {
  return edgeHasTotalMarket(card.edge);
}

function cardAction(card: Card, filter: ActionFilter) {
  if (!hasRealMarket(card.edge)) return "NO MARKET";
  return String(asDisplayAction(card.edge, filter).action ?? card.row.tier ?? "WATCH").toUpperCase();
}

function shouldShow(card: Card, filter: ActionFilter) {
  if (filter === "all") return true;
  if (filter === "totals") return hasCardTotals(card);
  const action = cardAction(card, filter);
  if (filter === "bets") return isBetAction(action);
  return action.toLowerCase() === filter;
}

function href(date: string, actionFilter: ActionFilter) {
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
  return <Link href={href} className={`rounded-xl border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${active ? "border-cyan-300/35 bg-cyan-300/12 text-cyan-100" : "border-white/10 bg-white/[0.03] text-slate-400"}`}>{children}</Link>;
}

function Tile({ label, value, note, ok = true }: { label: string; value: string | number; note: string; ok?: boolean }) {
  return <div className={`rounded-2xl border p-4 ${ok ? "border-white/10 bg-white/[0.03]" : "border-amber-300/20 bg-amber-300/[0.055]"}`}><div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div><div className="mt-2 font-mono text-2xl font-bold text-white">{value}</div><div className="mt-2 text-xs leading-5 text-slate-400">{note}</div></div>;
}

function ProviderPanel({ marketLineCount, marketEdges, totalsCount, statusReason, hasMarket }: { marketLineCount: number; marketEdges: number; totalsCount: number; statusReason?: string; hasMarket: boolean }) {
  if (hasMarket) return null;
  return (
    <section className="rounded-[1.5rem] border border-amber-300/20 bg-amber-300/[0.055] p-5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-200">Odds feed unavailable</div>
      <h2 className="mt-2 font-display text-2xl font-semibold text-white">Projection-only slate loaded.</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">No betting recommendations can be generated until sportsbook lines are joined. The page will not label projection rows as real bets.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Tile label="Lines" value={marketLineCount} note="Sportsbook rows" ok={false} />
        <Tile label="Edges" value={marketEdges} note="Market edge rows" ok={marketEdges > 0} />
        <Tile label="Totals" value={totalsCount} note="Priced total cards" ok={totalsCount > 0} />
      </div>
      {statusReason ? <p className="mt-3 text-xs leading-5 text-amber-100">Last refresh: {statusReason}</p> : null}
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href="/api/sim/refresh?force=1&wait=1" className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100">Refresh Sim</Link>
        <Link href="/api/odds/health" className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-200">Odds Health</Link>
        <Link href="/api/sim/debug" className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-200">Debug JSON</Link>
      </div>
    </section>
  );
}

function ProjectionCard({ card }: { card: Card }) {
  const projectedAway = typeof card.edge?.projection?.distribution?.avgAway === "number" ? card.edge.projection.distribution.avgAway : null;
  const projectedHome = typeof card.edge?.projection?.distribution?.avgHome === "number" ? card.edge.projection.distribution.avgHome : null;
  const projectedTotal = projectedAway != null && projectedHome != null ? projectedAway + projectedHome : typeof card.edge?.projection?.mlbIntel?.projectedTotal === "number" ? card.edge.projection.mlbIntel.projectedTotal : null;
  return (
    <article className="rounded-[1.35rem] border border-white/10 bg-slate-950/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-cyan-300/25 bg-cyan-300/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100">MLB</span>
            <span className={`rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${actionClass("NO MARKET")}`}>NO MARKET</span>
          </div>
          <h3 className="mt-3 font-display text-xl font-semibold text-white">{card.row.matchup.away} <span className="text-slate-600">@</span> {card.row.matchup.home}</h3>
          <div className="mt-1 text-xs text-slate-500">{time(card.edge?.startTime ?? card.row.startTime)} · {card.edge?.status ?? card.row.status}</div>
        </div>
        <Link href={card.row.href} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Open</Link>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <Tile label="Lean" value={card.row.lean.team} note={`${pct(card.row.lean.pct)} projected side`} />
        <Tile label="Projected" value={projectedAway != null && projectedHome != null ? `${projectedAway.toFixed(1)}-${projectedHome.toFixed(1)}` : "—"} note="Away-home sim runs" />
        <Tile label="Total" value={projectedTotal != null ? projectedTotal.toFixed(1) : "—"} note="Projected runs" />
        <Tile label="Confidence" value={pct(card.row.confidence)} note="Projection only" ok={false} />
      </div>
      <div className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.055] px-3 py-2 text-xs leading-5 text-amber-100">Sportsbook market was not joined. No EV, odds, stake, or betting action is available for this card.</div>
    </article>
  );
}

function GameCard({ card, filter }: { card: Card; filter: ActionFilter }) {
  if (!hasRealMarket(card.edge)) return <ProjectionCard card={card} />;

  const actionPayload = asDisplayAction(card.edge, filter);
  const action = String(actionPayload.action ?? card.row.tier ?? "WATCH").toUpperCase();
  const market = String(actionPayload.market ?? card.edge?.signal?.market ?? (filter === "totals" ? "total" : "signal")).toUpperCase();
  const expectedValue = typeof actionPayload.expectedValue === "number" ? actionPayload.expectedValue : null;
  const probabilityEdge = typeof actionPayload.edge === "number" ? actionPayload.edge : null;
  const projectedRunEdge = typeof actionPayload.projectedRunEdge === "number" ? actionPayload.projectedRunEdge : null;
  const americanOdds = typeof actionPayload.americanOdds === "number" ? actionPayload.americanOdds : null;
  const actionScore = typeof actionPayload.actionScore === "number" ? actionPayload.actionScore : null;
  const stakeUnits = typeof actionPayload.stakeUnits === "number" ? actionPayload.stakeUnits : 0;
  const reasons = Array.isArray(actionPayload.reasons) ? actionPayload.reasons.slice(0, 4) : [];
  const hardStops = Array.isArray(actionPayload.hardStopReasons) ? actionPayload.hardStopReasons.filter(Boolean) : [];
  const isTotalCard = filter === "totals" || market === "OVER" || market === "UNDER";

  return (
    <article className="rounded-[1.35rem] border border-white/10 bg-slate-950/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-cyan-300/25 bg-cyan-300/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100">{card.row.leagueKey}</span>
            <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-200">{market}</span>
            <span className={`rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${actionClass(action)}`}>{action}</span>
          </div>
          <h3 className="mt-3 font-display text-xl font-semibold text-white">{card.row.matchup.away} <span className="text-slate-600">@</span> {card.row.matchup.home}</h3>
          <div className="mt-1 text-xs text-slate-500">{time(card.edge?.startTime ?? card.row.startTime)} · {card.edge?.status ?? card.row.status}</div>
        </div>
        <Link href={card.row.href} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Open</Link>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-5">
        <Tile label="EV" value={signedPct(expectedValue)} note="Expected value" ok={expectedValue == null || expectedValue > 0} />
        <Tile label={isTotalCard ? "Run edge" : "Edge"} value={isTotalCard ? runEdge(projectedRunEdge) : signedPct(probabilityEdge)} note={isTotalCard ? "Projected vs total" : "Model vs market"} ok={probabilityEdge == null || probabilityEdge > 0} />
        <Tile label="Odds" value={odds(americanOdds)} note={String(actionPayload.sportsbook ?? card.edge?.sportsbook ?? "market")} />
        <Tile label="Stake" value={stakeUnits ? `${stakeUnits.toFixed(2)}u` : "0u"} note="Sizing" ok={isBetAction(action) ? stakeUnits > 0 : true} />
        <Tile label="Score" value={actionScore ?? "—"} note="Action score" />
      </div>

      <div className="mt-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs leading-5 text-slate-400">
        {reasons.length ? reasons.join(" · ") : `Lean ${card.row.lean.team} ${pct(card.row.lean.pct)} · confidence ${pct(card.row.confidence)}`}
        {hardStops.length ? <div className="mt-1 text-red-200">Hard stop: {hardStops.join(" · ")}</div> : null}
      </div>
    </article>
  );
}

export default async function FastSimHubPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const selectedDate = param(resolved, "date") === "all" ? "all" : param(resolved, "date") || relativeKey(0);
  const rawAction = String(param(resolved, "action") ?? "all").toLowerCase();
  const actionFilter = (ACTIONS as readonly string[]).includes(rawAction) ? rawAction as ActionFilter : "all";
  const { hub, priority, market, status } = await readSnapshots();

  const rows = priority?.rows ?? [];
  const marketEdges = (market?.edges ?? []) as MarketEdge[];
  const allCards = buildCards(rows, marketEdges);
  const dateCards = selectedDate === "all" ? allCards : allCards.filter((card) => cardDate(card) === selectedDate);
  const cards = dateCards.filter((card) => shouldShow(card, actionFilter));
  const availableDates = [...new Set(allCards.map(cardDate).filter((key) => key !== "unknown"))].sort();

  const betCount = dateCards.filter((card) => shouldShow(card, "bets")).length;
  const attackCount = dateCards.filter((card) => cardAction(card, "all") === "ATTACK").length;
  const playCount = dateCards.filter((card) => cardAction(card, "all") === "PLAY").length;
  const totalsCount = dateCards.filter(hasCardTotals).length;
  const realMarketCards = dateCards.filter((card) => hasRealMarket(card.edge)).length;
  const simAge = status?.lastSuccessAt ?? priority?.generatedAt ?? hub?.generatedAt ?? null;
  const simFresh = (ageMinutes(simAge) ?? 999) <= 20;
  const marketFresh = (ageMinutes(market?.generatedAt) ?? 999) <= 15;
  const hasRows = rows.length > 0 || marketEdges.length > 0;
  const hasMarket = Boolean(market?.lineCount && market.lineCount > 0 && realMarketCards > 0);

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/80 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">MLB Simulation Hub</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">SharkEdge Sim Hub</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Best bets, totals, and projection-only slate status. Betting cards require live sportsbook odds.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/api/sim/refresh?force=1&wait=1" className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100">Refresh Sim</Link>
            <Link href="/api/odds/health" className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Odds Health</Link>
            <Link href="/api/sim/debug" className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Debug</Link>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Tile label="Bets" value={hasMarket ? betCount : 0} note={hasMarket ? `${attackCount} attack · ${playCount} play` : "Odds required"} ok={hasMarket && betCount > 0} />
          <Tile label="Totals" value={hasMarket ? totalsCount : 0} note="Over/under cards" ok={hasMarket && totalsCount > 0} />
          <Tile label="Slate" value={dateCards.length} note={hasMarket ? `${realMarketCards} market joined` : "Projection-only"} ok={dateCards.length > 0} />
          <Tile label="Sim cache" value={simFresh ? "Fresh" : priority || marketEdges.length ? "Stale" : "Missing"} note={`Last success ${age(simAge)}`} ok={simFresh && hasRows} />
          <Tile label="Market cache" value={marketFresh ? "Fresh" : market ? "Stale" : "Missing"} note={`Generated ${age(market?.generatedAt)}`} ok={marketFresh && hasMarket} />
          <Tile label="MLB lines" value={market?.lineCount ?? 0} note={`${hub?.summary.mlbCount ?? priority?.summary.mlbCount ?? marketEdges.length} MLB games`} ok={hasMarket} />
        </div>
      </section>

      <ProviderPanel marketLineCount={market?.lineCount ?? 0} marketEdges={marketEdges.length} totalsCount={totalsCount} statusReason={status?.reason} hasMarket={hasMarket} />

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Filters</div>
            <h2 className="mt-1 font-display text-2xl font-semibold text-white">{dateLabel(selectedDate)} · {actionFilter.toUpperCase()}</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">Best Bets shows ATTACK + PLAY. Totals only appears when priced over/under data is joined.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={href(relativeKey(-1), actionFilter)} active={selectedDate === relativeKey(-1)}>Yesterday</ButtonLink>
            <ButtonLink href={href(relativeKey(0), actionFilter)} active={selectedDate === relativeKey(0)}>Today</ButtonLink>
            <ButtonLink href={href(relativeKey(1), actionFilter)} active={selectedDate === relativeKey(1)}>Tomorrow</ButtonLink>
            <ButtonLink href={href("all", actionFilter)} active={selectedDate === "all"}>All</ButtonLink>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {ACTIONS.map((value) => <ButtonLink key={value} href={href(selectedDate, value)} active={actionFilter === value}>{value}</ButtonLink>)}
        </div>
        <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="action" value={actionFilter} />
          <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Specific date</span><input type="date" name="date" defaultValue={selectedDate === "all" ? relativeKey(0) : selectedDate} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /></label>
          <button type="submit" className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100">Apply date</button>
          {availableDates.length ? <span className="text-xs text-slate-500">Available: {availableDates.map(dateLabel).join(" · ")}</span> : null}
        </form>
      </section>

      {!cards.length ? (
        <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-6">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">No cards</div>
          <h2 className="mt-2 font-display text-2xl font-semibold text-white">No cached cards match this filter.</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Rows: {rows.length}. Market edges: {marketEdges.length}. Lines: {market?.lineCount ?? 0}. Totals: {totalsCount}. Last refresh: {status?.reason ?? "no error recorded"}.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href={href(selectedDate, "all")} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">View all</Link>
            <Link href="/api/sim/refresh?force=1&wait=1" className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100">Refresh now</Link>
            <Link href="/api/odds/health" className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Odds Health</Link>
          </div>
        </section>
      ) : (
        <section className="grid gap-3 2xl:grid-cols-2">
          {cards.map((card) => <GameCard key={card.id} card={card} filter={actionFilter} />)}
        </section>
      )}
    </main>
  );
}
