import { TrendsDashboardV3 } from "@/components/trends/trends-dashboard-v3";
import type { LeagueKey, TrendFilters, TrendMode } from "@/lib/types/domain";
import { trendFiltersSchema } from "@/lib/validation/filters";
import { getFastCachedTrendDashboard, getTrendDashboardCacheHealth } from "@/services/trends/dashboard-cache";
import { readTrendRefreshStatus } from "@/services/trends/refresh-status";
import { readTrendSystemCycleStatus } from "@/services/trends/trend-system-cycle-status";
import { buildTrendSignals } from "@/services/trends/trends-engine";
import { buildTrendSystemRun } from "@/services/trends/trend-system-engine";
import { runTrendSystemBacktests } from "@/services/trends/trend-system-ledger";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type SignalSummary = {
  source: string;
  cacheStale: boolean;
  cacheHits: { nba: boolean; mlb: boolean; market: boolean };
  totalVisible: number;
  totalRaw: number;
  hidden: number;
  gamesCovered: number;
  pricedSignals: number;
  actionable: number;
  watchlist: number;
};

type SystemLedgerSummary = {
  source: string;
  systems: number;
  activeSystems: number;
  activeMatches: number;
  savedLedgerBacked: number;
  eventMarketBacked: number;
  seededFallback: number;
  totalSavedRows: number;
  totalSavedGradedRows: number;
  totalOpenRows: number;
  totalEventMarketRows: number;
  totalEventMarketGradedRows: number;
};

function readValue(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function buildFilters(searchParams: Record<string, string | string[] | undefined>) {
  try {
    return trendFiltersSchema.parse({
      sport: readValue(searchParams, "sport"),
      league: readValue(searchParams, "league"),
      market: readValue(searchParams, "market"),
      sportsbook: readValue(searchParams, "sportsbook"),
      side: readValue(searchParams, "side"),
      subject: readValue(searchParams, "subject"),
      team: readValue(searchParams, "team"),
      player: readValue(searchParams, "player"),
      fighter: readValue(searchParams, "fighter"),
      opponent: readValue(searchParams, "opponent"),
      window: readValue(searchParams, "window"),
      sample: readValue(searchParams, "sample")
    });
  } catch {
    return trendFiltersSchema.parse({}) as TrendFilters;
  }
}

function readMode(value: string | undefined): TrendMode {
  return value === "power" ? "power" : "simple";
}

function ageLabel(seconds: number | null) {
  if (seconds === null) return "not warmed";
  if (seconds < 60) return `${seconds}s old`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m old`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m old` : `${hours}h old`;
}

function formatStatusTime(value: string | null | undefined) {
  if (!value) return "never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

async function getSignalSummary(filters: TrendFilters): Promise<SignalSummary | null> {
  try {
    const league = filters.league === "ALL" ? "ALL" : filters.league as LeagueKey;
    const payload = await buildTrendSignals({ league, includeHidden: false, includeResearch: false });
    const signals = payload.signals;
    const gameIds = new Set(signals.map((signal) => signal.gameId).filter(Boolean));
    const priced = signals.filter((signal) => signal.marketQuality.currentOddsAmerican != null || signal.currentOddsAmerican != null);
    const actionable = signals.filter((signal) => signal.quality.actionability === "ACTIONABLE");
    const watchlist = signals.filter((signal) => signal.quality.actionability === "WATCHLIST");
    return {
      source: payload.counts.source,
      cacheStale: Boolean(payload.counts.cacheStale),
      cacheHits: payload.counts.cacheHits,
      totalVisible: signals.length,
      totalRaw: payload.counts.totalRaw,
      hidden: payload.counts.hiddenQuality,
      gamesCovered: gameIds.size,
      pricedSignals: priced.length,
      actionable: actionable.length,
      watchlist: watchlist.length
    };
  } catch {
    return null;
  }
}

async function getSystemLedgerSummary(filters: TrendFilters): Promise<SystemLedgerSummary | null> {
  try {
    const league = filters.league === "ALL" ? "ALL" : filters.league as LeagueKey;
    const run = await buildTrendSystemRun({ league, includeInactive: true });
    const backtests = await runTrendSystemBacktests(run.systems, { preferSaved: true });
    const source = backtests.summary.savedLedgerBacked
      ? "saved-ledger"
      : backtests.summary.eventMarketBacked
        ? "event-market-backtest"
        : "seeded-fallback";

    return {
      source,
      systems: backtests.summary.systems,
      activeSystems: run.summary.activeSystems,
      activeMatches: run.summary.activeMatches,
      savedLedgerBacked: backtests.summary.savedLedgerBacked,
      eventMarketBacked: backtests.summary.eventMarketBacked,
      seededFallback: backtests.summary.seededFallback,
      totalSavedRows: backtests.summary.totalSavedRows,
      totalSavedGradedRows: backtests.summary.totalSavedGradedRows,
      totalOpenRows: backtests.summary.totalOpenRows,
      totalEventMarketRows: backtests.summary.totalEventMarketRows,
      totalEventMarketGradedRows: backtests.summary.totalEventMarketGradedRows
    };
  } catch {
    return null;
  }
}

function cycleText(cycleStatus: Awaited<ReturnType<typeof readTrendSystemCycleStatus>>) {
  if (!cycleStatus) return "no cycle status yet";
  const state = cycleStatus.running ? "running" : cycleStatus.ok ? "ok" : "failed";
  return `${state} · last success ${formatStatusTime(cycleStatus.lastSuccessAt)} · captured ${cycleStatus.summary.capturedMatches} · closing ${cycleStatus.summary.closingLinesUpdated} · graded ${cycleStatus.summary.gradedMatches} · snapshots ${cycleStatus.summary.snapshotsWritten} · saved ${cycleStatus.summary.totalSavedGradedRows}/${cycleStatus.summary.totalSavedRows} graded · open ${cycleStatus.summary.totalOpenRows} · fallback ${cycleStatus.summary.seededFallback}`;
}

function CacheStatusStrip({
  status,
  modeDefaultCards,
  exactCards,
  age,
  refreshStatus,
  cacheVersion,
  signalSummary,
  systemSummary,
  cycleStatus
}: {
  status: string;
  modeDefaultCards: number;
  exactCards: number;
  age: number | null;
  refreshStatus: Awaited<ReturnType<typeof readTrendRefreshStatus>>;
  cacheVersion: string;
  signalSummary: SignalSummary | null;
  systemSummary: SystemLedgerSummary | null;
  cycleStatus: Awaited<ReturnType<typeof readTrendSystemCycleStatus>>;
}) {
  const ready = status === "exact" || status === "mode-default";
  const running = Boolean(refreshStatus?.running || refreshStatus?.queued || cycleStatus?.running);
  const hasSignals = Boolean(signalSummary?.totalVisible);
  const hasActionable = Boolean(signalSummary?.actionable);
  const cycleHealthy = Boolean(cycleStatus?.ok || cycleStatus?.running);
  const tone = hasActionable || cycleStatus?.summary.gradedMatches
    ? "border-emerald-400/25 bg-emerald-400/7 text-emerald-100"
    : hasSignals || cycleHealthy
      ? "border-sky-300/25 bg-sky-400/7 text-sky-100"
      : ready
        ? "border-amber-300/20 bg-amber-400/5 text-amber-100"
        : running
          ? "border-sky-300/20 bg-sky-400/5 text-sky-100"
          : "border-amber-300/20 bg-amber-400/5 text-amber-100";
  const refreshText = running
    ? refreshStatus?.queued ? "refresh queued" : cycleStatus?.running ? "cycle running" : "refresh running"
    : refreshStatus?.ok ? `last good ${formatStatusTime(refreshStatus.lastSuccessAt)}` : refreshStatus?.reason ?? "refresh not started";
  const signalText = signalSummary
    ? `${signalSummary.source}${signalSummary.cacheStale ? " stale" : ""} · ${signalSummary.gamesCovered} games · ${signalSummary.totalVisible} signals · ${signalSummary.pricedSignals} priced · ${signalSummary.actionable} actionable · ${signalSummary.watchlist} watchlist · hidden ${signalSummary.hidden}`
    : "signal summary unavailable";
  const cacheHitText = signalSummary
    ? `NBA ${signalSummary.cacheHits.nba ? "hit" : "miss"} · MLB ${signalSummary.cacheHits.mlb ? "hit" : "miss"} · market ${signalSummary.cacheHits.market ? "hit" : "miss"}`
    : "";
  const systemText = systemSummary
    ? `${systemSummary.source} · ${systemSummary.systems} systems · ${systemSummary.activeSystems} active · ${systemSummary.activeMatches} matches · saved ${systemSummary.totalSavedGradedRows}/${systemSummary.totalSavedRows} graded · open ${systemSummary.totalOpenRows} · EventMarket ${systemSummary.totalEventMarketGradedRows}/${systemSummary.totalEventMarketRows} graded · fallback ${systemSummary.seededFallback}`
    : "system ledger unavailable";
  return (
    <div className={`mb-4 rounded-2xl border px-4 py-3 text-xs leading-5 ${tone}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-semibold uppercase tracking-[0.18em]">Trend cache</span>
          <span className="ml-2 text-slate-300">{status} · {cacheVersion} · exact {exactCards} cards · default {modeDefaultCards} cards · {ageLabel(age)} · {refreshText}</span>
          <div className="mt-1 text-slate-300">
            <span className="font-semibold uppercase tracking-[0.14em]">Signals</span>
            <span className="ml-2">{signalText}</span>
            {cacheHitText ? <span className="ml-2 text-slate-500">({cacheHitText})</span> : null}
          </div>
          <div className="mt-1 text-slate-300">
            <span className="font-semibold uppercase tracking-[0.14em]">Systems</span>
            <span className="ml-2">{systemText}</span>
          </div>
          <div className="mt-1 text-slate-300">
            <span className="font-semibold uppercase tracking-[0.14em]">Cycle</span>
            <span className="ml-2">{cycleText(cycleStatus)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <a href="/api/trends/cache-health?signals=true" className="font-semibold uppercase tracking-[0.14em] text-sky-200 hover:text-sky-100">Health JSON</a>
          <a href="/api/trends/signal-health" className="font-semibold uppercase tracking-[0.14em] text-sky-200 hover:text-sky-100">Signal Health</a>
          <a href="/api/trends/systems?ledger=true&inactive=true" className="font-semibold uppercase tracking-[0.14em] text-sky-200 hover:text-sky-100">Systems JSON</a>
          <a href="/api/trends/systems/cycle-status" className="font-semibold uppercase tracking-[0.14em] text-sky-200 hover:text-sky-100">Cycle Status</a>
          <a href="/api/trends/systems/cycle?inactive=true&limit=500" className="font-semibold uppercase tracking-[0.14em] text-sky-200 hover:text-sky-100">Run Cycle</a>
          <a href="/api/trends/refresh-cache" className="font-semibold uppercase tracking-[0.14em] text-sky-200 hover:text-sky-100">Queue refresh</a>
        </div>
      </div>
    </div>
  );
}

export default async function TrendsPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const filters = buildFilters(resolved);
  const aiQuery = readValue(resolved, "q")?.trim() ?? "";
  const savedTrendId = readValue(resolved, "savedTrendId")?.trim() ?? null;
  const mode = readMode(readValue(resolved, "mode"));
  const options = { mode, aiQuery, savedTrendId };

  const [{ payload }, health, refreshStatus, signalSummary, systemSummary, cycleStatus] = await Promise.all([
    getFastCachedTrendDashboard(filters, options),
    getTrendDashboardCacheHealth(filters, options),
    readTrendRefreshStatus(),
    getSignalSummary(filters),
    getSystemLedgerSummary(filters),
    readTrendSystemCycleStatus()
  ]);

  return (
    <>
      <CacheStatusStrip
        status={health.effectiveStatus}
        exactCards={health.exact.cards}
        modeDefaultCards={health.modeDefault.cards}
        age={health.exact.ageSeconds ?? health.modeDefault.ageSeconds}
        refreshStatus={refreshStatus}
        cacheVersion={health.cacheVersion}
        signalSummary={signalSummary}
        systemSummary={systemSummary}
        cycleStatus={cycleStatus}
      />
      <TrendsDashboardV3 data={payload} />
    </>
  );
}
