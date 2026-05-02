import { buildSavedTrendHref, listSavedTrendRows } from "@/services/trends/saved-systems";
import { buildTrendSystemRun } from "@/services/trends/trend-system-engine";

const STALE_RUN_HOURS = 24;
const RECENT_RUN_HOURS = 24;
const PRODUCT_NAME = "SharkTrends";
const PROMOTION_BOARD_LIMIT = 12;
const MATCHUP_TREND_LIMIT = 6;

type SavedTrendRow = Awaited<ReturnType<typeof listSavedTrendRows>>[number];
type PublishedTrendSystem = Awaited<ReturnType<typeof buildTrendSystemRun>>["systems"][number];
type TrendMatch = PublishedTrendSystem["activeMatches"][number];
type PlacementTier = "promote" | "watch" | "verified-idle" | "bench";

type MatchupTrendRow = ReturnType<typeof buildTrendRow>;

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

function trendDetailHref(system: PublishedTrendSystem, match?: TrendMatch) {
  const params = new URLSearchParams({
    systemId: system.id,
    mode: "power"
  });
  if (match?.gameId) params.set("gameId", match.gameId);
  if (match?.league) params.set("league", match.league);
  return `/sharktrends/trend?${params.toString()}`;
}

function matchupHref(match: TrendMatch) {
  return `/sharktrends/matchup/${encodeURIComponent(match.league)}/${encodeURIComponent(match.gameId)}`;
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

function matchActionability(match: TrendMatch | undefined) {
  return String(match?.actionability ?? "").toUpperCase();
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

function matchupTrendScore(system: PublishedTrendSystem, match: TrendMatch) {
  let score = promotionScore(system);
  const actionability = matchActionability(match);
  if (actionability.includes("ACTIVE")) score += 60;
  if (actionability.includes("WATCH")) score += 25;
  if (match.price != null) score += 30;
  if (match.edgePct != null) score += Math.min(75, Math.max(0, match.edgePct * 8));
  if (match.confidencePct) score += Math.min(70, Math.max(0, match.confidencePct - 50));
  return Math.round(score);
}

function promotionTier(system: PublishedTrendSystem): PlacementTier {
  if (system.activeMatches.length > 0 && system.verified) return "promote";
  if (system.activeMatches.length > 0) return "watch";
  if (system.verified) return "verified-idle";
  return "bench";
}

function systemBlockers(system: PublishedTrendSystem) {
  const blockers: string[] = [];
  const actionability = systemActionability(system);
  if (!system.activeMatches.length) blockers.push("no-current-qualifier");
  if (!system.verified) blockers.push("needs-ledger-proof");
  if (!(actionability.includes("ACTIVE") || actionability.includes("REVIEW"))) blockers.push("action-gate-not-active");
  return blockers;
}

function matchBlockers(system: PublishedTrendSystem, match: TrendMatch) {
  const blockers = systemBlockers(system).filter((blocker) => blocker !== "no-current-qualifier");
  if (match.price == null) blockers.push("needs-current-price");
  if (!matchActionability(match).includes("ACTIVE")) blockers.push("match-not-active-gate");
  return [...new Set(blockers)];
}

function primaryAction(system: PublishedTrendSystem) {
  const blockers = systemBlockers(system);
  if (!blockers.length) return "promote-to-top-rail";
  if (blockers.includes("needs-ledger-proof") && system.activeMatches.length > 0) return "keep-watchlist-and-collect-proof";
  if (blockers.includes("no-current-qualifier") && system.verified) return "keep-verified-idle-until-live-match";
  if (blockers.includes("no-current-qualifier")) return "bench-until-current-match";
  return "review-action-gate";
}

function matchPrimaryAction(system: PublishedTrendSystem, match: TrendMatch) {
  const blockers = matchBlockers(system, match);
  if (!blockers.length) return "promote-trend-for-matchup";
  if (blockers.includes("needs-current-price")) return "wait-for-price-confirmation";
  if (blockers.includes("needs-ledger-proof")) return "show-as-watchlist-proof-building";
  return "show-with-caution";
}

function promotionReason(system: PublishedTrendSystem) {
  const parts = [];
  if (system.activeMatches.length) parts.push(`${system.activeMatches.length} live qualifier${system.activeMatches.length === 1 ? "" : "s"}`);
  else parts.push("no current qualifier");
  parts.push(system.verified ? "verified" : "unverified/provisional");
  parts.push(`${systemActionability(system).toLowerCase() || "unknown"} action gate`);
  return parts.join(" · ");
}

function buildPromotionRows(systems: PublishedTrendSystem[]) {
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
      blockers: systemBlockers(system),
      primaryAction: primaryAction(system),
      reason: promotionReason(system),
      href: systemHref(system)
    }))
    .sort((left, right) => right.score - left.score)
    .map((system, index) => ({ ...system, rank: index + 1 }));
}

function buildTrendRow(system: PublishedTrendSystem, match: TrendMatch) {
  return {
    id: `${system.id}:${match.gameId}`,
    systemId: system.id,
    gameId: match.gameId,
    name: system.name,
    category: system.category,
    market: system.market,
    side: match.side,
    actionability: match.actionability,
    verified: system.verified,
    price: match.price,
    edgePct: match.edgePct,
    confidencePct: match.confidencePct,
    fairProbability: match.fairProbability,
    reasons: match.reasons,
    score: matchupTrendScore(system, match),
    blockers: matchBlockers(system, match),
    primaryAction: matchPrimaryAction(system, match),
    href: trendDetailHref(system, match),
    matchupHref: match.href
  };
}

function buildMatchupsByLeague(systems: PublishedTrendSystem[]) {
  const map = new Map<string, {
    id: string;
    gameId: string;
    league: string;
    eventLabel: string;
    startTime: string;
    status: string;
    href: string;
    trends: MatchupTrendRow[];
  }>();

  for (const system of systems) {
    for (const match of system.activeMatches) {
      const key = `${match.league}:${match.gameId}`;
      const existing = map.get(key) ?? {
        id: key,
        gameId: match.gameId,
        league: match.league,
        eventLabel: match.eventLabel,
        startTime: match.startTime,
        status: match.status,
        href: matchupHref(match),
        trends: []
      };
      existing.trends.push(buildTrendRow(system, match));
      map.set(key, existing);
    }
  }

  const matchups = [...map.values()].map((matchup) => {
    const trends = matchup.trends.sort((left, right) => right.score - left.score);
    const topScore = trends[0]?.score ?? 0;
    const verifiedTrends = trends.filter((trend) => trend.verified).length;
    const activeTrends = trends.filter((trend) => String(trend.actionability).toUpperCase().includes("ACTIVE")).length;
    const blockedTrends = trends.filter((trend) => trend.blockers.length > 0).length;
    return {
      ...matchup,
      trendCount: trends.length,
      visibleTrendCount: Math.min(MATCHUP_TREND_LIMIT, trends.length),
      hiddenTrendCount: Math.max(0, trends.length - MATCHUP_TREND_LIMIT),
      verifiedTrends,
      activeTrends,
      blockedTrends,
      topScore,
      trends: trends.slice(0, MATCHUP_TREND_LIMIT),
      allTrends: trends
    };
  }).sort((left, right) => right.topScore - left.topScore || left.startTime.localeCompare(right.startTime));

  const byLeague = matchups.reduce<Record<string, typeof matchups>>((acc, matchup) => {
    acc[matchup.league] = acc[matchup.league] ?? [];
    acc[matchup.league].push(matchup);
    return acc;
  }, {});

  return Object.entries(byLeague)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([league, items]) => ({
      league,
      matchupCount: items.length,
      trendCount: items.reduce((sum, item) => sum + item.trendCount, 0),
      activeTrendCount: items.reduce((sum, item) => sum + item.activeTrends, 0),
      verifiedTrendCount: items.reduce((sum, item) => sum + item.verifiedTrends, 0),
      matchups: items
    }));
}

function placementLanes(rows: ReturnType<typeof buildPromotionRows>) {
  return {
    promote: rows.filter((system) => system.tier === "promote"),
    watch: rows.filter((system) => system.tier === "watch"),
    "verified-idle": rows.filter((system) => system.tier === "verified-idle"),
    bench: rows.filter((system) => system.tier === "bench")
  };
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
  const allPromotionRows = buildPromotionRows(publishedSystems);
  const promotionBoard = allPromotionRows.slice(0, PROMOTION_BOARD_LIMIT);
  const lanes = placementLanes(allPromotionRows);
  const matchupsByLeague = buildMatchupsByLeague(publishedSystems);
  const totalMatchups = matchupsByLeague.reduce((sum, league) => sum + league.matchupCount, 0);
  const totalMatchupTrends = matchupsByLeague.reduce((sum, league) => sum + league.trendCount, 0);
  const promotableSystems = lanes.promote;
  const watchSystems = lanes.watch;
  const benchSystems = [...lanes.bench, ...lanes["verified-idle"]];
  const blockedSystems = allPromotionRows.filter((system) => system.blockers.length > 0);

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
    productName: PRODUCT_NAME,
    productSlug: "sharktrends",
    generatedAt: new Date(now).toISOString(),
    thresholds: {
      staleRunHours: STALE_RUN_HOURS,
      recentRunHours: RECENT_RUN_HOURS,
      promotionBoardLimit: PROMOTION_BOARD_LIMIT,
      matchupTrendLimit: MATCHUP_TREND_LIMIT
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
      blockedSystems: blockedSystems.length,
      allPromotionRows: allPromotionRows.length,
      visiblePromotionRows: promotionBoard.length,
      leagueMatchupGroups: matchupsByLeague.length,
      matchupTiles: totalMatchups,
      matchupTrendLinks: totalMatchupTrends,
      activeMatches: publishedRun.summary.activeMatches
    },
    coverage: {
      runCoveragePct,
      freshnessRiskPct,
      publishedActivePct: publishedSystems.length ? Math.round((publishedActive.length / publishedSystems.length) * 100) : 0,
      publishedVerifiedPct: publishedSystems.length ? Math.round((verifiedPublished.length / publishedSystems.length) * 100) : 0,
      promotablePct: publishedSystems.length ? Math.round((promotableSystems.length / publishedSystems.length) * 100) : 0,
      blockedPct: publishedSystems.length ? Math.round((blockedSystems.length / publishedSystems.length) * 100) : 0
    },
    distribution: {
      bySport: countBy(publishedSystems.map((system) => system.sport)),
      byLeague: publishedRun.summary.byLeague,
      byMarket: countBy(publishedSystems.map((system) => system.market)),
      byMode: countBy(savedActive.map((row) => row.mode)),
      byCategory: publishedRun.summary.byCategory,
      byPromotionTier: countBy(allPromotionRows.map((system) => system.tier)),
      byBlocker: countBy(allPromotionRows.flatMap((system) => system.blockers)),
      byPrimaryAction: countBy(allPromotionRows.map((system) => system.primaryAction)),
      byMatchupLeague: Object.fromEntries(matchupsByLeague.map((league) => [league.league, league.matchupCount])),
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
    promotionBoard,
    allPromotionRows,
    placementLanes: lanes,
    matchupsByLeague,
    commandQueue,
    nextAction: totalMatchups
      ? "Use league matchup tiles as the main SharkTrends browse path; open a matchup to inspect its attached trend links."
      : promotableSystems.length
        ? "Promote the top SharkTrends placement-lane systems first; they have live qualifiers plus verification support."
        : watchSystems.length
          ? "Live SharkTrends systems exist but are not verified yet. Keep them watchlist until ledger proof improves."
          : commandQueue.length
            ? "Refresh saved rows and keep inactive published systems below active systems until current matches return."
            : publishedActive.length
              ? "SharkTrends published system inventory is active. Next step is rank by verified ledger proof, ROI, and current price quality."
              : "Published systems exist, but none have current matches. Run sim/market refresh before SharkTrends promotion."
  };
}
