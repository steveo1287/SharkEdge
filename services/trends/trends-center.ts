import { buildSavedTrendHref, listSavedTrendRows } from "@/services/trends/saved-systems";
import { buildTrendSystemRun } from "@/services/trends/trend-system-engine";

const STALE_RUN_HOURS = 24;
const RECENT_RUN_HOURS = 24;

type SavedTrendRow = Awaited<ReturnType<typeof listSavedTrendRows>>[number];
type PublishedTrendSystem = Awaited<ReturnType<typeof buildTrendSystemRun>>["systems"][number];

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

function rowHref(row: SavedTrendRow) {
  return buildSavedTrendHref(row.id, row.filters, row.mode, row.aiQuery);
}

function systemHref(system: PublishedTrendSystem) {
  const params = new URLSearchParams({
    sport: system.filters.sport,
    league: system.filters.league,
    market: system.filters.market,
    side: system.filters.side,
    window: system.filters.window,
    sample: String(system.filters.sample),
    mode: "power"
  });
  return `/trends?${params.toString()}`;
}

function sortByNewestRun(rows: SavedTrendRow[]) {
  return [...rows].sort((left, right) => {
    const leftTime = parseTime(left.lastRunAt) ?? parseTime(left.updatedAt) ?? 0;
    const rightTime = parseTime(right.lastRunAt) ?? parseTime(right.updatedAt) ?? 0;
    return rightTime - leftTime;
  });
}

function systemCategory(system: PublishedTrendSystem) {
  return String(system.category ?? "").toUpperCase();
}

function systemActionability(system: PublishedTrendSystem) {
  return String(system.actionability ?? "").toUpperCase();
}

function promotionScore(system: PublishedTrendSystem) {
  let score = 0;
  const activeMatches = system.activeMatches.length;
  const actionability = systemActionability(system);
  const category = systemCategory(system);
  if (activeMatches) score += 300 + activeMatches * 25;
  if (system.verified) score += 220;
  if (actionability.includes("ACTIVE") || actionability.includes("REVIEW")) score += 160;
  if (actionability.includes("WATCH")) score += 70;
  if (category.includes("EDGE")) score += 45;
  if (category.includes("MARKET")) score += 30;
  if (category.includes("SITUATION") || category.includes("SYSTEM")) score += 20;
  if (!activeMatches) score -= 180;
  return score;
}

function promotionTier(system: PublishedTrendSystem) {
  if (system.activeMatches.length > 0 && system.verified) return "promote";
  if (system.activeMatches.length > 0) return "watch";
  if (system.verified) return "verified-idle";
  return "bench";
}

function promotionReason(system: PublishedTrendSystem) {
  const parts = [];
  if (system.activeMatches.length) parts.push(`${system.activeMatches.length} live qualifier${system.activeMatches.length === 1 ? "" : "s"}`);
  else parts.push("no current qualifier");
  parts.push(system.verified ? "verified" : "unverified/provisional");
  parts.push(`${systemActionability(system).toLowerCase() || "unknown"} action gate`);
  return parts.join(" · ");
}

function promotionBoard(systems: PublishedTrendSystem[]) {
  return [...systems]
    .map((system) => ({
      id: system.id,
      name: system.name,
      sport: system.sport,
      league: system.league,
      market: system.market,
      category: system.category,
      actionability: system.actionability,
      activeMatches: system.activeMatches.length,
      verified: system.verified,
      score: promotionScore(system),
      tier: promotionTier(system),
      reason: promotionReason(system),
      href: systemHref(system)
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 12);
}

export type TrendsCenterSnapshot = Awaited<ReturnType<typeof buildTrendsCenterSnapshot>>;

export async function buildTrendsCenterSnapshot() {
  const now = Date.now();
  const [savedRows, publishedRun] = await Promise.all([
    listSavedTrendRows(),
    buildTrendSystemRun({ includeInactive: true })
  ]);

  const savedActive = savedRows.filter((row) => !row.archivedAt);
  const savedArchived = savedRows.filter((row) => row.archivedAt);
  const neverRun = savedActive.filter((row) => !row.lastRunAt);
  const stale = savedActive.filter((row) => {
    const age = hoursSince(row.lastRunAt, now);
    return age === null || age >= STALE_RUN_HOURS;
  });
  const recent = savedActive.filter((row) => {
    const age = hoursSince(row.lastRunAt, now);
    return age !== null && age < RECENT_RUN_HOURS;
  });
  const power = savedActive.filter((row) => row.mode === "power");
  const simple = savedActive.filter((row) => row.mode === "simple");

  const publishedSystems = publishedRun.systems;
  const publishedActive = publishedSystems.filter((system) => system.activeMatches.length > 0);
  const publishedInactive = publishedSystems.filter((system) => system.activeMatches.length === 0);
  const publishedActionable = publishedSystems.filter((system) => systemActionability(system).includes("ACTIVE") || systemActionability(system).includes("REVIEW"));
  const publishedWatchlist = publishedSystems.filter((system) => systemActionability(system).includes("WATCH"));
  const verifiedPublished = publishedSystems.filter((system) => system.verified);
  const board = promotionBoard(publishedSystems);
  const promotableSystems = board.filter((system) => system.tier === "promote");
  const watchSystems = board.filter((system) => system.tier === "watch");
  const benchSystems = board.filter((system) => system.tier === "bench" || system.tier === "verified-idle");

  const runCoveragePct = savedActive.length ? Math.round((recent.length / savedActive.length) * 100) : 0;
  const freshnessRiskPct = savedActive.length ? Math.round((stale.length / savedActive.length) * 100) : 0;

  const commandQueue = [
    ...neverRun.slice(0, 5).map((row) => ({
      id: row.id,
      name: row.name,
      reason: "saved-never-run",
      priority: 1,
      href: rowHref(row),
      note: "Saved trend has no recorded run yet. Run it before trusting its card."
    })),
    ...stale.filter((row) => row.lastRunAt).slice(0, 5).map((row) => ({
      id: row.id,
      name: row.name,
      reason: "saved-stale-run",
      priority: 2,
      href: rowHref(row),
      note: `Last saved run is ${Math.round(hoursSince(row.lastRunAt, now) ?? 0)}h old. Refresh before using it.`
    })),
    ...publishedInactive.slice(0, 5).map((system) => ({
      id: system.id,
      name: system.name,
      reason: "published-no-current-match",
      priority: 3,
      href: systemHref(system),
      note: "Published system is in inventory but has no current qualifying match. Keep it below active systems."
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
      total: publishedSystems.length,
      active: publishedActive.length,
      archived: savedArchived.length,
      power: power.length,
      simple: simple.length,
      neverRun: neverRun.length,
      stale: stale.length,
      recent: recent.length,
      savedTotal: savedRows.length,
      savedActive: savedActive.length,
      publishedTotal: publishedSystems.length,
      publishedActive: publishedActive.length,
      publishedInactive: publishedInactive.length,
      publishedActionable: publishedActionable.length,
      publishedWatchlist: publishedWatchlist.length,
      verifiedPublished: verifiedPublished.length,
      promotableSystems: promotableSystems.length,
      watchSystems: watchSystems.length,
      benchSystems: benchSystems.length,
      activeMatches: publishedRun.summary.activeMatches
    },
    coverage: {
      runCoveragePct,
      freshnessRiskPct,
      publishedActivePct: publishedSystems.length ? Math.round((publishedActive.length / publishedSystems.length) * 100) : 0,
      publishedVerifiedPct: publishedSystems.length ? Math.round((verifiedPublished.length / publishedSystems.length) * 100) : 0,
      promotablePct: publishedSystems.length ? Math.round((promotableSystems.length / publishedSystems.length) * 100) : 0
    },
    distribution: {
      bySport: countBy(publishedSystems.map((system) => system.sport)),
      byLeague: publishedRun.summary.byLeague,
      byMarket: countBy(publishedSystems.map((system) => system.market)),
      byMode: countBy(savedActive.map((row) => row.mode)),
      byCategory: publishedRun.summary.byCategory,
      byPromotionTier: countBy(board.map((system) => system.tier)),
      savedBySport: countBy(savedActive.map((row) => row.sport)),
      savedByLeague: countBy(savedActive.map((row) => row.filters.league)),
      savedByMarket: countBy(savedActive.map((row) => row.filters.market))
    },
    newestRuns: sortByNewestRun(savedActive).slice(0, 8).map((row) => ({
      id: row.id,
      name: row.name,
      sport: row.sport,
      league: row.filters.league,
      market: row.filters.market,
      mode: row.mode,
      lastRunAt: row.lastRunAt,
      archivedAt: row.archivedAt,
      href: rowHref(row)
    })),
    activeSystems: publishedActive.slice(0, 8).map((system) => ({
      id: system.id,
      name: system.name,
      sport: system.sport,
      league: system.league,
      market: system.market,
      category: system.category,
      actionability: system.actionability,
      activeMatches: system.activeMatches.length,
      verified: system.verified,
      href: systemHref(system)
    })),
    promotionBoard: board,
    commandQueue,
    nextAction: promotableSystems.length
      ? "Promote the top promotionBoard systems first; they have live qualifiers plus verification support."
      : watchSystems.length
        ? "Live systems exist but are not verified yet. Keep them watchlist until ledger proof improves."
        : commandQueue.length
          ? "Refresh saved rows and keep inactive published systems below active systems until current matches return."
          : publishedActive.length
            ? "Published system inventory is active. Next step is rank by verified ledger proof, ROI, and current price quality."
            : "Published systems exist, but none have current matches. Run sim/market refresh before promotion."
  };
}
