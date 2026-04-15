import type { BookFeedProviderKey } from "./book-feed-provider-types";

type BookFeedState = {
  lastAttemptAt?: number;
  lastSuccessAt?: number;
  nextAllowedAt?: number;
  lastPayloadHash?: string;
  consecutiveFailures: number;
};

const BOOK_FEED_STATE = new Map<BookFeedProviderKey, BookFeedState>();

export function readBookFeedState(key: BookFeedProviderKey): BookFeedState {
  return BOOK_FEED_STATE.get(key) ?? { consecutiveFailures: 0 };
}

export function writeBookFeedState(key: BookFeedProviderKey, state: BookFeedState) {
  BOOK_FEED_STATE.set(key, state);
}

export function hashBookFeedPayload(payload: unknown) {
  const value = JSON.stringify(payload);
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return String(Math.abs(hash));
}
