import { loadEnvConfig } from "@next/env";
import type { LeagueKey } from "@/lib/types/domain";

import { readBookFeedState } from "./book-feed-cache";
import { getBookFeedProviders } from "./book-feed-registry";
import type { BookFeedProvider } from "./book-feed-provider-types";
import { backendCurrentOddsProvider } from "./backend-provider";
import { getCurrentOddsBackendBaseUrl } from "./backend-url";
import type { CurrentOddsBoardResponse } from "./provider-types";
import { fetchTheRundownLeaguesBoard, therundownCurrentOddsProvider } from "./therundown-provider";

declare global {
  // eslint-disable-next-line no-var
  var sharkedgeProviderReadinessEnvLoaded: boolean | undefined;
}

if (!global.sharkedgeProviderReadinessEnvLoaded) {
  loadEnvConfig(process.cwd());
  global.sharkedgeProviderReadinessEnvLoaded = true;
}

const BACKEND_PROVIDER_TIMEOUT_MS = 2_500;
const SOFT_STALE_MINUTES = 15;
const HARD_STALE_MINUTES = 45;
// Default readiness keeps to the leagues we actively surface for live odds on the board.
// Other leagues still show up via scoreboard support, and their odds fetch can be probed explicitly via ?leagues=...
const DEFAULT_LEAGUES: LeagueKey[] = ["NBA", "MLB"];

type ReadinessState = "READY" | "DEGRADED" | "NOT_CONFIGURED" | "ERROR";

type ProbeLike = {
  providerKey: string;
  label: string;
  state: ReadinessState;
  warnings: string[];
};

export type BoardProviderReadiness = {
  providerKey: string;
  label: string;
  state: ReadinessState;
  configured: boolean;
  checkedAt: string;
  generatedAt: string | null;
  freshnessMinutes: number | null;
  errors: string[];
  warnings: string[];
  providerMode: string | null;
  sportsCount: number;
  gameCount: number;
  sourceUrl?: string | null;
};

export type BookFeedReadiness = {
  providerKey: string;
  label: string;
  sportsbookKey: string;
  state: ReadinessState;
  configured: boolean;
  checkedAt: string;
  warnings: string[];
  reason: string | null;
  sourceUrl: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  nextAllowedAt: string | null;
  consecutiveFailures: number;
  leagues: LeagueKey[];
};

export type SelectedBoardProvider = {
  providerKey: string | null;
  label: string | null;
  score: number | null;
  reason: string;
};

export type LiveOddsReadinessReport = {
  generatedAt: string;
  overallState: ReadinessState;
  selectedBoardProvider: SelectedBoardProvider;
  boardProviders: BoardProviderReadiness[];
  bookFeeds: BookFeedReadiness[];
  warnings: string[];
  notes: string[];
};

export type ProviderReadinessState =
  | "HEALTHY"
  | "DEGRADED"
  | "READY"
  | "NOT_CONFIGURED"
  | "ERROR";

export type ProviderReadinessEntry = {
  key: string;
  label: string;
  state: ProviderReadinessState;
  summary: string;
  detail: string;
  asOf: string | null;
  freshnessMinutes: number | null;
  warnings: string[];
  workerOnly: boolean;
  booksIncluded: string[];
};

export type ProviderReadinessView = {
  generatedAt: string;
  state: ProviderReadinessState;
  label: string;
  summary: string;
  safePathSummary: string;
  liveBoardProvider: string | null;
  booksOnBoard: string[];
  entries: ProviderReadinessEntry[];
  warnings: string[];
};

function getBackendBaseUrl() {
  return getCurrentOddsBackendBaseUrl();
}

function getFreshnessMinutes(timestamp?: string | null) {
  if (!timestamp) {
    return null;
  }

  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(0, Math.round((Date.now() - parsed) / 60_000));
}

function isoFromMs(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value)
    ? new Date(value).toISOString()
    : null;
}

function pushIfPresent(target: string[], value: string | null | undefined) {
  if (value) {
    target.push(value);
  }
}

function deriveBoardProviderState(response: CurrentOddsBoardResponse | null, warnings: string[]) {
  if (!response?.configured) {
    return "NOT_CONFIGURED" as const;
  }

  const freshnessMinutes = getFreshnessMinutes(response.generated_at);
  if (warnings.length || (typeof freshnessMinutes === "number" && freshnessMinutes > SOFT_STALE_MINUTES)) {
    return "DEGRADED" as const;
  }

  return "READY" as const;
}

function buildBoardWarnings(response: CurrentOddsBoardResponse | null) {
  const warnings = [...(response?.errors ?? [])];
  const freshnessMinutes = getFreshnessMinutes(response?.generated_at);

  if (response?.configured && freshnessMinutes === null) {
    warnings.push("Configured provider did not return a usable timestamp.");
  }

  if (typeof freshnessMinutes === "number" && freshnessMinutes > SOFT_STALE_MINUTES) {
    warnings.push("Provider timestamp is aging or stale.");
  }

  return Array.from(new Set(warnings));
}

async function fetchBackendBoardResponse() {
  const url = `${getBackendBaseUrl().replace(/\/$/, "")}/api/odds/board`;

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(BACKEND_PROVIDER_TIMEOUT_MS)
    });

    if (!response.ok) {
      return {
        ok: false as const,
        url,
        reason: `Backend board returned ${response.status}.`
      };
    }

    const payload = (await response.json()) as CurrentOddsBoardResponse;
    return {
      ok: true as const,
      url,
      payload
    };
  } catch (error) {
    return {
      ok: false as const,
      url,
      reason: error instanceof Error ? error.message : "Backend board request failed."
    };
  }
}

export async function probeBackendBoardProvider(): Promise<BoardProviderReadiness> {
  const checkedAt = new Date().toISOString();
  const result = await fetchBackendBoardResponse();

  if (!result.ok) {
    return {
      providerKey: backendCurrentOddsProvider.key,
      label: backendCurrentOddsProvider.label,
      state: "ERROR",
      configured: false,
      checkedAt,
      generatedAt: null,
      freshnessMinutes: null,
      errors: [result.reason],
      warnings: [result.reason],
      providerMode: null,
      sportsCount: 0,
      gameCount: 0,
      sourceUrl: result.url
    };
  }

  const payload = result.payload;
  const warnings = buildBoardWarnings(payload);
  const sportsCount = payload.sports?.length ?? 0;
  const gameCount = payload.sports?.reduce((sum, sport) => sum + sport.games.length, 0) ?? 0;

  return {
    providerKey: backendCurrentOddsProvider.key,
    label: backendCurrentOddsProvider.label,
    state: deriveBoardProviderState(payload, warnings),
    configured: Boolean(payload.configured),
    checkedAt,
    generatedAt: payload.generated_at ?? null,
    freshnessMinutes: getFreshnessMinutes(payload.generated_at),
    errors: payload.errors ?? [],
    warnings,
    providerMode: payload.provider_mode ?? payload.provider ?? null,
    sportsCount,
    gameCount,
    sourceUrl: result.url
  };
}

export async function probeTheRundownBoardProvider(args?: { leagues?: LeagueKey[] }): Promise<BoardProviderReadiness> {
  const checkedAt = new Date().toISOString();
  const hasApiKey = Boolean(
    process.env.THERUNDOWN_API_KEY?.trim() ||
      process.env.THERUNDOWN_KEY?.trim() ||
      process.env.THE_RUNDOWN_API_KEY?.trim() ||
      process.env.THE_RUNDOWN_KEY?.trim()
  );

  if (!hasApiKey) {
    return {
      providerKey: therundownCurrentOddsProvider.key,
      label: therundownCurrentOddsProvider.label,
      state: "NOT_CONFIGURED",
      configured: false,
      checkedAt,
      generatedAt: null,
      freshnessMinutes: null,
      errors: [],
      warnings: ["THERUNDOWN_API_KEY is not configured in this runtime."],
      providerMode: "therundown",
      sportsCount: 0,
      gameCount: 0,
      sourceUrl: null
    };
  }

  const payload = await fetchTheRundownLeaguesBoard({
    leagues: args?.leagues?.length ? args.leagues : DEFAULT_LEAGUES,
    timeoutMs: 8_000,
    cacheTtlMs: 60_000
  });
  if (!payload) {
    return {
      providerKey: therundownCurrentOddsProvider.key,
      label: therundownCurrentOddsProvider.label,
      state: "ERROR",
      configured: true,
      checkedAt,
      generatedAt: null,
      freshnessMinutes: null,
      errors: ["TheRundown current-odds request failed or returned empty payload."],
      warnings: ["TheRundown is configured but not returning a usable current board."],
      providerMode: "therundown",
      sportsCount: 0,
      gameCount: 0,
      sourceUrl: null
    };
  }

  const warnings = buildBoardWarnings(payload);
  const sportsCount = payload.sports?.length ?? 0;
  const gameCount = payload.sports?.reduce((sum, sport) => sum + sport.games.length, 0) ?? 0;

  return {
    providerKey: therundownCurrentOddsProvider.key,
    label: therundownCurrentOddsProvider.label,
    state: deriveBoardProviderState(payload, warnings),
    configured: Boolean(payload.configured),
    checkedAt,
    generatedAt: payload.generated_at ?? null,
    freshnessMinutes: getFreshnessMinutes(payload.generated_at),
    errors: payload.errors ?? [],
    warnings,
    providerMode: payload.provider_mode ?? payload.provider ?? null,
    sportsCount,
    gameCount,
    sourceUrl: null
  };
}

function scoreBoardProvider(provider: BoardProviderReadiness) {
  if (provider.state === "ERROR" || provider.state === "NOT_CONFIGURED") {
    return Number.NEGATIVE_INFINITY;
  }

  if (typeof provider.freshnessMinutes === "number" && provider.freshnessMinutes >= HARD_STALE_MINUTES) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;

  if (provider.freshnessMinutes === null) {
    score -= 8;
  } else if (provider.freshnessMinutes <= 5) {
    score += 16;
  } else if (provider.freshnessMinutes <= SOFT_STALE_MINUTES) {
    score += 10;
  } else {
    score += 2;
  }

  score -= provider.errors.length * 8;
  score += provider.sportsCount * 2;
  score += Math.min(12, provider.gameCount);

  if (provider.providerKey === backendCurrentOddsProvider.key) {
    score += 2;
  }

  return score;
}

export function selectPreferredBoardProvider(
  providers: BoardProviderReadiness[]
): SelectedBoardProvider {
  const viable = providers
    .filter((provider) => provider.configured)
    .filter((provider) => provider.state === "READY" || provider.state === "DEGRADED")
    .map((provider) => ({ provider, score: scoreBoardProvider(provider) }))
    .filter((entry) => Number.isFinite(entry.score));

  if (!viable.length) {
    return {
      providerKey: null,
      label: null,
      score: null,
      reason: "No configured current-odds provider returned a viable live board."
    };
  }

  const winner = [...viable].sort((left, right) => right.score - left.score)[0];

  return {
    providerKey: winner.provider.providerKey,
    label: winner.provider.label,
    score: winner.score,
    reason:
      winner.provider.providerKey === backendCurrentOddsProvider.key
        ? "Backend board currently wins on freshness, coverage, or tie-break priority."
        : "TheRundown currently wins on freshness or board coverage."
  };
}

function getBookFeedConfigured(providerKey: string) {
  return Boolean(getBookFeedSourceUrl(providerKey));
}

function getBookFeedSourceUrl(providerKey: string) {
  if (providerKey === "draftkings") {
    return (
      process.env.SHARKEDGE_DRAFTKINGS_FEED_URL?.trim() ||
      `${getBackendBaseUrl().replace(/\/$/, "")}/api/book-feeds/draftkings`
    );
  }
  if (providerKey === "fanduel") {
    return (
      process.env.SHARKEDGE_FANDUEL_FEED_URL?.trim() ||
      `${getBackendBaseUrl().replace(/\/$/, "")}/api/book-feeds/fanduel`
    );
  }
  return null;
}

async function probeBookFeedProvider(
  provider: BookFeedProvider,
  leagues: LeagueKey[]
): Promise<BookFeedReadiness> {
  const checkedAt = new Date().toISOString();
  const configured = getBookFeedConfigured(provider.key);
  const stateSnapshot = readBookFeedState(provider.key);

  if (!configured) {
    return {
      providerKey: provider.key,
      label: provider.label,
      sportsbookKey: provider.sportsbookKey,
      state: "NOT_CONFIGURED",
      configured: false,
      checkedAt,
      warnings: [`${provider.label} is scaffolded but not configured with a feed URL.`],
      reason: `Set ${provider.key === "draftkings" ? "SHARKEDGE_DRAFTKINGS_FEED_URL" : "SHARKEDGE_FANDUEL_FEED_URL"} to enable this worker-only feed.`,
      sourceUrl: getBookFeedSourceUrl(provider.key),
      lastAttemptAt: isoFromMs(stateSnapshot.lastAttemptAt),
      lastSuccessAt: isoFromMs(stateSnapshot.lastSuccessAt),
      nextAllowedAt: isoFromMs(stateSnapshot.nextAllowedAt),
      consecutiveFailures: stateSnapshot.consecutiveFailures,
      leagues
    };
  }

  const result = await provider.fetchFeed({ leagues });
  const nextState = readBookFeedState(provider.key);
  const warnings: string[] = [];
  let state: ReadinessState = "READY";
  let reason: string | null = null;

  if (!result.ok) {
    state = nextState.lastSuccessAt ? "DEGRADED" : result.status === "NOT_CONFIGURED" ? "NOT_CONFIGURED" : "ERROR";
    reason = result.reason;
    pushIfPresent(warnings, result.reason);
  } else {
    const ageMinutes = getFreshnessMinutes(result.fetchedAt);
    if (typeof ageMinutes === "number" && ageMinutes > SOFT_STALE_MINUTES) {
      state = "DEGRADED";
      warnings.push("Feed fetch completed, but the returned timestamp already looks stale.");
    }
    if (nextState.consecutiveFailures > 0) {
      state = "DEGRADED";
      warnings.push("Feed recovered, but prior failures are still on the books.");
    }
    reason = result.sourceUrl ?? getBookFeedSourceUrl(provider.key);
  }

  return {
    providerKey: provider.key,
    label: provider.label,
    sportsbookKey: provider.sportsbookKey,
    state,
    configured,
    checkedAt,
    warnings: Array.from(new Set(warnings)),
    reason,
    sourceUrl: getBookFeedSourceUrl(provider.key),
    lastAttemptAt: isoFromMs(nextState.lastAttemptAt),
    lastSuccessAt: isoFromMs(nextState.lastSuccessAt),
    nextAllowedAt: isoFromMs(nextState.nextAllowedAt),
    consecutiveFailures: nextState.consecutiveFailures,
    leagues
  };
}

export function deriveOverallReadinessState(probes: ProbeLike[]) {
  if (probes.some((probe) => probe.state === "ERROR")) {
    return "ERROR" as const;
  }

  if (probes.some((probe) => probe.state === "DEGRADED")) {
    return "DEGRADED" as const;
  }

  if (probes.some((probe) => probe.state === "READY")) {
    return "READY" as const;
  }

  return "NOT_CONFIGURED" as const;
}

export async function getLiveOddsReadinessReport(args?: { leagues?: LeagueKey[] }): Promise<LiveOddsReadinessReport> {
  const leagues = args?.leagues?.length ? args.leagues : DEFAULT_LEAGUES;
  const [backend, theRundown, bookFeeds] = await Promise.all([
    probeBackendBoardProvider(),
    probeTheRundownBoardProvider({ leagues }),
    Promise.all(getBookFeedProviders().map((provider) => probeBookFeedProvider(provider, leagues)))
  ]);

  const boardProviders = [backend, theRundown];
  const selectedBoardProvider = selectPreferredBoardProvider(boardProviders);
  const overallState = deriveOverallReadinessState([...boardProviders, ...bookFeeds]);
  const warnings = Array.from(
    new Set([
      ...boardProviders.flatMap((provider) => provider.warnings),
      ...bookFeeds.flatMap((provider) => provider.warnings)
    ])
  );

  const notes = [
    `${backend.label}: ${backend.state}${backend.providerMode ? ` (${backend.providerMode})` : ""}`,
    `${theRundown.label}: ${theRundown.state}`,
    `Book feeds configured: ${bookFeeds.filter((feed) => feed.configured).length}/${bookFeeds.length}`,
    selectedBoardProvider.providerKey
      ? `Live board winner right now: ${selectedBoardProvider.label}.`
      : "No live board winner is available right now."
  ];

  return {
    generatedAt: new Date().toISOString(),
    overallState,
    selectedBoardProvider,
    boardProviders,
    bookFeeds,
    warnings,
    notes
  };
}

function mapStateToViewState(state: ReadinessState): ProviderReadinessState {
  if (state === "READY") {
    return "HEALTHY";
  }

  return state;
}

function titleCaseBook(key: string) {
  if (key === "draftkings") return "DraftKings";
  if (key === "fanduel") return "FanDuel";
  if (key === "betmgm") return "BetMGM";
  if (key === "williamhill_us") return "Caesars";
  if (key === "espnbet") return "ESPN BET";
  return key.replace(/[_-]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function uniqueBooks(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean)));
}

function summarizeBooks(values: string[]) {
  if (!values.length) {
    return "No books confirmed on the live board.";
  }

  const labels = values.map(titleCaseBook);
  if (labels.length <= 3) {
    return labels.join(", ");
  }

  return `${labels.slice(0, 3).join(", ")} +${labels.length - 3}`;
}

function buildBoardEntry(provider: BoardProviderReadiness): ProviderReadinessEntry {
  const booksIncluded =
    provider.providerKey === backendCurrentOddsProvider.key
      ? provider.providerMode === "book_feeds"
        ? ["draftkings", "fanduel"]
        : uniqueBooks((process.env.ODDS_API_BOOKMAKERS?.trim() || "draftkings,fanduel,betmgm").split(","))
      : [];

  return {
    key: provider.providerKey,
    label: provider.label,
    state: mapStateToViewState(provider.state),
    summary: provider.configured
      ? `${provider.gameCount} games across ${provider.sportsCount} sports.`
      : "Current board path is not configured in this runtime.",
    detail: provider.providerMode
      ? `${provider.label} is operating in ${provider.providerMode} mode.`
      : `${provider.label} board path is being probed directly.`,
    asOf: provider.generatedAt,
    freshnessMinutes: provider.freshnessMinutes,
    warnings: provider.warnings,
    workerOnly: false,
    booksIncluded
  };
}

function buildBookFeedEntry(feed: BookFeedReadiness): ProviderReadinessEntry {
  return {
    key: feed.providerKey,
    label: feed.label,
    state: mapStateToViewState(feed.state),
    summary: feed.configured
      ? "Worker feed scaffold is configured."
      : "Worker feed scaffold is present but not configured.",
    detail: feed.reason ?? "Worker feed has not returned a diagnostic reason yet.",
    asOf: feed.lastSuccessAt,
    freshnessMinutes: getFreshnessMinutes(feed.lastSuccessAt),
    warnings: feed.warnings,
    workerOnly: true,
    booksIncluded: [feed.sportsbookKey]
  };
}

export function buildProviderReadinessView(report: LiveOddsReadinessReport): ProviderReadinessView {
  const entries = [
    ...report.boardProviders.map(buildBoardEntry),
    ...report.bookFeeds.map(buildBookFeedEntry)
  ];

  const backendEntry = entries.find((entry) => entry.key === backendCurrentOddsProvider.key) ?? null;
  const booksOnBoard = uniqueBooks(backendEntry?.booksIncluded ?? []);
  const liveBoardProvider = report.selectedBoardProvider.label;
  const state = mapStateToViewState(report.overallState);
  const label = liveBoardProvider
    ? `${state === "HEALTHY" ? "Live board stable" : "Live board caution"}`
    : "Live board unavailable";
  const summary = liveBoardProvider
    ? `${liveBoardProvider} is the active live board path. Current board includes ${summarizeBooks(booksOnBoard)}.`
    : "No live board provider is currently healthy enough to win selection.";
  const safePathSummary = booksOnBoard.some((book) => book === "draftkings" || book === "fanduel")
    ? "No page-request scraping needed right now. DraftKings and/or FanDuel are already confirmed through the backend board path."
    : "Use the backend board path first. Treat direct DraftKings/FanDuel feeds as worker-only until their feed URLs are explicitly configured.";

  return {
    generatedAt: report.generatedAt,
    state,
    label,
    summary,
    safePathSummary,
    liveBoardProvider,
    booksOnBoard,
    entries,
    warnings: report.warnings
  };
}

export async function getProviderReadinessView(args?: { leagues?: LeagueKey[] }) {
  const report = await getLiveOddsReadinessReport(args);
  return buildProviderReadinessView(report);
}
