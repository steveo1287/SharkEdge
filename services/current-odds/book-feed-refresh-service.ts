import type { LeagueKey } from "@/lib/types/domain";
import { upsertOddsIngestPayload } from "@/services/market-data/market-data-service";

import { readBookFeedState, writeBookFeedState, hashBookFeedPayload } from "./book-feed-cache";
import { normalizeBookFeedPayload } from "./book-feed-normalization";
import { getBookFeedProviders, getBookFeedProvidersForLeague } from "./book-feed-registry";
import type { BookFeedProvider, BookFeedRefreshSummary } from "./book-feed-provider-types";

function uniqueProviders(leagues?: LeagueKey[]) {
  if (typeof leagues === "undefined") {
    return getBookFeedProviders();
  }

  if (!leagues.length) {
    return [];
  }

  const seen = new Map<string, BookFeedProvider>();
  for (const league of leagues) {
    for (const provider of getBookFeedProvidersForLeague(league)) {
      seen.set(provider.key, provider);
    }
  }

  return Array.from(seen.values());
}

function computeJitter(key: string, jitterMs: number) {
  if (!jitterMs) {
    return 0;
  }

  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash << 5) - hash + key.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash) % jitterMs;
}

function shouldSkip(provider: BookFeedProvider, now: number) {
  const state = readBookFeedState(provider.key);
  const jitter = computeJitter(provider.key, provider.polling.jitterMs);
  const nextAllowedAt = state.nextAllowedAt ?? 0;
  const ttlGate = (state.lastAttemptAt ?? 0) + provider.polling.ttlMs + jitter;

  if (now < nextAllowedAt) {
    return { skip: true, reason: "backoff_active" };
  }

  if (state.lastAttemptAt && now < ttlGate) {
    return { skip: true, reason: "ttl_active" };
  }

  return { skip: false as const };
}

export async function refreshCurrentBookFeeds(args?: { leagues?: LeagueKey[]; force?: boolean }) {
  const providers = uniqueProviders(args?.leagues);
  const summaries: BookFeedRefreshSummary[] = [];
  const now = Date.now();

  for (const provider of providers) {
    const leagues = (args?.leagues?.filter((league) => provider.supportsLeague(league)) ?? []) as LeagueKey[];
    const skip = args?.force ? { skip: false as const } : shouldSkip(provider, now);
    if (skip.skip) {
      summaries.push({
        providerKey: provider.key,
        sportsbookKey: provider.sportsbookKey,
        attempted: false,
        status: "SKIPPED",
        reason: skip.reason,
        leagues
      });
      continue;
    }

    const result = await provider.fetchFeed({ leagues });
    const state = readBookFeedState(provider.key);

    if (!result.ok) {
      const failures = state.consecutiveFailures + 1;
      const retryAfterMs = result.retryAfterMs ?? Math.min(
        provider.polling.backoff.maxMs,
        provider.polling.backoff.baseMs * provider.polling.backoff.multiplier ** Math.max(0, failures - 1)
      );

      writeBookFeedState(provider.key, {
        ...state,
        consecutiveFailures: failures,
        lastAttemptAt: now,
        nextAllowedAt: now + retryAfterMs
      });

      summaries.push({
        providerKey: provider.key,
        sportsbookKey: provider.sportsbookKey,
        attempted: true,
        status: result.status,
        reason: result.reason,
        leagues
      });
      continue;
    }

    const payloadHash = hashBookFeedPayload(result.payload);
    const normalizedPayloads = normalizeBookFeedPayload({
      providerKey: result.providerKey,
      sportsbookKey: result.sportsbookKey,
      payload: result.payload,
      fetchedAt: result.fetchedAt
    });
    let ingestedMarketCount = 0;

    for (const payload of normalizedPayloads) {
      const ingested = await upsertOddsIngestPayload(payload);
      ingestedMarketCount += ingested.touchedMarketIds.length;
    }

    writeBookFeedState(provider.key, {
      consecutiveFailures: 0,
      lastAttemptAt: now,
      lastSuccessAt: now,
      nextAllowedAt: now + result.cacheTtlMs,
      lastPayloadHash: payloadHash
    });

    summaries.push({
      providerKey: provider.key,
      sportsbookKey: provider.sportsbookKey,
      attempted: true,
      status: "READY",
      reason: payloadHash === state.lastPayloadHash ? "unchanged_payload" : "refreshed",
      leagues,
      ingestedEventCount: normalizedPayloads.length,
      ingestedMarketCount
    });
  }

  return {
    generatedAt: new Date(now).toISOString(),
    summaries
  };
}
