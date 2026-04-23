import type { LeagueKey } from "@/lib/types/domain";

import type { BookFeedProvider, BookFeedProviderKey } from "./book-feed-provider-types";
import { oddsharvesterBookFeedProvider } from "./providers/oddsharvester-feed";

const BOOK_FEED_PROVIDERS: BookFeedProvider[] = [
  oddsharvesterBookFeedProvider
];

export function getBookFeedProviders() {
  return BOOK_FEED_PROVIDERS;
}

export function getBookFeedProvider(key: BookFeedProviderKey) {
  return BOOK_FEED_PROVIDERS.find((provider) => provider.key === key) ?? null;
}

export function getBookFeedProvidersForLeague(_leagueKey: LeagueKey) {
  return BOOK_FEED_PROVIDERS;
}

export function getBookFeedLabelsForLeague(_leagueKey: LeagueKey) {
  return BOOK_FEED_PROVIDERS.map((provider) => provider.label);
}
