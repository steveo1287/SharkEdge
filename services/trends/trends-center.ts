import { listSavedTrendRows } from "@/services/trends/saved-systems";

const STALE_RUN_HOURS = 24;
const RECENT_RUN_HOURS = 24;

function countBy<T extends string>(items: T[]) {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[item] = (acc[item] ?? 0) + 1;
    return acc;
  }, {});
}

function parseTime(value: string | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function hoursSince(value: string | null | undefined, now = Date.now()) {
  const time = parseTime(value);
  if (time === null) return null;
  return Math.max(0, (now - time) / 36e5);
}

function sortByNewestRun<T extends { lastRunAt: string | null; updatedAt: string }>(rows: T[]) {
  return [...rows].sort((left, right) => {
    const leftTime = parseTime(left.lastRunAt) ?? parseTime(left.updatedAt) ?? 0;
    const rightTime = parseTime(right.lastRunAt) ?? parseTime(right.updatedAt) ?? 0;
    return rightTime - leftTime;
  });
}

export type TrendsCenterSnapshot = Awaited<ReturnType<typeof buildTrendsCenterSnapshot>>;

export async function buildTrendsCenterSnapshot() {
  const now = Date.now();
  const rows = await listSavedTrendRows();
  const active = rows.filter((row) => !row.archivedAt);
  const archived = rows.filter((row) => row.archivedAt);
  const neverRun = active.filter((row) => !row.lastRunAt);
  const stale = active.filter((row) => {
    const age = hoursSince(row.lastRunAt, now);
    return age === null || age >= STALE_RUN_HOURS;
  });
  const recent = active.filter((row) => {
    const age = hoursSince(row.lastRunAt, now);
    return age !== null && age < RECENT_RUN_HOURS;
  });
  const power = active.filter((row) => row.mode === "power");
  const simple = active.filter((row) => row.mode === "simple");
  const currentMatches = active.reduce((total, row) => total + (row.currentMatchCount ?? 0), 0);
  const rowsWithMatches = active.filter((row) => row.currentMatchCount > 0);
  const runCoveragePct = active.length ? Math.round((recent.length / active.length) * 100) : 0;
  const matchCoveragePct = active.length ? Math.round((rowsWithMatches.length / active.length) * 100) : 0;
  const commandQueue = [
    ...neverRun.slice(0, 5).map((row) => ({
      id: row.id,
      name: row.name,
      reason: "never-run",
      priority: 1,
      href: row.href,
      note: "Saved system has no recorded run yet. Run it before trusting its card."
    })),
    ...stale.filter((row) => row.lastRunAt).slice(0, 5).map((row) => ({
      id: row.id,
      name: row.name,
      reason: "stale-run",
      priority: 2,
      href: row.href,
      note: `Last run is ${Math.round(hoursSince(row.lastRunAt, now) ?? 0)}h old. Refresh before using it.``
    })),
    ...active.filter((row) => row.currentMatchCount === 0).slice(0, 5).map((row) => ({
      id: row.id,
      name: row.name,
      reason: "no-current-match",
      priority: 3,
      href: row.href,
      note: "No live/current match found for this system right now."
    }))
  ]
    .sort((left, right) => left.priority - right.priority)
    .slice(0, 8);

  return {
    ok: true,
    generatedAt: new Date(now).toISOString(),
    thresholds: {
      staleRunHours: STALE_RUN_HOURS,
      recentRunHours: RECENT_RUN_HOURS
    },
    counts: {
      total: rows.length,
      active: active.length,
      archived: archived.length,
      power: power.length,
      simple: simple.length,
      neverRun: neverRun.length,
      stale: stale.length,
      recent: recent.length,
      rowsWithMatches: rowsWithMatches.length,
      currentMatches
    },
    coverage: {
      runCoveragePct,
      matchCoveragePct
    },
    distribution: {
      bySport: countBy(active.map((row) => row.sport)),
      byLeague: countBy(active.map((row) => row.filters.league)),
      byMarket: countBy(active.map((row) => row.filters.market)),
      byMode: countBy(active.map((row) => row.mode))
    },
    newestRuns: sortByNewestRun(active).slice(0, 8).map((row) => ({
      id: row.id,
      name: row.name,
      sport: row.sport,
      league: row.filters.league,
      market: row.filters.market,
      mode: row.mode,
      currentMatchCount: row.currentMatchCount,
      lastRunAt: row.lastRunAt,
      archivedAt: row.archivedAt,
      href: row.href
    })),
    commandQueue,
    nextAction: commandQueue.length
      ? "Refresh or inspect the commandQueue systems before promoting them in Trends Center."
      : active.length
        ? "Saved systems are current enough for dashboard promotion. Next step is rank by verified ledger proof."
        : "No active saved trend systems yet. Create saved systems from the strongest trend queries."
  };
}
