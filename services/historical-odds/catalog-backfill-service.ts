import type { SupportedLeagueKey } from "@/lib/types/ledger";
import { upsertProviderEvent } from "@/services/events/event-service";
import { fetchEspnScoreboard, normalizeEspnEvent } from "@/services/events/espn-provider";
import { invalidateTrendCache } from "@/services/trends/cache";

const HISTORICAL_DATE_WINDOWS: Record<SupportedLeagueKey, number> = {
  NBA: 365,
  MLB: 240,
  NHL: 365,
  NFL: 210,
  NCAAF: 240,
  UFC: 0,
  BOXING: 0
};

type HistoricalCatalogLeagueResult = {
  leagueKey: SupportedLeagueKey;
  scannedDates: number;
  eventCount: number;
  importedCount: number;
  skippedCount: number;
  note: string;
};

export type HistoricalCatalogBackfillResult = {
  sourceKey: "espn_historical_scoreboard";
  generatedAt: string;
  leagues: HistoricalCatalogLeagueResult[];
  importedCount: number;
  skippedCount: number;
  scannedDates: number;
  cacheInvalidated: boolean;
};

function getHistoricalLeagueTargets(leagues?: SupportedLeagueKey[]) {
  const requested = leagues?.length
    ? leagues
    : (Object.keys(HISTORICAL_DATE_WINDOWS) as SupportedLeagueKey[]);

  return requested.filter((leagueKey) => HISTORICAL_DATE_WINDOWS[leagueKey] > 0);
}

function buildDatesBackwards(days: number, options?: { startDate?: Date; endDate?: Date }) {
  const endDate = options?.endDate ? new Date(options.endDate) : new Date();
  const startDate = options?.startDate
    ? new Date(options.startDate)
    : new Date(endDate.getTime() - Math.max(days - 1, 0) * 24 * 60 * 60 * 1000);

  const dates: Date[] = [];
  const cursor = new Date(startDate);
  cursor.setUTCHours(0, 0, 0, 0);
  const normalizedEnd = new Date(endDate);
  normalizedEnd.setUTCHours(0, 0, 0, 0);

  while (cursor <= normalizedEnd) {
    dates.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

async function importLeagueDate(leagueKey: SupportedLeagueKey, date: Date) {
  const payload = await fetchEspnScoreboard(leagueKey, {
    date,
    cacheMode: "no-store",
    limit: 200
  });
  const normalized = (payload.events ?? [])
    .map((event) => normalizeEspnEvent(leagueKey, event))
    .filter((event): event is NonNullable<typeof event> => Boolean(event?.externalEventId));

  let importedCount = 0;
  let skippedCount = 0;

  for (const event of normalized) {
    try {
      await upsertProviderEvent(event);
      importedCount += 1;
    } catch {
      skippedCount += 1;
    }
  }

  return {
    scannedDates: 1,
    eventCount: normalized.length,
    importedCount,
    skippedCount
  };
}

export async function backfillHistoricalEventCatalog(args?: {
  leagues?: SupportedLeagueKey[];
  days?: number;
  startDate?: Date;
  endDate?: Date;
}) {
  const targetLeagues = getHistoricalLeagueTargets(args?.leagues);
  const leagueResults: HistoricalCatalogLeagueResult[] = [];
  let totalImported = 0;
  let totalSkipped = 0;
  let totalDates = 0;

  for (const leagueKey of targetLeagues) {
    const defaultDays = HISTORICAL_DATE_WINDOWS[leagueKey];
    const dates = buildDatesBackwards(args?.days ?? defaultDays, {
      startDate: args?.startDate,
      endDate: args?.endDate
    });

    let importedCount = 0;
    let skippedCount = 0;
    let eventCount = 0;

    for (const date of dates) {
      const result = await importLeagueDate(leagueKey, date);
      importedCount += result.importedCount;
      skippedCount += result.skippedCount;
      eventCount += result.eventCount;
      totalDates += result.scannedDates;
    }

    totalImported += importedCount;
    totalSkipped += skippedCount;

    leagueResults.push({
      leagueKey,
      scannedDates: dates.length,
      eventCount,
      importedCount,
      skippedCount,
      note: importedCount
        ? `${leagueKey} historical ESPN scoreboard events imported.`
        : eventCount
          ? `${leagueKey} returned events, but none were persisted cleanly in this run.`
          : `${leagueKey} returned no historical scoreboard events in the selected window.`
    });
  }

  const cacheInvalidated = await invalidateTrendCache();

  return {
    sourceKey: "espn_historical_scoreboard" as const,
    generatedAt: new Date().toISOString(),
    leagues: leagueResults,
    importedCount: totalImported,
    skippedCount: totalSkipped,
    scannedDates: totalDates,
    cacheInvalidated
  } satisfies HistoricalCatalogBackfillResult;
}
