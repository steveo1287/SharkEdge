import { TrendsDashboardV3 } from "@/components/trends/trends-dashboard-v3";
import type { LeagueKey, TrendFilters, TrendMode } from "@/lib/types/domain";
import { trendFiltersSchema } from "@/lib/validation/filters";
import { getFastCachedTrendDashboard, getTrendDashboardCacheHealth } from "@/services/trends/dashboard-cache";
import { readTrendRefreshStatus } from "@/services/trends/refresh-status";
import { inspectTrendSystemGradeQueue } from "@/services/trends/trend-system-grader";
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

type GradeQueueSummary = Awaited<ReturnType<typeof inspectTrendSystemGradeQueue>> | null;

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

async function getGradeQueueSummary(): Promise<GradeQueueSummary> {
  try {
    return await inspectTrendSystemGradeQueue({ limit: 500 });
  } catch {
    return null;
  }
}

function cycleText(cycleStatus: Awaited<ReturnType<typeof readTrendSystemCycleStatus>>) {
  if (!cycleStatus) return "no cycle status yet";
  const state = cycleStatus.running ? "running" : cycleStatus.ok ? "ok" : "failed";
  return `${state} · last success ${formatStatusTime(cycleStatus.lastSuccessAt)} · captured ${cycleStatus.summary.capturedMatches} · closing ${cycleStatus.summary.closingLinesUpdated} · graded ${cycleStatus.summary.gradedMatches} · snapshots ${cycleStatus.summary.snapshotsWritten} · saved ${cycleStatus.summary.totalSavedGradedRows}/${cycleStatus.summary.totalSavedRows} graded · open ${cycleStatus.summary.totalOpenRows} · fallback ${cycleStatus.summary.seededFallback}`;
}

function bucketValue(queue: GradeQueueSummary, key: string) {
  const buckets = queue && "buckets" in queue && queue.buckets ? queue.buckets as Record<string, number> : {};
  return buckets[key] ?? 0;
}

function queueNextAction(queue: GradeQueueSummary) {
  if (!queue || !("ok" in queue) || !queue.ok) return "Grade queue unavailable. Check database connectivity.";
  if (bucketValue(queue, "gradeable")) return "Rows are gradeable now. Run the grade endpoint or full cycle.";
  if (bucketValue(queue, "missing-event-result")) return "Rows are blocked by missing final EventResult. Backfill final results first.";
  if (bucketValue(queue, "unmapped-pick")) return "Rows have final results but pick/team mapping needs repair.";
  if (bucketValue(queue, "missing-total-or-line")) return "Rows need final total or captured line data before grading.";
  return queue.nextAction ?? "No grade blockers reported.";
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
          <div className="mt-1 text-slate-300"><span className="font-semibold uppercase tracking-[0.14em]">Signals</span><span className="ml-2">{signalText}</span>{cacheHitText ? <span className="ml-2 text-slate-500">({cacheHitText})</span> : null}</div>
          <div className="mt-1 text-slate-300"><span className="font-semibold uppercase tracking-[0.14em]">Systems</span><span className="ml-2">{systemText}</span></div>
          <div className="mt-1 text-slate-300"><span className="font-semibold uppercase tracking-[0.14em]">Cycle</span><span className="ml-2">{cycleText(cycleStatus)}</span></div>
        </div>
        <div className="flex flex-wrap gap-3">
          <a href="/api/trends/cache-health?signals=true" className="font-semibold uppercase tracking-[0.14em] text-sky-200 hover:text-sky-100">Health JSON</a>
          <a href="/api/trends/signal-health" className="font-semibold uppercase tracking-[0.14em] text-sky-200 hover:text-sky-100">Signal Health</a>
          <a href="/api/trends/systems?ledger=true&inactive=true" className="font-semibold uppercase tracking-[0.14em] text-sky-200 hover:text-sky-100">Systems JSON</a>
          <a href="/api/trends/systems/grade?inspect=true&limit=500" className="font-semibold uppercase tracking-[0.14em] text-sky-200 hover:text-sky-100">Grade Queue</a>
          <a href="/api/trends/systems/cycle-status" className="font-semibold uppercase tracking-[0.14em] text-sky-200 hover:text-sky-100">Cycle Status</a>
          <a href="/api/trends/systems/cycle?inactive=true&limit=500" className="font-semibold uppercase tracking-[0.14em] text-sky-200 hover:text-sky-100">Run Cycle</a>
          <a href="/api/trends/refresh-cache" className="font-semibold uppercase tracking-[0.14em] text-sky-200 hover:text-sky-100">Queue refresh</a>
        </div>
      </div>
    </div>
  );
}

function TruthTile({ label, value, note, tone = "neutral" }: { label: string; value: string | number; note: string; tone?: "good" | "warn" | "bad" | "neutral" }) {
  const toneClass = tone === "good" ? "border-emerald-400/20 bg-emerald-400/7" : tone === "warn" ? "border-amber-300/25 bg-amber-300/7" : tone === "bad" ? "border-red-400/20 bg-red-400/7" : "border-white/10 bg-slate-950/60";
  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 font-display text-2xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{note}</div>
    </div>
  );
}

function LedgerTruthPanel({
  signalSummary,
  systemSummary,
  cycleStatus,
  gradeQueue
}: {
  signalSummary: SignalSummary | null;
  systemSummary: SystemLedgerSummary | null;
  cycleStatus: Awaited<ReturnType<typeof readTrendSystemCycleStatus>>;
  gradeQueue: GradeQueueSummary;
}) {
  const verifiedSystems = (systemSummary?.savedLedgerBacked ?? 0) + (systemSummary?.eventMarketBacked ?? 0);
  const seeded = systemSummary?.seededFallback ?? 0;
  const savedRows = systemSummary?.totalSavedRows ?? cycleStatus?.summary.totalSavedRows ?? 0;
  const savedGraded = systemSummary?.totalSavedGradedRows ?? cycleStatus?.summary.totalSavedGradedRows ?? 0;
  const openRows = systemSummary?.totalOpenRows ?? cycleStatus?.summary.totalOpenRows ?? 0;
  const eventMarketRows = systemSummary?.totalEventMarketRows ?? 0;
  const eventMarketGraded = systemSummary?.totalEventMarketGradedRows ?? 0;
  const pricedSignals = signalSummary?.pricedSignals ?? 0;
  const signalCount = signalSummary?.totalVisible ?? 0;
  const liveGames = signalSummary?.gamesCovered ?? 0;
  const gradeable = bucketValue(gradeQueue, "gradeable");
  const missingResults = bucketValue(gradeQueue, "missing-event-result");
  const unmapped = bucketValue(gradeQueue, "unmapped-pick");
  const missingLine = bucketValue(gradeQueue, "missing-total-or-line");
  const proofTone = verifiedSystems > 0 ? "good" : savedRows > 0 || eventMarketRows > 0 ? "warn" : "bad";

  return (
    <section className="mb-5 rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">Ledger truth</div>
          <h2 className="mt-2 font-display text-2xl font-semibold text-white">What is proven vs. what is still starter data</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">This separates verified history, open rows, seeded starter systems, live current-game signals, and the exact reason open rows are not graded yet.</p>
        </div>
        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Source: {systemSummary?.source ?? "unavailable"}</div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <TruthTile label="Verified systems" value={verifiedSystems} tone={proofTone} note={`${systemSummary?.savedLedgerBacked ?? 0} saved-ledger backed · ${systemSummary?.eventMarketBacked ?? 0} EventMarket backed. These can support real record/ROI claims.`} />
        <TruthTile label="Saved ledger" value={`${savedGraded}/${savedRows}`} tone={savedRows && savedGraded === 0 ? "warn" : savedGraded ? "good" : "neutral"} note={`${openRows} open rows still need grading. Open rows are excluded from ROI until settled.`} />
        <TruthTile label="Seeded starter systems" value={seeded} tone={seeded ? "warn" : "good"} note={seeded ? "These are useful starter systems, not verified database-backed performance claims yet." : "All visible systems have ledger/backtest provenance."} />
        <TruthTile label="Live signal coverage" value={`${pricedSignals}/${signalCount}`} tone={pricedSignals ? "good" : signalCount ? "warn" : "bad"} note={`${liveGames} current games covered. Priced signals can move toward actionable; unpriced signals stay watchlist/context.`} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <TruthTile label="Historical backtest rows" value={`${eventMarketGraded}/${eventMarketRows}`} tone={eventMarketGraded ? "good" : eventMarketRows ? "warn" : "neutral"} note="EventMarket/EventResult rows can upgrade seeded systems into database-backed trend cards when sample size clears the floor." />
        <TruthTile label="Cycle grading" value={cycleStatus ? `${cycleStatus.summary.gradedMatches}` : "N/A"} tone={cycleStatus?.summary.gradedMatches ? "good" : cycleStatus?.summary.totalOpenRows ? "warn" : "neutral"} note={cycleStatus ? `${cycleStatus.summary.capturedMatches} captured · ${cycleStatus.summary.closingLinesUpdated} closing-line updates · ${cycleStatus.summary.totalOpenRows} open.` : "No cycle snapshot available yet."} />
        <TruthTile label="Next credibility gate" value={savedGraded || eventMarketGraded ? "prove ROI" : "grade rows"} tone={savedGraded || eventMarketGraded ? "good" : "warn"} note={savedGraded || eventMarketGraded ? "Now sort and badge cards by verified/provisional status." : "Run capture/closing/grade until open saved rows become settled rows."} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <TruthTile label="Gradeable now" value={gradeable} tone={gradeable ? "good" : "neutral"} note="Open rows with EventResult data that should be able to settle now." />
        <TruthTile label="Missing results" value={missingResults} tone={missingResults ? "warn" : "good"} note="Rows waiting on final EventResult. This is the main blocker when games are not settled into wins/losses." />
        <TruthTile label="Mapping blockers" value={unmapped} tone={unmapped ? "warn" : "good"} note="Rows where the pick side cannot be mapped cleanly to a participant/winner." />
        <TruthTile label="Line blockers" value={missingLine} tone={missingLine ? "warn" : "good"} note="Total rows missing final score total or captured line. These need data repair before grading." />
      </div>

      <div className="mt-4 rounded-2xl border border-sky-300/15 bg-sky-300/[0.04] p-3 text-xs leading-5 text-sky-100/80">
        <span className="font-semibold uppercase tracking-[0.14em] text-sky-200">Grade queue next:</span> {queueNextAction(gradeQueue)} <a href="/api/trends/systems/grade?inspect=true&limit=500" className="ml-2 font-semibold text-sky-200 hover:text-sky-100">Inspect JSON</a>
      </div>
    </section>
  );
}

export default async function TrendsPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const filters = buildFilters(resolved);
  const aiQuery = readValue(resolved, "q")?.trim() ?? "";
  const savedTrendId = readValue(resolved, "savedTrendId")?.trim() ?? null;
  const mode = readMode(readValue(resolved, "mode"));
  const options = { mode, aiQuery, savedTrendId };

  const [{ payload }, health, refreshStatus, signalSummary, systemSummary, cycleStatus, gradeQueue] = await Promise.all([
    getFastCachedTrendDashboard(filters, options),
    getTrendDashboardCacheHealth(filters, options),
    readTrendRefreshStatus(),
    getSignalSummary(filters),
    getSystemLedgerSummary(filters),
    readTrendSystemCycleStatus(),
    getGradeQueueSummary()
  ]);

  return (
    <>
      <CacheStatusStrip status={health.effectiveStatus} exactCards={health.exact.cards} modeDefaultCards={health.modeDefault.cards} age={health.exact.ageSeconds ?? health.modeDefault.ageSeconds} refreshStatus={refreshStatus} cacheVersion={health.cacheVersion} signalSummary={signalSummary} systemSummary={systemSummary} cycleStatus={cycleStatus} />
      <LedgerTruthPanel signalSummary={signalSummary} systemSummary={systemSummary} cycleStatus={cycleStatus} gradeQueue={gradeQueue} />
      <TrendsDashboardV3 data={payload} />
    </>
  );
}
