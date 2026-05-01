import { getServerDatabaseResolution, hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { buildDeepMlbTrendSystems } from "@/services/trends/mlb-deep-trend-systems";

const db = prisma as any;

function minMaxDates(rows: Array<{ gameDate?: string | Date | null; startTime?: string | Date | null }>) {
  const dates = rows
    .map((row) => row.gameDate ?? row.startTime ?? null)
    .map((value) => value ? new Date(value).getTime() : NaN)
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);

  if (!dates.length) return { first: null, last: null, years: [] as number[] };
  const years = Array.from(new Set(dates.map((value) => new Date(value).getUTCFullYear()))).sort((left, right) => left - right);
  return {
    first: new Date(dates[0]).toISOString(),
    last: new Date(dates[dates.length - 1]).toISOString(),
    years
  };
}

async function safeCount(model: string, where?: any) {
  try {
    if (!db[model]?.count) return null;
    return await db[model].count(where ? { where } : undefined);
  } catch {
    return null;
  }
}

async function safeFind(model: string, args: any) {
  try {
    if (!db[model]?.findMany) return [];
    return await db[model].findMany(args);
  } catch {
    return [];
  }
}

async function tableSummary() {
  const [
    retrosheetGames,
    retrosheetTeamStats,
    retrosheetPitchingStats,
    eloSnapshots,
    pitcherRolling,
    eventMarkets,
    eventMarketSnapshots,
    eventResults,
    events,
    teamGameStats,
    playerGameStats,
    savedTrendMatches,
    savedTrendDefinitions
  ] = await Promise.all([
    safeCount("retrosheetGame"),
    safeCount("retrosheetTeamGameStat"),
    safeCount("retrosheetPitchingGameStat"),
    safeCount("mlbTeamEloSnapshot"),
    safeCount("mlbPitcherRollingSnapshot"),
    safeCount("eventMarket"),
    safeCount("eventMarketSnapshot"),
    safeCount("eventResult"),
    safeCount("event"),
    safeCount("teamGameStat"),
    safeCount("playerGameStat"),
    safeCount("savedTrendMatch"),
    safeCount("savedTrendDefinition")
  ]);

  return {
    retrosheetGames,
    retrosheetTeamStats,
    retrosheetPitchingStats,
    eloSnapshots,
    pitcherRolling,
    eventMarkets,
    eventMarketSnapshots,
    eventResults,
    events,
    teamGameStats,
    playerGameStats,
    savedTrendMatches,
    savedTrendDefinitions
  };
}

async function rangeSummary() {
  const [retrosheet, events, markets, results] = await Promise.all([
    safeFind("retrosheetGame", { select: { gameDate: true }, orderBy: { gameDate: "asc" }, take: 50000 }),
    safeFind("event", { select: { startTime: true }, orderBy: { startTime: "asc" }, take: 50000 }),
    safeFind("eventMarket", { select: { createdAt: true }, orderBy: { createdAt: "asc" }, take: 50000 }),
    safeFind("eventResult", { select: { officialAt: true, createdAt: true }, orderBy: { createdAt: "asc" }, take: 50000 })
  ]);

  return {
    retrosheet: minMaxDates(retrosheet.map((row: any) => ({ gameDate: row.gameDate }))),
    events: minMaxDates(events.map((row: any) => ({ startTime: row.startTime }))),
    eventMarkets: minMaxDates(markets.map((row: any) => ({ startTime: row.createdAt }))),
    eventResults: minMaxDates(results.map((row: any) => ({ startTime: row.officialAt ?? row.createdAt })))
  };
}

function topCards(cards: Awaited<ReturnType<typeof buildDeepMlbTrendSystems>>["cards"]) {
  return cards.slice(0, 12).map((card) => ({
    id: card.id,
    title: card.title,
    family: card.family,
    betSide: card.betSide,
    sampleSize: card.sampleSize,
    record: card.record,
    hitRate: card.hitRate,
    roi: card.roi,
    units: card.units,
    pricedRows: card.pricedRows,
    roiCoverage: card.roiCoverage,
    yearsCovered: card.yearsCovered,
    seasons: card.seasons?.slice?.(0, 10) ?? [],
    conditionCount: card.conditionCount,
    activeMatches: card.todayMatches.length,
    confidenceLabel: card.confidenceLabel,
    stabilityLabel: card.stabilityLabel,
    warnings: card.warnings.slice(0, 5)
  }));
}

export async function auditHistoricalTrendData() {
  const source = getServerDatabaseResolution().key;
  if (!hasUsableServerDatabaseUrl()) {
    return {
      ok: false,
      generatedAt: new Date().toISOString(),
      database: { usable: false, source },
      summary: {
        historicalCards: 0,
        publishableCards: 0,
        roiBackedCards: 0,
        activeMatches: 0,
        maxSample: 0,
        maxYearsCovered: 0
      },
      tables: {},
      ranges: {},
      topCards: [],
      warnings: ["No usable database URL is configured."],
      nextAction: "Configure DATABASE_URL/POSTGRES_URL and run migrations/ingestion."
    };
  }

  const [tables, ranges, feed] = await Promise.all([
    tableSummary(),
    rangeSummary(),
    buildDeepMlbTrendSystems().catch((error) => ({
      generatedAt: new Date().toISOString(),
      cards: [],
      warnings: [error instanceof Error ? error.message : "Deep MLB trend build failed."]
    }))
  ]);

  const cards = feed.cards ?? [];
  const publishableCards = cards.filter((card) => card.sampleSize > 0);
  const roiBackedCards = cards.filter((card) => card.roi !== null);
  const activeMatches = cards.reduce((sum, card) => sum + card.todayMatches.length, 0);
  const maxSample = cards.reduce((max, card) => Math.max(max, card.sampleSize), 0);
  const maxYearsCovered = cards.reduce((max, card) => Math.max(max, card.yearsCovered ?? 0), 0);
  const has2011 = Array.isArray(ranges.retrosheet.years) && ranges.retrosheet.years.includes(2011);
  const hasDeepHistory = has2011 || maxYearsCovered >= 8 || (tables.retrosheetGames ?? 0) >= 10000;

  return {
    ok: hasDeepHistory && publishableCards.length > 0,
    generatedAt: new Date().toISOString(),
    database: { usable: true, source },
    summary: {
      historicalCards: cards.length,
      publishableCards: publishableCards.length,
      roiBackedCards: roiBackedCards.length,
      activeMatches,
      maxSample,
      maxYearsCovered,
      has2011Retrosheet: has2011,
      hasDeepHistory
    },
    tables,
    ranges,
    topCards: topCards(cards),
    warnings: feed.warnings ?? [],
    nextAction: publishableCards.length
      ? "Historical MLB cards are publishable. If /trends does not show them, inspect dashboard merge/cache."
      : hasDeepHistory
        ? "Historical rows exist, but no published trend definitions are matching. Inspect condition thresholds and adapters."
        : "Historical coverage looks thin or not loaded. Run the MLB historical ingestion/backfill before relying on deep trends."
  };
}
