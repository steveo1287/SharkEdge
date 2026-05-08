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

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const DISPLAY_TIME_ZONE = "America/Chicago";
const ACTIONS = ["bets", "totals", "all", "attack", "play", "lean", "watch", "pass"] as const;

type ActionFilter = typeof ACTIONS[number];
type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };
type MarketEdge = NonNullable<SimMarketSnapshot>["edges"][number] & {
  signal?: Record<string, any>;
  totalsAction?: Record<string, any> | null;
  market?: Record<string, any>;
  sportsbook?: string | null;
  gameId: string;
};
type GameWorkspace = { key: string; row: SimPriorityRow; edge: MarketEdge | null; rows: SimPriorityRow[]; duplicateCount: number; sortScore: number };

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

function teamKey(value: string | null | undefined) {
  return (value ?? "unknown").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function workspaceKey(row: SimPriorityRow) {
  return [row.leagueKey, chicagoKey(row.startTime), teamKey(row.matchup.away), teamKey(row.matchup.home)].join("::");
}

function selectedAction(edge: MarketEdge | null, filter: ActionFilter) {
  const signal = edge?.signal ?? null;
  if (filter === "totals") return (edge?.totalsAction ?? {}) as Record<string, any>;
  return (signal?.takeAction ?? signal ?? {}) as Record<string, any>;
}

function hasTotals(edge: MarketEdge | null) {
  return Boolean(edge?.totalsAction);
}

function action(edge: MarketEdge | null, row: SimPriorityRow, filter: ActionFilter = "all") {
  const raw = String(selectedAction(edge, filter).action ?? "").toUpperCase();
  if (["ATTACK", "PLAY", "LEAN", "WATCH", "PASS"].includes(raw)) return raw as "ATTACK" | "PLAY" | "LEAN" | "WATCH" | "PASS";
  const tier = row.tier?.toLowerCase();
  if (tier === "attack") return "ATTACK";
  if (tier === "watch") return "WATCH";
  if (tier === "pass") return "PASS";
  return "WATCH";
}

function actionRank(value: string) {
  if (value === "ATTACK") return 6;
  if (value === "PLAY") return 5;
  if (value === "LEAN") return 4;
  if (value === "WATCH") return 3;
  if (value === "PASS") return 1;
  return 2;
}

function actionClass(value: string) {
  if (value === "ATTACK") return "border-emerald-300/35 bg-emerald-300/10 text-emerald-100";
  if (value === "PLAY") return "border-cyan-300/35 bg-cyan-300/10 text-cyan-100";
  if (value === "LEAN") return "border-sky-300/25 bg-sky-300/8 text-sky-100";
  if (value === "WATCH") return "border-amber-300/25 bg-amber-300/8 text-amber-100";
  return "border-white/10 bg-white/[0.03] text-slate-300";
}

function shouldShow(game: GameWorkspace, filter: ActionFilter) {
  if (filter === "all") return true;
  if (filter === "totals") return hasTotals(game.edge);
  const current = action(game.edge, game.row).toLowerCase();
  if (filter === "bets") return current === "attack" || current === "play";
  return current === filter;
}

function href(date: string, actionFilter: ActionFilter) {
  return `/sim-fast?date=${encodeURIComponent(date)}&action=${actionFilter}`;
}

function buildEdgeMap(edges: MarketEdge[]) {
  const map = new Map<string, MarketEdge>();
  for (const edge of edges) map.set(edge.gameId, edge);
  return map;
}

function score(row: SimPriorityRow, edge: MarketEdge | null) {
  return actionRank(action(edge, row)) * 1000 + Math.abs(row.lean.edge ?? 0) * 100 + (row.confidence ?? 0) * 10 + (row.edgeMatched ? 1 : 0);
}

function buildGames(rows: SimPriorityRow[], edgeMap: Map<string, MarketEdge>): GameWorkspace[] {
  const map = new Map<string, GameWorkspace>();
  for (const row of rows) {
    const key = workspaceKey(row);
    const edge = edgeMap.get(row.id) ?? null;
    const sortScore = score(row, edge);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { key, row, edge, rows: [row], duplicateCount: 0, sortScore });
      continue;
    }
    existing.rows.push(row);
    existing.duplicateCount = existing.rows.length - 1;
    if (sortScore > existing.sortScore) {
      existing.row = row;
      existing.edge = edge;
      existing.sortScore = sortScore;
    }
  }
  return [...map.values()].sort((left, right) => {
    const timeDiff = (dateFrom(left.row.startTime)?.getTime() ?? 0) - (dateFrom(right.row.startTime)?.getTime() ?? 0);
    return right.sortScore - left.sortScore || timeDiff;
  });
}

function groupGames(games: GameWorkspace[]) {
  const map = new Map<string, GameWorkspace[]>();
  for (const game of games) {
    const key = chicagoKey(game.row.startTime);
    map.set(key, [...(map.get(key) ?? []), game]);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, games]) => ({ key, label: dateLabel(key), games }));
}

function dateOptions(rows: SimPriorityRow[]) {
  return [...new Set(rows.map((row) => chicagoKey(row.startTime)).filter((key) => key !== "unknown"))].sort();
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

function GameCard({ game, filter }: { game: GameWorkspace; filter: ActionFilter }) {
  const row = game.row;
  const edge = game.edge;
  const ta = selectedAction(edge, filter);
  const currentAction = action(edge, row, filter);
  const expectedValue = typeof ta.expectedValue === "number" ? ta.expectedValue : null;
  const modelEdge = typeof ta.edge === "number" ? ta.edge : row.lean.edge ?? null;
  const stakeUnits = typeof ta.stakeUnits === "number" ? ta.stakeUnits : 0;
  const actionScore = typeof ta.actionScore === "number" ? ta.actionScore : null;
  const americanOdds = typeof ta.americanOdds === "number" ? ta.americanOdds : null;
  const projectedRunEdge = typeof ta.projectedRunEdge === "number" ? ta.projectedRunEdge : null;
  const marketLabel = String(ta.market ?? edge?.signal?.market ?? "signal").toUpperCase();
  const reasons = Array.isArray(ta.reasons) ? ta.reasons.slice(0, 3) : [];
  const hardStops = Array.isArray(ta.hardStopReasons) ? ta.hardStopReasons : [];
  const downgrades = Array.isArray(ta.downgradeReasons) ? ta.downgradeReasons.slice(0, 2) : [];

  return (
    <article className="rounded-[1.35rem] border border-white/10 bg-slate-950/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-cyan-300/25 bg-cyan-300/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100">{row.leagueKey}</span>
            <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-200">{marketLabel}</span>
            <span className={`rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${actionClass(currentAction)}`}>{currentAction}</span>
            {game.duplicateCount > 0 ? <span className="rounded-md border border-amber-300/20 bg-amber-300/[0.07] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-100">{game.duplicateCount + 1} merged</span> : null}
          </div>
          <h3 className="mt-3 font-display text-xl font-semibold text-white">{row.matchup.away} <span className="text-slate-600">@</span> {row.matchup.home}</h3>
          <div className="mt-1 text-xs text-slate-500">{time(row.startTime)} · {row.status}</div>
        </div>
        <Link href={row.href} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Open</Link>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-5">
        <Tile label="EV" value={signedPct(expectedValue)} note="Expected value" ok={expectedValue == null || expectedValue > 0} />
        <Tile label={filter === "totals" ? "Run edge" : "Edge"} value={filter === "totals" ? runEdge(projectedRunEdge) : signedPct(modelEdge)} note={filter === "totals" ? "Projected vs total" : "Model vs market"} ok={modelEdge == null || modelEdge > 0} />
        <Tile label="Odds" value={odds(americanOdds)} note={String(ta.sportsbook ?? edge?.sportsbook ?? "market")} />
        <Tile label="Stake" value={stakeUnits ? `${stakeUnits.toFixed(2)}u` : "0u"} note="Quarter-Kelly cap" ok={currentAction === "ATTACK" || currentAction === "PLAY" ? stakeUnits > 0 : true} />
        <Tile label="Score" value={actionScore ?? "—"} note="Action score" />
      </div>

      <div className="mt-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs leading-5 text-slate-400">
        {reasons.length ? reasons.join(" · ") : `Lean ${row.lean.team} ${pct(row.lean.pct)} · confidence ${pct(row.confidence)}`}
        {downgrades.length ? <div className="mt-1 text-amber-200">Downgrade: {downgrades.join(" · ")}</div> : null}
        {hardStops.length ? <div className="mt-1 text-red-200">Hard stop: {hardStops.join(" · ")}</div> : null}
      </div>
    </article>
  );
}

function EmptyState({ actionFilter, selectedDate, hasRows, hasMarket, statusReason }: { actionFilter: ActionFilter; selectedDate: string; hasRows: boolean; hasMarket: boolean; statusReason?: string }) {
  const cacheProblem = !hasRows || !hasMarket;
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-6">
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">{cacheProblem ? "Snapshot not ready" : `No ${actionFilter.toUpperCase()} cards`}</div>
      <h2 className="mt-2 font-display text-2xl font-semibold text-white">{cacheProblem ? "Sim or market cache is missing." : "No plays match this filter."}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
        {cacheProblem
          ? "This is not a betting verdict. The page does not have a usable priority snapshot and market overlay yet. Refresh the sim, then reload this page."
          : actionFilter === "totals"
            ? "Totals exist only when the odds overlay has a market total plus over/under prices. If this is empty after refresh, the odds source is not returning totals for this slate."
            : "This filter has no cards under the current EV gates."}
      </p>
      {statusReason ? <p className="mt-2 text-xs leading-5 text-amber-200">Last refresh: {statusReason}</p> : null}
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href={href(selectedDate, "all")} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">View all</Link>
        <Link href={href(selectedDate, "totals")} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">View totals</Link>
        <Link href="/api/sim/refresh?force=1&wait=1" className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100">Refresh now</Link>
      </div>
    </section>
  );
}

export default async function FastSimHubPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const selectedDate = param(resolved, "date") === "all" ? "all" : param(resolved, "date") || relativeKey(0);
  const rawAction = String(param(resolved, "action") ?? "all").toLowerCase();
  const actionFilter = (ACTIONS as readonly string[]).includes(rawAction) ? rawAction as ActionFilter : "all";
  const { hub, priority, market, status } = await readSnapshots();

  const rows = priority?.rows ?? [];
  const edgeMap = buildEdgeMap((market?.edges ?? []) as MarketEdge[]);
  const dateRows = selectedDate === "all" ? rows : rows.filter((row) => chicagoKey(row.startTime) === selectedDate);
  const allGames = buildGames(dateRows, edgeMap);
  const games = allGames.filter((game) => shouldShow(game, actionFilter));
  const groups = groupGames(games);
  const betCount = allGames.filter((game) => shouldShow(game, "bets")).length;
  const attackCount = allGames.filter((game) => action(game.edge, game.row) === "ATTACK").length;
  const playCount = allGames.filter((game) => action(game.edge, game.row) === "PLAY").length;
  const totalsCount = allGames.filter((game) => hasTotals(game.edge)).length;
  const simAge = status?.lastSuccessAt ?? priority?.generatedAt ?? hub?.generatedAt ?? null;
  const simFresh = (ageMinutes(simAge) ?? 999) <= 20;
  const marketFresh = (ageMinutes(market?.generatedAt) ?? 999) <= 15;
  const hasRows = rows.length > 0;
  const hasMarket = Boolean(market?.lineCount && market.lineCount > 0);
  const availableDates = dateOptions(rows);

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/80 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Simulation Command</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">SharkEdge Sim Hub</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Action-aware sim board. ATTACK and PLAY are bettable tiers; Totals shows over/under even when moneyline is the top signal.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/api/sim/refresh?force=1&wait=1" className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100">Refresh Sim</Link>
            <Link href="/sim/accuracy" className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Accuracy</Link>
            <Link href="/api/sim/health" className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Health JSON</Link>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Tile label="Bets" value={betCount} note={`${attackCount} attack · ${playCount} play`} ok={betCount > 0} />
          <Tile label="Totals" value={totalsCount} note="Over/under cards" ok={totalsCount > 0} />
          <Tile label="Visible" value={games.length} note={`${allGames.length} games on selected date`} ok={games.length > 0} />
          <Tile label="Sim cache" value={simFresh ? "Fresh" : priority ? "Stale" : "Missing"} note={`Last success ${age(simAge)}`} ok={simFresh && hasRows} />
          <Tile label="Market cache" value={marketFresh ? "Fresh" : market ? "Stale" : "Missing"} note={`Generated ${age(market?.generatedAt)}`} ok={marketFresh && hasMarket} />
          <Tile label="MLB lines" value={market?.lineCount ?? 0} note={`${hub?.summary.mlbCount ?? priority?.summary.mlbCount ?? 0} MLB games`} ok={hasMarket} />
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Filters</div>
            <h2 className="mt-1 font-display text-2xl font-semibold text-white">{dateLabel(selectedDate)} · {actionFilter.toUpperCase()}</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">Use Totals to inspect over/under. Use Bets to show ATTACK + PLAY only.</p>
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

      {!games.length ? (
        <EmptyState actionFilter={actionFilter} selectedDate={selectedDate} hasRows={hasRows} hasMarket={hasMarket} statusReason={status?.reason} />
      ) : (
        <section className="grid gap-4">
          {groups.map((group) => <div key={group.key} className="grid gap-3">{selectedDate === "all" ? <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{group.label} · {group.games.length} game{group.games.length !== 1 ? "s" : ""}</div> : null}<div className="grid gap-3 2xl:grid-cols-2">{group.games.map((game) => <GameCard key={game.key} game={game} filter={actionFilter} />)}</div></div>)}
        </section>
      )}
    </main>
  );
}
