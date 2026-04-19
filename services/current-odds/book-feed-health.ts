import type { LeagueKey } from "@/lib/types/domain";

import { readBookFeedState } from "./book-feed-cache";
import { getBookFeedProviders, getBookFeedProvidersForLeague } from "./book-feed-registry";
import type { BookFeedProvider } from "./book-feed-provider-types";

export type BookFeedProviderRuntimeHealth = {
  providerKey: string;
  label: string;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  nextAllowedAt: string | null;
  consecutiveFailures: number;
  staleMinutes: number | null;
  status: "healthy" | "degraded" | "offline";
};

export type BookFeedRuntimeHealthSnapshot = {
  generatedAt: string;
  latestSuccessAt: string | null;
  providers: BookFeedProviderRuntimeHealth[];
  warnings: string[];
  summary: string;
};

const MINUTE_IN_MS = 60 * 1000;
const STALE_AFTER_MINUTES = 15;

function uniqueProviders(leagues?: LeagueKey[]) {
  if (!leagues?.length) {
    return getBookFeedProviders();
  }

  const seen = new Map<string, BookFeedProvider>();
  for (const league of leagues) {
    for (const provider of getBookFeedProvidersForLeague(league)) {
      seen.set(provider.key, provider);
    }
  }

  return Array.from(seen.values());
}

function toIso(value?: number) {
  return typeof value === "number" ? new Date(value).toISOString() : null;
}

function getStaleMinutes(value?: number) {
  if (typeof value !== "number") {
    return null;
  }

  return Math.max(0, Math.round((Date.now() - value) / MINUTE_IN_MS));
}

export function getBookFeedRuntimeHealthSnapshot(leagues?: LeagueKey[]): BookFeedRuntimeHealthSnapshot {
  const providers = uniqueProviders(leagues);

  const providerStates = providers.map((provider) => {
    const state = readBookFeedState(provider.key);
    const staleMinutes = getStaleMinutes(state.lastSuccessAt);
    const status: BookFeedProviderRuntimeHealth["status"] =
      typeof state.lastSuccessAt !== "number"
        ? "offline"
        : state.consecutiveFailures > 0 || (staleMinutes !== null && staleMinutes > STALE_AFTER_MINUTES)
          ? "degraded"
          : "healthy";

    return {
      providerKey: provider.key,
      label: provider.label,
      lastAttemptAt: toIso(state.lastAttemptAt),
      lastSuccessAt: toIso(state.lastSuccessAt),
      nextAllowedAt: toIso(state.nextAllowedAt),
      consecutiveFailures: state.consecutiveFailures,
      staleMinutes,
      status
    } satisfies BookFeedProviderRuntimeHealth;
  });

  const latestSuccessAt = providerStates
    .map((provider) => provider.lastSuccessAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;

  const warnings: string[] = [];

  if (!providerStates.length) {
    warnings.push("No live book-feed providers are registered for the requested leagues.");
  }

  for (const provider of providerStates) {
    if (!provider.lastSuccessAt) {
      warnings.push(`${provider.label} has not completed a successful refresh in this runtime yet.`);
      continue;
    }

    if (provider.consecutiveFailures > 0) {
      warnings.push(`${provider.label} has ${provider.consecutiveFailures} consecutive refresh failure${provider.consecutiveFailures === 1 ? "" : "s"}.`);
    }

    if (provider.staleMinutes !== null && provider.staleMinutes > STALE_AFTER_MINUTES) {
      warnings.push(`${provider.label} last refreshed ${provider.staleMinutes} minute${provider.staleMinutes === 1 ? "" : "s"} ago.`);
    }
  }

  const summary = !providerStates.length
    ? "No live book-feed providers are registered for this board slice."
    : warnings.length
      ? "Live book-feed health is degraded. Persisted inventory may still render, but freshness is not fully trusted."
      : `Live book-feed health is stable across ${providerStates.length} provider${providerStates.length === 1 ? "" : "s"}.`;

  return {
    generatedAt: new Date().toISOString(),
    latestSuccessAt,
    providers: providerStates,
    warnings,
    summary
  };
}
