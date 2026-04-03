import type { LeagueKey } from "@/lib/types/domain";

import { draftKingsBookFeedProvider } from "./providers/draftkings-feed";
import { fanDuelBookFeedProvider } from "./providers/fanduel-feed";
import type { BookFeedProvider, BookFeedProviderKey } from "./book-feed-provider-types";

const BOOK_FEED_PROVIDERS: BookFeedProvider[] = [
  draftKingsBookFeedProvider,
  fanDuelBookFeedProvider
];

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
