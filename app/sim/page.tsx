import Link from "next/link";

import {
  SimDecisionBadge,
  SimMetricTile,
  SimSignalCard,
  SimStatusBadge,
  SimWorkspaceHeader
} from "@/components/sim/sim-ui";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils/cn";
import {
  readSimCache,
  SIM_CACHE_KEYS,
  type CachedSimGameProjection,
  type SimBoardSnapshot,
  type SimHubSnapshot,
  type SimMarketSnapshot,
  type SimPriorityRow,
  type SimPrioritySnapshot,
  type SimRefreshStatusSnapshot,
  type SimSnapshotEnvelope
} from "@/services/simulation/sim-snapshot-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const DISPLAY_TIME_ZONE = "America/Chicago";
const SIM_REFRESH_INTERVAL_MINUTES = 10;
const SIM_MARKET_REFRESH_INTERVAL_MINUTES = 5;

type WorkspaceConfig = {
  href: string;
  eyebrow: string;
  title: string;
  description: string;
  count: string;
  statusLabel: string;
  action: string;
  ready: boolean;
};


type SimSnapshots = {
  hub: SimHubSnapshot | null;
  priority: SimPrioritySnapshot | null;
  market: SimMarketSnapshot | null;
  status: SimRefreshStatusSnapshot | null;
  mlbBoard: SimBoardSnapshot | null;
};

type MarketEdge = NonNullable<SimMarketSnapshot["edges"]>[number];

type GameWorkspace = {
  key: string;
  row: SimPriorityRow;
  rows: SimPriorityRow[];
  duplicateCount: number;
  sortScore: number;
  edge: MarketEdge | null;
  boardGame: CachedSimGameProjection | null;
};

type GroupedGames = { label: string; key: string; games: GameWorkspace[] }[];

function formatPct(value: number | null | undefined) {
  return typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "—";
}

function dateFrom(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTime(value: string | null | undefined) {
  const date = dateFrom(value);
  if (!date) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(date);
}

function dateKey(value: string | null | undefined) {
  const date = dateFrom(value);
  if (!date) return "unknown";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function dateLabel(value: string | null | undefined) {
  const date = dateFrom(value);
  if (!date) return "Unknown date";
  const now = new Date();
  const todayKey = new Intl.DateTimeFormat("en-US", { timeZone: DISPLAY_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const tomorrowKey = new Intl.DateTimeFormat("en-US", { timeZone: DISPLAY_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now.getTime() + 86_400_000));
  const dk = dateKey(value);
  if (dk === todayKey) return "Today";
  if (dk === tomorrowKey) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", { timeZone: DISPLAY_TIME_ZONE, weekday: "long", month: "short", day: "numeric" }).format(date);
}

function formatShortTime(date: Date | null) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(date);
}

function ageMinutes(value: string | null | undefined) {
  const date = dateFrom(value);
  if (!date) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
}

function formatAge(value: string | null | undefined) {
  const minutes = ageMinutes(value);
  if (minutes === null) return "unknown";
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m ago` : `${hours}h ago`;
}

function nextExpectedRefresh(value: string | null | undefined, intervalMinutes: number) {
  const date = dateFrom(value);
  if (!date) return null;
  const intervalMs = intervalMinutes * 60_000;
  const elapsed = Date.now() - date.getTime();
  const steps = Math.max(1, Math.ceil(elapsed / intervalMs));
  return new Date(date.getTime() + steps * intervalMs);
}

function isStale(snapshot: Pick<SimSnapshotEnvelope<Record<string, never>>, "stale"> | null | undefined) {
  return Boolean(snapshot?.stale);
}

function mlbOnlyPriority(priority: SimPrioritySnapshot | null): SimPrioritySnapshot | null {
  if (!priority) return null;
  const rows = priority.rows.filter((row) => row.leagueKey === "MLB");
  return {
    ...priority,
    rows,
    summary: {
      ...priority.summary,
      rowCount: rows.length,
      gameCount: rows.length,
      nbaCount: 0,
      mlbCount: rows.length
    }
  };
}

async function readSnapshots(): Promise<SimSnapshots> {
  // Cache boundary: SimHub must never rebuild projections during a user request.
  // Heavy refresh work belongs to cron and the explicit /api/sim/refresh repair endpoint.
  const [hub, priority, market, status, mlbBoard] = await Promise.all([
    readSimCache<SimHubSnapshot>(SIM_CACHE_KEYS.hub),
    readSimCache<SimPrioritySnapshot>(SIM_CACHE_KEYS.priority),
    readSimCache<SimMarketSnapshot>(SIM_CACHE_KEYS.market),
    readSimCache<SimRefreshStatusSnapshot>(SIM_CACHE_KEYS.refreshStatus),
    readSimCache<SimBoardSnapshot>(SIM_CACHE_KEYS.mlbBoard)
  ]);
  return { hub, priority: mlbOnlyPriority(priority), market, status, mlbBoard };
}
function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
        ok
          ? "bg-mint shadow-[0_0_6px_rgba(74,227,181,0.55)]"
          : "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.45)]"
      )}
    />
  );
}

function StatusPill({ label, ok, sub }: { label: string; ok: boolean; sub?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <StatusDot ok={ok} />
      <span className="text-[11px] text-slate-400">
        <span className="font-medium text-slate-200">{label}</span>
        {sub ? <span className="ml-1 text-slate-600">{sub}</span> : null}
      </span>
    </div>
  );
}

function formatOdds(value: number | null | undefined): string {
  if (value == null) return "—";
  return value > 0 ? `+${value}` : `${value}`;
}

function runDelta(value: number | null | undefined): string {
  if (value == null) return "";
  const abs = Math.abs(value).toFixed(1);
  return value > 0 ? `+${abs}` : `-${abs}`;
}

function EdgeValue({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-slate-600">—</span>;
  const pct = value * 100;
  const color = pct > 1.5 ? "text-mint" : pct < -1.5 ? "text-crimson" : "text-slate-400";
  return (
    <span className={cn("tabular-nums font-semibold", color)}>
      {pct > 0 ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

function ConfidenceValue({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-slate-600">—</span>;
  const pct = value * 100;
  const color = pct >= 68 ? "text-mint" : pct >= 58 ? "text-amber-300" : "text-slate-400";
  return <span className={cn("tabular-nums font-semibold", color)}>{pct.toFixed(1)}%</span>;
}

function SimStatusRail({
  priority,
  market,
  status
}: {
  priority: SimPrioritySnapshot | null;
  market: SimMarketSnapshot | null;
  status: SimRefreshStatusSnapshot | null;
}) {
  const simGeneratedAt = status?.lastSuccessAt ?? priority?.generatedAt ?? status?.generatedAt ?? null;
  const marketGeneratedAt = market?.generatedAt ?? null;
  const nextSim = nextExpectedRefresh(simGeneratedAt, SIM_REFRESH_INTERVAL_MINUTES);
  const nextMarket = nextExpectedRefresh(marketGeneratedAt, SIM_MARKET_REFRESH_INTERVAL_MINUTES);
  const simOk = (ageMinutes(simGeneratedAt) ?? 999) <= 20;
  const marketOk = (ageMinutes(marketGeneratedAt) ?? 999) <= 10;
  const refreshOk = status?.ok !== false;
  const hasRows = (priority?.rows.length ?? 0) > 0;
  const allGood = simOk && marketOk && refreshOk && hasRows;

  return (
    <div className={cn("panel px-5 py-4", allGood ? "border-mint/[0.12]" : "border-amber-400/20")}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex items-center gap-2">
            <StatusDot ok={allGood} />
            <span className={cn("text-xs font-semibold uppercase tracking-[0.12em]", allGood ? "text-mint" : "text-amber-300")}>
              {allGood ? "System ready" : hasRows ? "Running stale" : "Degraded"}
            </span>
          </div>
          <div className="hidden h-3 w-px bg-white/10 sm:block" />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <StatusPill label="Sim" ok={simOk} sub={formatAge(simGeneratedAt)} />
            <StatusPill label="Market" ok={marketOk} sub={formatAge(marketGeneratedAt)} />
            <StatusPill label="MLB slate" ok={hasRows} sub={`${priority?.rows.length ?? 0} rows`} />
            <StatusPill label="Cron" ok={refreshOk} sub={status?.running ? "running" : refreshOk ? "ok" : "failed"} />
          </div>
        </div>
        <div className="text-[11px] tabular-nums text-slate-600">
          Next sim {formatShortTime(nextSim)} - market {formatShortTime(nextMarket)}
        </div>
      </div>
      {!hasRows ? (
        <div className="mt-3 rounded-lg border border-amber-400/15 bg-amber-500/[0.04] px-3 py-2 text-xs text-amber-200/80">
          No cached MLB priority snapshot is available. The hub is intentionally read-only, so use the scheduled refresh or `/api/sim/refresh` to rebuild instead of blocking this page request.
        </div>
      ) : null}
    </div>
  );
}
function SnapshotNotice({
  priority,
  status
}: {
  priority: SimPrioritySnapshot | null;
  status: SimRefreshStatusSnapshot | null;
}) {
  if (!priority && !status) return null;
  const stale = isStale(priority);
  const failed = status && !status.ok;
  if (!stale && !failed) return null;

  return (
    <SimSignalCard className="border-amber-400/25 bg-amber-500/[0.06]">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-amber-400" />
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-200">
            {failed ? "Snapshot protected" : "Showing cached snapshot"}
          </div>
          <p className="mt-1 text-xs leading-5 text-amber-100/70">
            {failed
              ? `Last refresh did not replace the cached slate${status.reason ? `: ${status.reason}` : "."}`
              : `Slate is older than the freshness window. Last success: ${formatAge(priority?.generatedAt)} (${formatTime(priority?.generatedAt)}).`}
          </p>
        </div>
      </div>
    </SimSignalCard>
  );
}

function WorkspaceCard({ config }: { config: WorkspaceConfig }) {
  return (
    <Link href={config.href} className="block h-full">
      <div className="panel group flex h-full flex-col p-5 transition-all hover:border-aqua/30 hover:bg-aqua/[0.015]">
        <div className="flex items-start justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-aqua/75">{config.eyebrow}</span>
          <StatusDot ok={config.ready} />
        </div>
        <div className="mt-4 font-display text-4xl font-bold tabular-nums leading-none tracking-tight text-white">{config.count}</div>
        <div className="mt-2 font-display text-[17px] font-semibold leading-snug text-white">{config.title}</div>
        <p className="mt-2 flex-1 text-xs leading-5 text-slate-500">{config.description}</p>
        <div className="mt-5 flex items-center justify-between border-t border-white/[0.07] pt-4">
          <span className="text-[10px] text-slate-600">{config.statusLabel}</span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-aqua/75 transition-colors group-hover:text-aqua">{config.action} →</span>
        </div>
      </div>
    </Link>
  );
}

function normalizeTeam(value: string | null | undefined) {
  return (value ?? "unknown").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function gameWorkspaceKey(row: SimPriorityRow) {
  const away = normalizeTeam(row.matchup.away);
  const home = normalizeTeam(row.matchup.home);
  return [row.leagueKey, dateKey(row.startTime), away, home].join("::");
}

function rowScore(row: SimPriorityRow) {
  const tierScore = row.tier === "A" ? 4 : row.tier === "B" ? 3 : row.tier === "C" ? 2 : 1;
  const edgeScore = Math.abs(row.lean.edge ?? 0) * 100;
  const confidenceScore = (row.confidence ?? 0) * 10;
  const marketScore = row.edgeMatched ? 1 : 0;
  return tierScore * 100 + edgeScore + confidenceScore + marketScore;
}

function buildGameWorkspaces(
  raw: SimPriorityRow[],
  edgeByGameId: Map<string, MarketEdge> = new Map(),
  boardByGameId: Map<string, CachedSimGameProjection> = new Map()
): GameWorkspace[] {
  const map = new Map<string, GameWorkspace>();

  for (const row of raw) {
    const key = gameWorkspaceKey(row);
    const score = rowScore(row);
    const existing = map.get(key);

    if (!existing) {
      map.set(key, {
        key,
        row,
        rows: [row],
        duplicateCount: 0,
        sortScore: score,
        edge: edgeByGameId.get(row.id) ?? null,
        boardGame: boardByGameId.get(row.id) ?? null
      });
      continue;
    }

    existing.rows.push(row);
    existing.duplicateCount = existing.rows.length - 1;

    if (score > existing.sortScore) {
      existing.row = row;
      existing.sortScore = score;
      existing.edge = edgeByGameId.get(row.id) ?? existing.edge;
      existing.boardGame = boardByGameId.get(row.id) ?? existing.boardGame;
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const aTime = dateFrom(a.row.startTime)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bTime = dateFrom(b.row.startTime)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return aTime - bTime || b.sortScore - a.sortScore;
  });
}

function groupGameWorkspaces(
  raw: SimPriorityRow[],
  edgeByGameId: Map<string, MarketEdge> = new Map(),
  boardByGameId: Map<string, CachedSimGameProjection> = new Map()
): GroupedGames {
  const workspaces = buildGameWorkspaces(raw, edgeByGameId, boardByGameId);
  const map = new Map<string, GameWorkspace[]>();

  for (const game of workspaces) {
    const key = dateKey(game.row.startTime);
    const existing = map.get(key) ?? [];
    existing.push(game);
    map.set(key, existing);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 4)
    .map(([key, games]) => ({ label: dateLabel(games[0]?.row.startTime), key, games }));
}

function MiniMetric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.018] px-3 py-2">
      <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-600">{label}</div>
      <div className="mt-1 text-sm text-white">{children}</div>
    </div>
  );
}

function GameWorkspaceCard({ game }: { game: GameWorkspace }) {
  const row = game.row;
  const edge = game.edge;
  const board = game.boardGame;
  const duplicateRows = game.rows.filter((candidate) => candidate.id !== row.id);
  const hasDuplicateRows = duplicateRows.length > 0;

  // Market data
  const homeML = edge?.market?.homeMoneyline ?? null;
  const awayML = edge?.market?.awayMoneyline ?? null;
  const marketTotal = edge?.market?.total ?? null;
  const totalRunEdge = edge?.edges?.totalRuns ?? null;
  const mlbProjTotal = (edge?.projection as { mlbIntel?: { projectedTotal?: number } } | undefined)?.mlbIntel?.projectedTotal
    ?? board?.projection?.mlbIntel?.projectedTotal
    ?? null;
  const nbaProjTotal = board?.projection?.nbaIntel?.projectedTotal ?? null;
  const projTotal = mlbProjTotal ?? nbaProjTotal ?? null;

  const hasMarketML = homeML !== null && awayML !== null;
  const hasMarketTotal = marketTotal !== null;

  // Which side does sim favor on moneyline
  const leanIsHome = row.lean.team === row.matchup.home;
  const otherTeam = leanIsHome ? row.matchup.away : row.matchup.home;
  const otherPct = Number((1 - row.lean.pct).toFixed(4));
  const leanMLEdge = leanIsHome ? (edge?.edges?.homeMoneyline ?? null) : (edge?.edges?.awayMoneyline ?? null);

  // Over/under lean
  const ouLean = totalRunEdge !== null ? (totalRunEdge > 0 ? "OVER" : "UNDER") : null;

  // Best signal label
  const signal = edge?.signal ?? null;
  let signalLabel: string | null = null;
  if (signal) {
    if (signal.market === "over" && totalRunEdge !== null) signalLabel = `OVER ${runDelta(totalRunEdge)} runs`;
    else if (signal.market === "under" && totalRunEdge !== null) signalLabel = `UNDER ${runDelta(Math.abs(totalRunEdge))} runs`;
    else if (signal.market === "home_ml") signalLabel = `HOME ML ${formatPct(edge?.edges?.homeMoneyline)}`;
    else if (signal.market === "away_ml") signalLabel = `AWAY ML ${formatPct(edge?.edges?.awayMoneyline)}`;
  }

  // Verdict
  const verdictText = row.tier === "attack" ? "BET" : row.tier === "watch" ? "WATCH" : "PASS";
  const verdictColor = row.tier === "attack" ? "text-mint" : row.tier === "watch" ? "text-amber-300" : "text-slate-500";
  const signalStrength = (signal as { strength?: string } | null)?.strength ?? null;

  return (
    <article className="panel overflow-hidden p-0 transition-colors hover:border-aqua/20">
      <div className="border-b border-white/[0.07] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center rounded-sm border border-aqua/25 bg-aqua/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-[0.08em] text-aqua">
                {row.leagueKey}
              </span>
              <SimDecisionBadge tier={row.tier} />
              <SimStatusBadge status={row.status} />
              {game.duplicateCount > 0 ? (
                <span className="rounded-sm border border-amber-400/20 bg-amber-400/[0.07] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-200">
                  {game.duplicateCount + 1} signals merged
                </span>
              ) : null}
            </div>
            <h3 className="mt-2 font-display text-xl font-semibold tracking-tight text-white">
              {row.matchup.away} <span className="font-normal text-slate-600">@</span> {row.matchup.home}
            </h3>
            <div className="mt-1 text-[11px] tabular-nums text-slate-500">{formatTime(row.startTime)}</div>
          </div>

          <Link
            href={row.href}
            className="rounded-full border border-aqua/25 bg-aqua/[0.06] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-aqua transition-colors hover:bg-aqua/[0.12]"
          >
            Open game hub
          </Link>
        </div>
      </div>

      <div className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Win % */}
        <MiniMetric label="Sim Win %">
          <div className="font-semibold leading-none">{row.lean.team}</div>
          <div className="mt-1.5 text-lg font-bold tabular-nums leading-none text-white">{formatPct(row.lean.pct)}</div>
          <div className="mt-1 text-[11px] tabular-nums text-slate-500">{otherTeam} {formatPct(otherPct)}</div>
        </MiniMetric>

        {/* Moneyline */}
        <MiniMetric label="Moneyline">
          {hasMarketML ? (
            <>
              <div className="font-semibold tabular-nums leading-none">
                <span className="text-slate-400">{row.matchup.away}</span>{" "}
                <span className="text-white">{formatOdds(awayML)}</span>
              </div>
              <div className="mt-1.5 font-semibold tabular-nums leading-none">
                <span className="text-slate-400">{row.matchup.home}</span>{" "}
                <span className="text-white">{formatOdds(homeML)}</span>
              </div>
              {leanMLEdge !== null ? (
                <div className="mt-1 text-[11px] tabular-nums text-slate-500">
                  Sim edge: <EdgeValue value={leanMLEdge} />
                </div>
              ) : null}
            </>
          ) : (
            <span className="text-slate-500">{row.leagueKey === "NBA" ? "See NBA desk" : "No line"}</span>
          )}
        </MiniMetric>

        {/* Over / Under */}
        <MiniMetric label="Over / Under">
          {hasMarketTotal ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-white">Line {marketTotal}</span>
                {ouLean ? (
                  <span className={cn("text-xs font-bold uppercase tracking-wide", ouLean === "OVER" ? "text-mint" : "text-amber-300")}>
                    → {ouLean}
                  </span>
                ) : null}
              </div>
              {projTotal !== null ? (
                <div className="mt-1 text-[11px] tabular-nums text-slate-500">
                  Proj {projTotal.toFixed(1)}{totalRunEdge !== null ? ` (${runDelta(totalRunEdge)})` : ""}
                </div>
              ) : null}
            </>
          ) : projTotal !== null ? (
            <>
              <div className="font-semibold text-white">{projTotal.toFixed(1)} proj</div>
              <div className="mt-1 text-[11px] text-slate-500">no market line</div>
            </>
          ) : (
            <span className="text-slate-500">{row.leagueKey === "NBA" ? "See NBA desk" : "—"}</span>
          )}
        </MiniMetric>

        {/* Sim Verdict */}
        <MiniMetric label="Sim Verdict">
          <div className={cn("text-2xl font-bold tracking-wide leading-none", verdictColor)}>{verdictText}</div>
          {signalLabel ? (
            <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-300">{signalLabel}</div>
          ) : null}
          {signalStrength && signalStrength !== "thin" ? (
            <div className={cn("mt-1 text-[10px] font-semibold uppercase tracking-[0.12em]", signalStrength === "strong" ? "text-mint/70" : "text-amber-300/60")}>
              {signalStrength} signal
            </div>
          ) : null}
          {!signalLabel ? (
            <div className="mt-1 text-[11px] text-slate-600">
              {formatPct(row.confidence)} conf · <ConfidenceValue value={row.confidence} />
            </div>
          ) : null}
        </MiniMetric>
      </div>

      {hasDuplicateRows ? (
        <details className="group border-t border-white/[0.07] px-5 py-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 marker:hidden hover:text-aqua">
            <span>{game.duplicateCount + 1} signals merged</span>
            <span className="text-slate-700 group-open:hidden">Show</span>
            <span className="hidden text-slate-700 group-open:inline">Hide</span>
          </summary>
          <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.06]">
            <div className="grid grid-cols-4 gap-2 border-b border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">
              <span>Tier</span>
              <span>Lean</span>
              <span>Edge</span>
              <span>Confidence</span>
            </div>
            {duplicateRows.map((candidate) => (
              <div key={candidate.id} className="grid grid-cols-4 gap-2 px-3 py-2 text-xs text-slate-400 odd:bg-white/[0.01]">
                <span>{candidate.tier}</span>
                <span>{candidate.lean.team}</span>
                <span><EdgeValue value={candidate.lean.edge} /></span>
                <span><ConfidenceValue value={candidate.confidence} /></span>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </article>
  );
}

function DateGroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{label}</span>
        <span className="text-[10px] text-slate-700">{count} game{count !== 1 ? "s" : ""}</span>
      </div>
    </div>
  );
}

function PrioritySlate({
  priority,
  edgeByGameId,
  boardByGameId
}: {
  priority: SimPrioritySnapshot | null;
  edgeByGameId: Map<string, MarketEdge>;
  boardByGameId: Map<string, CachedSimGameProjection>;
}) {
  if (!priority?.rows.length) {
    return (
      <EmptyState
        eyebrow="Sim cache"
        title="No games in the priority queue"
        description="No cached MLB sim snapshot has been generated yet. SimHub no longer rebuilds projections during page load; run the sim refresh job and check /api/sim/health."
      />
    );
  }

  const groups = groupGameWorkspaces(priority.rows, edgeByGameId, boardByGameId);
  const uniqueCount = groups.reduce((n, g) => n + g.games.length, 0);
  const rawCount = priority.rows.length;
  const mergedCount = Math.max(0, rawCount - uniqueCount);

  return (
    <section className="space-y-4">
      <div className="panel px-5 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-aqua/70">Unified slate</div>
            <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-white">One game card per matchup</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {priority.stale
                ? "Showing last successful snapshot — live cron has not yet refreshed."
                : `${uniqueCount} matchup${uniqueCount !== 1 ? "s" : ""} · ${mergedCount} duplicate signal${mergedCount !== 1 ? "s" : ""} collapsed · ranked inside each game workspace`}
            </p>
          </div>
          <div className="text-[11px] tabular-nums text-slate-600">{formatAge(priority.generatedAt)}</div>
        </div>
      </div>

      {groups.map((group) => (
        <div key={group.key} className="space-y-3">
          <DateGroupHeader label={group.label} count={group.games.length} />
          <div className="grid gap-3 2xl:grid-cols-2">
            {group.games.map((game) => (
              <GameWorkspaceCard key={game.key} game={game} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

export default async function SimHubPage() {
  const { hub, priority, market, status, mlbBoard } = await readSnapshots();

  const edgeByGameId = new Map<string, MarketEdge>(
    (market?.edges ?? []).map((e) => [e.gameId, e])
  );
  const boardByGameId = new Map<string, CachedSimGameProjection>([
    ...((mlbBoard?.games ?? []) as CachedSimGameProjection[]).map((g) => [g.game.id, g] as [string, CachedSimGameProjection]),
  ]);

  const unifiedGames = priority?.rows.length ? buildGameWorkspaces(priority.rows).length : 0;
  const duplicateSignals = Math.max(0, (priority?.rows.length ?? 0) - unifiedGames);

  const workspaces: WorkspaceConfig[] = [
    {
      href: "/sim/mlb",
      eyebrow: "MLB Workspace",
      title: "Sides + Totals Edge Desk",
      description: "Moneyline edge, totals, Statcast splits, Savant pitcher profiles, and live market matching.",
      count: String(hub?.summary.mlbCount ?? priority?.summary.mlbCount ?? "-"),
      statusLabel: market?.stale ? "Market overlay stale" : `${market?.lineCount ?? 0} market lines`,
      action: "Open MLB desk",
      ready: !market?.stale && (market?.lineCount ?? 0) > 0
    },
    {
      href: "/sharktrends",
      eyebrow: "MLB Trends",
      title: "Trend Warehouse",
      description: "Historical betting rows, closing-line movement, system matches, and trend validation.",
      count: String(market?.edges.length ?? "-"),
      statusLabel: "Market-linked systems",
      action: "Open trends",
      ready: (market?.edges.length ?? 0) > 0
    },
    {
      href: "/sim/accuracy",
      eyebrow: "Model Proof",
      title: "Accuracy Lab",
      description: "Brier, log loss, closing-line value, settlement, and promotion-gate evidence for MLB picks.",
      count: String(priority?.rows.length ?? "-"),
      statusLabel: "MLB validation",
      action: "Open accuracy",
      ready: (priority?.rows.length ?? 0) > 0
    }
  ];
  return (
    <div className="space-y-5">
      <SimWorkspaceHeader
        eyebrow="Simulation Command"
        title="SharkEdge Sim Hub"
        description="A consolidated market workspace: one card per matchup, duplicate signals merged, and deeper analysis hidden until the user opens the game."
        actions={[
          { href: "/api/sim/health", label: "Health JSON", tone: "secondary" },
          { href: "/sim/evaluation", label: "Accuracy", tone: "secondary" }
        ]}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SimMetricTile
            label="Hub snapshot"
            value={hub ? (hub.stale ? "Stale" : "Fresh") : "Missing"}
            sub={hub ? formatAge(hub.generatedAt) : "no data"}
            emphasis={hub && !hub.stale ? "strong" : "normal"}
          />
          <SimMetricTile
            label="Unique games"
            value={unifiedGames}
            sub={`${duplicateSignals} duplicate signals merged`}
            emphasis={unifiedGames > 0 ? "strong" : "normal"}
          />
          <SimMetricTile
            label="MLB market"
            value={market ? (market.stale ? "Stale" : "Fresh") : "Missing"}
            sub={`5-min overlay · ${formatAge(market?.generatedAt)}`}
            emphasis={market && !market.stale ? "strong" : "normal"}
          />
          <SimMetricTile
            label="MLB rows"
            value={priority?.rows.length ?? 0}
            sub="NBA/UFC excluded from hub"
            emphasis={(priority?.rows.length ?? 0) > 0 ? "strong" : "normal"}
          />
        </div>
      </SimWorkspaceHeader>

      <SimStatusRail
        priority={priority}
        market={market}
        status={status}
      />

      <SnapshotNotice priority={priority} status={status} />

      <section className="grid gap-4 xl:grid-cols-3">
        {workspaces.map((workspace) => (
          <WorkspaceCard key={workspace.href} config={workspace} />
        ))}
      </section>

      <PrioritySlate priority={priority} edgeByGameId={edgeByGameId} boardByGameId={boardByGameId} />
    </div>
  );
}
