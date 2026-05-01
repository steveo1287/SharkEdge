import type { SupportedLeagueKey } from "@/lib/types/ledger";
import { getServerDatabaseResolution, hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { upsertProviderEvent } from "@/services/events/event-service";
import type { EventProvider } from "@/services/events/provider-types";
import { getScoreProviders } from "@/services/providers/registry";

const db = prisma as any;

const SUPPORTED_BACKFILL_LEAGUES = new Set<string>([
  "NBA",
  "MLB",
  "NHL",
  "NFL",
  "NCAAF",
  "UFC",
  "BOXING"
]);

function isSupportedLeague(value: unknown): value is SupportedLeagueKey {
  return typeof value === "string" && SUPPORTED_BACKFILL_LEAGUES.has(value);
}

function metadata(row: any): Record<string, any> {
  return row?.metadataJson && typeof row.metadataJson === "object" ? row.metadataJson : {};
}

function uniqLeagues(items: SupportedLeagueKey[]) {
  return [...new Set(items)] as SupportedLeagueKey[];
}

async function readOpenTrendLeagues(limit: number): Promise<{ rows: any[]; leagues: SupportedLeagueKey[] }> {
  const rows = await db.savedTrendMatch.findMany({
    where: {
      betResult: "OPEN",
      trendDefinition: {
        isSystemGenerated: true
      }
    },
    include: {
      trendDefinition: true,
      event: {
        include: {
          league: {
            select: { key: true }
          }
        }
      }
    },
    orderBy: { matchedAt: "asc" },
    take: Math.min(Math.max(limit, 1), 1000)
  });

  const leagues = rows
    .map((row: any) => row.event?.league?.key ?? row.trendDefinition?.leagueKey ?? metadata(row).league)
    .filter(isSupportedLeague) as SupportedLeagueKey[];

  return {
    rows,
    leagues: uniqLeagues(leagues)
  };
}

async function backfillLeague(leagueKey: SupportedLeagueKey) {
  const providers = getScoreProviders(leagueKey) as EventProvider[];
  const providerResults: Array<{
    providerKey: string;
    providerLabel: string;
    fetched: number;
    upserted: number;
    finalEvents: number;
    ok: boolean;
    error: string | null;
  }> = [];
  let totalFetched = 0;
  let totalUpserted = 0;
  let totalFinalEvents = 0;

  for (const provider of providers) {
    try {
      const events = await provider.fetchScoreboard(leagueKey);
      let upserted = 0;
      let finalEvents = 0;
      for (const event of events) {
        const eventId = await upsertProviderEvent(event);
        if (eventId) upserted += 1;
        if (event.status === "FINAL" || event.resultState === "OFFICIAL") finalEvents += 1;
      }
      totalFetched += events.length;
      totalUpserted += upserted;
      totalFinalEvents += finalEvents;
      providerResults.push({
        providerKey: provider.key,
        providerLabel: provider.label,
        fetched: events.length,
        upserted,
        finalEvents,
        ok: true,
        error: null
      });

      if (finalEvents > 0) break;
    } catch (error) {
      providerResults.push({
        providerKey: provider.key,
        providerLabel: provider.label,
        fetched: 0,
        upserted: 0,
        finalEvents: 0,
        ok: false,
        error: error instanceof Error ? error.message : "Provider result backfill failed."
      });
    }
  }

  return {
    leagueKey,
    providers: providerResults,
    totalFetched,
    totalUpserted,
    totalFinalEvents,
    ok: providerResults.some((result) => result.ok)
  };
}

export async function backfillTrendSystemEventResults(args?: { limit?: number }) {
  const source = getServerDatabaseResolution().key;
  if (!hasUsableServerDatabaseUrl()) {
    return {
      ok: false,
      generatedAt: new Date().toISOString(),
      database: { usable: false, source },
      summary: {
        openRows: 0,
        leagues: 0,
        totalFetched: 0,
        totalUpserted: 0,
        totalFinalEvents: 0
      },
      leagues: [],
      nextAction: "No usable database is configured for trend result backfill."
    };
  }

  const limit = Math.min(Math.max(args?.limit ?? 500, 1), 1000);
  const open = await readOpenTrendLeagues(limit);
  const leagueResults = await Promise.all(open.leagues.map((leagueKey: SupportedLeagueKey) => backfillLeague(leagueKey)));
  const totalFetched = leagueResults.reduce((sum, result) => sum + result.totalFetched, 0);
  const totalUpserted = leagueResults.reduce((sum, result) => sum + result.totalUpserted, 0);
  const totalFinalEvents = leagueResults.reduce((sum, result) => sum + result.totalFinalEvents, 0);

  return {
    ok: leagueResults.every((result) => result.ok),
    generatedAt: new Date().toISOString(),
    database: { usable: true, source },
    summary: {
      openRows: open.rows.length,
      leagues: open.leagues.length,
      totalFetched,
      totalUpserted,
      totalFinalEvents
    },
    leagues: leagueResults,
    nextAction: totalFinalEvents
      ? "Final events were backfilled. Run /api/trends/systems/grade?limit=500 to settle open rows."
      : open.leagues.length
        ? "Scoreboard providers refreshed, but no final events were returned for the open trend rows yet."
        : "No open system trend rows found for result backfill."
  };
}
