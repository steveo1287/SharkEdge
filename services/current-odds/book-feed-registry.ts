import type { LeagueKey } from "@/lib/types/domain";
import type { BookFeedProvider, BookFeedProviderKey } from "./book-feed-provider-types";

/**
 * Book feed providers registry.
 *
 * OddsHarvester data is PUSHED to /api/ingest/odds by the Python push script
 * (scripts/local_oddsharvester_push.py), not pulled here. The odds-refresh-worker
 * runs currentMarketStateJob and recomputeEdgeSignals against data already in the DB.
 *
 * To populate odds data:
 *   pip install oddsharvester
 *   SHARKEDGE_BACKEND_URL=https://app.sharkedge.com SHARKEDGE_API_KEY=<key> python scripts/local_oddsharvester_push.py
 */

const BOOK_FEED_PROVIDERS: BookFeedProvider[] = [];

export function getBookFeedProviders() {
  return BOOK_FEED_PROVIDERS;
}

export function getBookFeedProvider(key: BookFeedProviderKey) {
  return BOOK_FEED_PROVIDERS.find((provider) => provider.key === key) ?? null;
}

export function getBookFeedProvidersForLeague(leagueKey: LeagueKey) {
  return BOOK_FEED_PROVIDERS.filter((provider) => provider.supportsLeague(leagueKey));
}

export function getBookFeedLabelsForLeague(leagueKey: LeagueKey) {
  return getBookFeedProvidersForLeague(leagueKey).map((provider) => provider.label);
}
