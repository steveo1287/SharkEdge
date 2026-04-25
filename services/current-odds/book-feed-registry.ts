import type { LeagueKey } from "@/lib/types/domain";

import { oddsharvesterDirectProvider } from "./oddsharvester-direct-provider";
import type { BookFeedProvider, BookFeedProviderKey } from "./book-feed-provider-types";

/**
 * Book feed providers registry - OPEN-SOURCE ONLY
 *
 * Primary data sources:
 * - OddsHarvester: Direct CLI-based odds scraper (https://github.com/jordantete/OddsHarvester)
 *   Installation: pip install oddsharvester
 *
 * Removed paid/rate-limited providers:
 * - OddsAPI (the-odds-api.com) - paid service with rate limits
 * - TheRundown - paid historical odds service
 * - Pinnacle - paid premium lines
 * - TheSportsDB - rate-limited free tier
 * - External backend service (shark-odds-1.onrender.com) - replaced with direct CLI integration
 */

const BOOK_FEED_PROVIDERS: BookFeedProvider[] = [oddsharvesterDirectProvider];

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
