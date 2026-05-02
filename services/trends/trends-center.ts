import { buildSavedTrendHref, listSavedTrendRows } from "@/services/trends/saved-systems";
import { buildTrendSystemRun } from "@/services/trends/trend-system-engine";

const STALE_RUN_HOURS = 24;
const RECENT_RUN_HOURS = 24;
const PRODUCT_NAME = "SharkTrends";
const PROMOTION_BOARD_LIMIT = 12;
const MATCHUP_TREND_LIMIT = 6;
const MIN_VERIFIED_SAMPLE = 75;

type SavedTrendRow = Awaited<ReturnType<typeof listSavedTrendRows>>[number];
type PublishedTrendSystem = Awaited<ReturnType<typeof buildTrendSystemRun>>["systems"][number];
type TrendMatch = PublishedTrendSystem["activeMatches"][number];
type PlacementTier = "promote" | "watch" | "verified-idle" | "bench";
type TrendActionState = "ACTIONABLE" | "WAIT" | "WATCH" | "PASS" | "RESEARCH";

type MatchupTrendRow = ReturnType<typeof buildTrendRow>;

function countBy<T extends string>(items: T[]) {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[item] = (acc[item] ?? 0) + 1;
    return acc;
  }, {});
}

function clamp(value: number, min = 0, max = 100) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function signedNumber(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "TBD";
  return `${value > 0 ? "+" : ""}${value}`;
}

function signedPct(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "TBD";
  return `${value > 0 ? "+" : ""}${value}%`;
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
  return `/sharktrends?${params.toString()}`;
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

function formatRecord(system: PublishedTrendSystem) {
  return `${system.metrics.wins}-${system.metrics.losses}${system.metrics.pushes ? `-${system.metrics.pushes}` : ""}`;
}

function systemRules(system: PublishedTrendSystem) {
  return system.rules.map((rule) => ({
    key: rule.key,
    label: rule.label,
    operator: rule.operator,
    value: rule.value,
    text: `${rule.label} ${rule.operator} ${String(rule.value)}`
  }));
}

function proofGrade(system: PublishedTrendSystem) {
  const sample = system.metrics.sampleSize;
  if (system.verified && sample >= 150 && system.metrics.roiPct > 10) return "A";
  if (system.verified && sample >= 100 && system.metrics.roiPct > 5) return "B";
  if (system.verified && sample >= MIN_VERIFIED_SAMPLE) return "C";
  return "PROVISIONAL";
}

function proofPacket(system: PublishedTrendSystem) {
  return {
    grade: proofGrade(system),
    source: system.source,
    verified: system.verified,
    risk: system.risk,
    category: system.category,
    description: system.description,
    record: formatRecord(system),
    wins: system.metrics.wins,
    losses: system.metrics.losses,
    pushes: system.metrics.pushes,
    sampleSize: system.metrics.sampleSize,
    profitUnits: system.metrics.profitUnits,
    roiPct: system.metrics.roiPct,
    winRatePct: system.metrics.winRatePct,
    currentStreak: system.metrics.currentStreak,
    last30WinRatePct: system.metrics.last30WinRatePct,
    clvPct: system.metrics.clvPct,
    seasons: system.metrics.seasons,
    rules: systemRules(system),
    filters: system.filters,
    summary: `${formatRecord(system)} · ${signedNumber(system.metrics.profitUnits)}u · ${system.metrics.roiPct}% ROI · ${system.metrics.winRatePct}% hit rate · ${signedPct(system.metrics.clvPct)} CLV`
  };
}

function proofQualityScore(system: PublishedTrendSystem) {
  const sample = system.metrics.sampleSize;
  const roi = system.metrics.roiPct;
  const profit = system.metrics.profitUnits;
  const winRate = system.metrics.winRatePct;
  const last30 = system.metrics.last30WinRatePct;
  const clv = system.metrics.clvPct;
  const seasons = Array.isArray(system.metrics.seasons) ? system.metrics.seasons.length : 0;

  let score = 0;
  score += system.verified ? 25 : 8;
  score += Math.min(15, sample / 10);
  score += Math.min(15, Math.max(0, roi * 1.1));
  score += Math.min(8, Math.max(0, profit * 0.4));
  score += Math.min(8, Math.max(0, (winRate - 50) * 0.8));
  score += Math.min(7, Math.max(0, (last30 - 50) * 0.35));
  score += Math.min(12, Math.max(-8, clv * 6));
  score += Math.min(5, seasons * 1.5);

  return clamp(Math.round(score));
}

function hasLivePricedEdge(system: PublishedTrendSystem) {
  return system.activeMatches.some((match) => {
    const actionability = matchActionability(match);
    const edge = typeof match.edgePct === "number" && Number.isFinite(match.edgePct) ? match.edgePct : 0;
    return match.price != null && edge > 0 && (actionability.includes("ACTIVE") || actionability.includes("REVIEW"));
  });
}

function marketQualityScore(system: PublishedTrendSystem, match?: TrendMatch) {
  if (!match) {
    const activeMatches = system.activeMatches.length;
    let score = 0;
    if (activeMatches) score += 8;
    if (hasLivePricedEdge(system)) score += 15;
    if (systemActionability(system).includes("ACTIVE") || systemActionability(system).includes("REVIEW")) score += 7;
    return clamp(score, 0, 30);
  }

  const actionability = matchActionability(match);
  const edge = typeof match.edgePct === "number" && Number.isFinite(match.edgePct) ? match.edgePct : 0;
  const confidence = typeof match.confidencePct === "number" && Number.isFinite(match.confidencePct) ? match.confidencePct : 0;
  let score = 0;
  if (match.price != null) score += 8;
  if (edge > 0) score += Math.min(12, edge * 2.4);
  if (confidence > 50) score += Math.min(8, (confidence - 50) * 0.3);
  if (actionability.includes("ACTIVE")) score += 6;
  else if (actionability.includes("REVIEW")) score += 4;
  else if (actionability.includes("WATCH")) score += 2;
  return clamp(score, 0, 30);
}

function systemBlockers(system: PublishedTrendSystem) {
  const blockers: string[] = [];
  const actionability = systemActionability(system);
  if (!system.activeMatches.length) blockers.push("no-current-qualifier");
  if (!system.verified) blockers.push("needs-ledger-proof");
  if (!(actionability.includes("ACTIVE") || actionability.includes("REVIEW"))) blockers.push("action-gate-not-active");
  if (system.metrics.sampleSize < MIN_VERIFIED_SAMPLE) blockers.push("small-sample");
  if (system.metrics.roiPct <= 0) blockers.push("non-positive-roi");
  if (system.metrics.clvPct < 0) blockers.push("negative-clv");
  return blockers;
}

function matchBlockers(system: PublishedTrendSystem, match: TrendMatch) {
  const blockers = systemBlockers(system).filter((blocker) => blocker !== "no-current-qualifier");
  if (match.price == null) blockers.push("needs-current-price");
  if (match.edgePct != null && match.edgePct <= 0) blockers.push("no-current-edge");
  if (!matchActionability(match).includes("ACTIVE")) blockers.push("match-not-active-gate");
  return [...new Set(blockers)];
}

function blockerPenalty(blockers: string[]) {
  return blockers.reduce((penalty, blocker) => {
    if (["non-positive-roi", "negative-clv", "needs-ledger-proof", "small-sample"].includes(blocker)) return penalty + 10;
    if (["needs-current-price", "no-current-edge", "action-gate-not-active", "match-not-active-gate"].includes(blocker)) return penalty + 7;
    return penalty + 4;
  }, 0);
}

function promotionScore(system: PublishedTrendSystem) {
  let score = proofQualityScore(system) + marketQualityScore(system);
  const category = systemCategory(system);
  if (category.includes("EDGE")) score += 5;
  if (category.includes("MARKET")) score += 3;
  if (category.includes("SITUATION") || category.includes("SYSTEM")) score += 2;
  if (system.metrics.currentStreak.toUpperCase().startsWith("W")) score += 2;
  score -= blockerPenalty(systemBlockers(system));
  return clamp(Math.round(score));
}

function matchupTrendScore(system: PublishedTrendSystem, match: TrendMatch) {
  let score = proofQualityScore(system) + marketQualityScore(system, match);
  score -= blockerPenalty(matchBlockers(system, match));
  return clamp(Math.round(score));
}

function systemActionState(system: PublishedTrendSystem): TrendActionState {
  const blockers = systemBlockers(system);
  const verifiedProof = system.verified && system.metrics.sampleSize >= MIN_VERIFIED_SAMPLE && system.metrics.roiPct > 0 && system.metrics.clvPct >= 0;
  const activeGate = systemActionability(system).includes("ACTIVE") || systemActionability(system).includes("REVIEW");

  if (verifiedProof && activeGate && hasLivePricedEdge(system)) return "ACTIONABLE";
  if (system.verified && !system.activeMatches.length) return "WAIT";
  if (system.activeMatches.length && blockers.includes("needs-ledger-proof")) return "WATCH";
  if (system.activeMatches.length && (blockers.includes("small-sample") || blockers.includes("needs-current-price"))) return "RESEARCH";
  if (blockers.includes("non-positive-roi") || blockers.includes("negative-clv")) return "PASS";
  if (system.activeMatches.length) return "WATCH";
  return "PASS";
}

function matchActionState(system: PublishedTrendSystem, match: TrendMatch): TrendActionState {
  const blockers = matchBlockers(system, match);
  const verifiedProof = system.verified && system.metrics.sampleSize >= MIN_VERIFIED_SAMPLE && system.metrics.roiPct > 0 && system.metrics.clvPct >= 0;
  const edge = typeof match.edgePct === "number" && Number.isFinite(match.edgePct) ? match.edgePct : 0;
  const liveGate = matchActionability(match).includes("ACTIVE") || matchActionability(match).includes("REVIEW");

  if (verifiedProof && liveGate && match.price != null && edge > 0) return "ACTIONABLE";
  if (match.price == null || blockers.includes("needs-current-price")) return "WAIT";
  if (blockers.includes("needs-ledger-proof") || blockers.includes("small-sample")) return "WATCH";
  if (blockers.includes("non-positive-roi") || blockers.includes("negative-clv") || blockers.includes("no-current-edge")) return "PASS";
  if (liveGate) return "RESEARCH";
  return "WATCH";
}

function actionLabel(state: TrendActionState) {
  if (state === "ACTIONABLE") return "ACTIONABLE";
  if (state === "WAIT") return "WAIT";
  if (state === "WATCH") return "WATCH";
  if (state === "PASS") return "PASS";
  return "RESEARCH";
}

function actionReason(state: TrendActionState, blockers: string[]) {
  if (state === "ACTIONABLE") return "Verified proof, active qualifier, live price, and positive current edge.";
  if (state === "WAIT") return "Trend has proof or context, but it needs the right current qualifier or price before promotion.";
  if (state === "WATCH") return "Live or interesting setup, but proof is not strong enough for top placement yet.";
  if (state === "PASS") return `Hard blocker present: ${blockers[0] ?? "edge quality below threshold"}.`;
  return "Needs confirmation from price, market gate, injury/lineup, or supporting context before promotion.";
}

function promotionTier(system: PublishedTrendSystem): PlacementTier {
  const state = systemActionState(system);
  if (state === "ACTIONABLE") return "promote";
  if (state === "WATCH" || state === "RESEARCH") return "watch";
  if (state === "WAIT" && system.verified) return "verified-idle";
  return "bench";
}

function primaryAction(system: PublishedTrendSystem) {
  return actionLabel(systemActionState(system));
}

function matchPrimaryAction(system: PublishedTrendSystem, match: TrendMatch) {
  return actionLabel(matchActionState(system, match));
}

function promotionReason(system: PublishedTrendSystem) {
  const proof = proofPacket(system);
  const blockers = systemBlockers(system);
  const state = systemActionState(system);
  const parts = [];
  parts.push(`SharkScore ${promotionScore(system)}`);
  parts.push(actionLabel(state));
  parts.push(actionReason(state, blockers));
  if (system.activeMatches.length) parts.push(`${system.activeMatches.length} live qualifier${system.activeMatches.length === 1 ? "" : "s"}`);
  else parts.push("no current qualifier");
  parts.push(system.verified ? "verified" : "unverified/provisional");
  parts.push(`${systemActionability(system).toLowerCase() || "unknown"} action gate`);
  parts.push(proof.summary);
  if (blockers.length) parts.push(`Blockers: ${blockers.join(", ")}`);
  return parts.join(" · ");
}

function buildPromotionRows(systems: PublishedTrendSystem[]) {
  return [...systems]
    .map((system) => {
      const blockers = systemBlockers(system);
      const actionState = systemActionState(system);
      const score = promotionScore(system);
      return {
        id: system.id,
        name: system.name,
        sport: system.sport,
        league: system.league,
        market: system.market,
        category: system.category,
        actionability: system.actionability,
        activeMatches: system.activeMatches.length,
        verified: system.verified,
        proof: proofPacket(system),
        score,
        sharkScore: score,
        actionState,
        actionLabel: actionLabel(actionState),
        actionReason: actionReason(actionState, blockers),
        tier: promotionTier(system),
        blockers,
        primaryAction: actionLabel(actionState),
        reason: promotionReason(system),
        href: systemHref(system)
      };
    })
    .sort((left, right) => right.score - left.score)
    .map((system, index) => ({ ...system, rank: index + 1 }));
}

function buildTrendRow(system: PublishedTrendSystem, match: TrendMatch) {
  const proof = proofPacket(system);
  const blockers = matchBlockers(system, match);
  const actionState = matchActionState(system, match);
  const score = matchupTrendScore(system, match);
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
    proof,
    price: match.price,
    edgePct: match.edgePct,
    confidencePct: match.confidencePct,
    fairProbability: match.fairProbability,
    reasons: [
      ...match.reasons,
      `SharkScore ${score}`,
      `${actionLabel(actionState)}: ${actionReason(actionState, blockers)}`,
      proof.summary,
      `Rules: ${proof.rules.map((rule) => rule.text).join(" + ")}`,
      blockers.length ? `Blockers: ${blockers.join(", ")}` : "No hard blockers"
    ],
    score,
    sharkScore: score,
    actionState,
    actionLabel: actionLabel(actionState),
    actionReason: actionReason(actionState, blockers),
    blockers,
    primaryAction: actionLabel(actionState),
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
    const actionableTrends = trends.filter((trend) => trend.actionState === "ACTIONABLE").length;
    const bestRoiPct = trends.reduce((max, trend) => Math.max(max, trend.proof.roiPct), Number.NEGATIVE_INFINITY);
    const bestProfitUnits = trends.reduce((max, trend) => Math.max(max, trend.proof.profitUnits), Number.NEGATIVE_INFINITY);
    return {
      ...matchup,
      trendCount: trends.length,
      visibleTrendCount: Math.min(MATCHUP_TREND_LIMIT, trends.length),
      hiddenTrendCount: Math.max(0, trends.length - MATCHUP_TREND_LIMIT),
      verifiedTrends,
      activeTrends,
      actionableTrends,
      blockedTrends,
      topScore,
      bestRoiPct: Number.isFinite(bestRoiPct) ? bestRoiPct : null,
      bestProfitUnits: Number.isFinite(bestProfitUnits) ? bestProfitUnits : null,
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
      actionableTrendCount: items.reduce((sum, item) => sum + item.actionableTrends, 0),
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
  const actionableSystems = allPromotionRows.filter((system) => system.actionState === "ACTIONABLE");
  const researchSystems = allPromotionRows.filter((system) => system.actionState === "RESEARCH");
  const passSystems = allPromotionRows.filter((system) => system.actionState === "PASS");
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
      matchupTrendLimit: MATCHUP_TREND_LIMIT,
      minVerifiedSample: MIN_VERIFIED_SAMPLE
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
      actionableSystems: actionableSystems.length,
      researchSystems: researchSystems.length,
      passSystems: passSystems.length,
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
      blockedPct: publishedSystems.length ? Math.round((blockedSystems.length / publishedSystems.length) * 100) : 0,
      actionablePct: publishedSystems.length ? Math.round((actionableSystems.length / publishedSystems.length) * 100) : 0
    },
    distribution: {
      bySport: countBy(publishedSystems.map((system) => system.sport)),
      byLeague: publishedRun.summary.byLeague,
      byMarket: countBy(publishedSystems.map((system) => system.market)),
      byMode: countBy(savedActive.map((row) => row.mode)),
      byCategory: publishedRun.summary.byCategory,
      byPromotionTier: countBy(allPromotionRows.map((system) => system.tier)),
      byActionState: countBy(allPromotionRows.map((system) => system.actionState)),
      byBlocker: countBy(allPromotionRows.flatMap((system) => system.blockers)),
      byPrimaryAction: countBy(allPromotionRows.map((system) => system.primaryAction)),
      byProofGrade: countBy(allPromotionRows.map((system) => system.proof.grade)),
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
    activeSystems: publishedActive.slice(0, 8).map((system) => {
      const blockers = systemBlockers(system);
      const actionState = systemActionState(system);
      const score = promotionScore(system);
      return {
        id: system.id,
        name: system.name,
        sport: system.sport,
        league: system.league,
        market: system.market,
        category: system.category,
        actionability: system.actionability,
        activeMatches: system.activeMatches.length,
        verified: system.verified,
        proof: proofPacket(system),
        score,
        sharkScore: score,
        actionState,
        actionLabel: actionLabel(actionState),
        actionReason: actionReason(actionState, blockers),
        blockers,
        href: systemHref(system)
      };
    }),
    promotionBoard,
    allPromotionRows,
    placementLanes: lanes,
    matchupsByLeague,
    commandQueue,
    nextAction: actionableSystems.length
      ? "Open the ACTIONABLE SharkTrends rail first; these systems have verified proof, active qualifiers, live price, and positive current edge."
      : totalMatchups
        ? "Use league matchup tiles as the main SharkTrends browse path; open a matchup to inspect its attached trend links and blockers."
        : promotableSystems.length
          ? "Promote the top SharkTrends placement-lane systems first; they have live qualifiers plus verification support."
          : watchSystems.length
            ? "Live SharkTrends systems exist but are not verified yet. Keep them watchlist until ledger proof improves."
            : commandQueue.length
              ? "Refresh saved rows and keep inactive published systems below active systems until current matches return."
              : publishedActive.length
                ? "SharkTrends published system inventory is active. Next step is rank by verified ledger proof, ROI, CLV, and current price quality."
                : "Published systems exist, but none have current matches. Run sim/market refresh before SharkTrends promotion."
  };
}
