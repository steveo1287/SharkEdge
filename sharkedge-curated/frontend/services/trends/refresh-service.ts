import type { SupportedLeagueKey } from "@/lib/types/ledger";
import { getPublishedTrendCards } from "@/lib/trends/publisher";
import { refreshCurrentBookFeeds } from "@/services/current-odds/book-feed-refresh-service";
import { importFreeHistoricalWarehouse } from "@/services/historical-warehouse/free-sources-service";
import { backfillHistoricalIntelligence } from "@/services/historical-odds/backfill-service";
import { backfillHistoricalEventCatalog } from "@/services/historical-odds/catalog-backfill-service";
import { ingestHistoricalOddsSnapshots } from "@/services/historical-odds/ingestion-service";
import { refreshEventParticipantContextWarehouse } from "@/services/trends/event-context-warehouse";
import { refreshTrendFeatureWarehouse } from "@/services/trends/feature-warehouse";
import { refreshDiscoveredTrendSystems } from "@/services/trends/discovered-systems";

const DEFAULT_TREND_LEAGUES: SupportedLeagueKey[] = ["NBA", "MLB", "NCAAB", "NHL", "NFL", "NCAAF"];
const PUBLISHABLE_TREND_LEAGUES = new Set<SupportedLeagueKey>(["NBA", "MLB", "NCAAB", "NHL", "NFL", "NCAAF"]);

export async function refreshTrendIntelligence(args?: {
  leagues?: SupportedLeagueKey[];
  days?: number;
}) {
  const leagues = args?.leagues?.length ? args.leagues : DEFAULT_TREND_LEAGUES;
  const bookFeedRefresh = await refreshCurrentBookFeeds({
    leagues
  });

  const freeWarehouse = await importFreeHistoricalWarehouse({
    leagues,
    days: args?.days
  });

  const historicalOdds = [];
  for (const leagueKey of leagues) {
    try {
      historicalOdds.push(
        PUBLISHABLE_TREND_LEAGUES.has(leagueKey)
          ? await ingestHistoricalOddsSnapshots(leagueKey as "NBA" | "NCAAB" | "MLB" | "NHL" | "NFL" | "NCAAF")
          : {
              sourceKey: "oddsharvester_historical",
              capturedAt: new Date().toISOString(),
              leagues: [leagueKey],
              sportCount: 0,
              gameCount: 0,
              marketCount: 0,
              snapshotCount: 0,
              skipped: true
            }
      );
    } catch (error) {
      historicalOdds.push({
        sourceKey: "oddsharvester_historical",
        capturedAt: new Date().toISOString(),
        leagues: [leagueKey],
        sportCount: 0,
        gameCount: 0,
        marketCount: 0,
        snapshotCount: 0,
        error: error instanceof Error ? error.message : "Historical odds ingestion failed."
      });
    }
  }

  const catalog = await backfillHistoricalEventCatalog({
    leagues,
    days: args?.days
  });

  const intelligence = [];
  for (const leagueKey of leagues) {
    intelligence.push(
      await backfillHistoricalIntelligence({
        leagueKey,
        limit: 2500
      })
    );
  }

  const contexts = await refreshEventParticipantContextWarehouse({
    leagues,
    days: args?.days
  });

  const features = await refreshTrendFeatureWarehouse({
    leagues,
    days: args?.days
  });

  const discovered = await refreshDiscoveredTrendSystems({
    leagues,
    days: args?.days
  });

  const published = await Promise.all([
    getPublishedTrendCards({ window: "365d", sample: 10 }, { limit: 4 }),
    ...leagues.map((leagueKey) =>
      PUBLISHABLE_TREND_LEAGUES.has(leagueKey)
        ? getPublishedTrendCards(
            {
              league: leagueKey,
              window: "365d",
              sample: 10
            },
            { limit: 3 }
          )
        : Promise.resolve([])
    )
  ]);

  return {
    generatedAt: new Date().toISOString(),
    bookFeedRefresh,
    freeWarehouse,
    historicalOdds,
    catalog,
    intelligence,
    contexts,
    features,
    discovered,
    publishedTrendCount: published.reduce((total, cards) => total + cards.length, 0),
    leagues
  };
}
