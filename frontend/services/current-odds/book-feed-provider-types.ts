import type { LeagueKey } from "@/lib/types/domain";

export type BookFeedProviderKey = "draftkings" | "fanduel";

export type BookFeedBackoffPolicy = {
  baseMs: number;
  maxMs: number;
  multiplier: number;
};

export type BookFeedPollingPolicy = {
  ttlMs: number;
  jitterMs: number;
  backoff: BookFeedBackoffPolicy;
  workerOnly: true;
};

export type BookFeedRefreshWindow = {
  label: string;
  startsBeforeEventMs: number | null;
  endsBeforeEventMs: number | null;
  intervalMs: number;
};

export type BookFeedPollingPlan = {
  pregame: BookFeedRefreshWindow[];
  live: BookFeedRefreshWindow[];
};

export type BookFeedProviderStatus = "READY" | "NOT_CONFIGURED" | "ERROR";

export type BookFeedFetchResult =
  | {
      ok: true;
      providerKey: BookFeedProviderKey;
      sportsbookKey: BookFeedProviderKey;
      fetchedAt: string;
      sourceUrl: string;
      cacheTtlMs: number;
      etag?: string | null;
      payload: unknown;
      isPartial?: boolean;
    }
  | {
      ok: false;
      providerKey: BookFeedProviderKey;
      sportsbookKey: BookFeedProviderKey;
      fetchedAt: string;
      status: BookFeedProviderStatus;
      reason: string;
      retryAfterMs?: number | null;
      errorCode?: string;
    };

export type BookFeedRefreshSummary = {
  providerKey: BookFeedProviderKey;
  sportsbookKey: BookFeedProviderKey;
  attempted: boolean;
  status: BookFeedProviderStatus | "SKIPPED";
  reason?: string;
  leagues: LeagueKey[];
};

export interface BookFeedProvider {
  key: BookFeedProviderKey;
  label: string;
  sportsbookKey: BookFeedProviderKey;
  supportsLeague(leagueKey: LeagueKey): boolean;
  polling: BookFeedPollingPolicy;
  plan: BookFeedPollingPlan;
  describe(): string;
  fetchFeed(args: { leagues?: LeagueKey[] }): Promise<BookFeedFetchResult>;
}
