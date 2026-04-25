import { prisma } from "@/lib/db/prisma";
import type {
  MlbBoardNormalizationResult,
  MlbHistoricalNormalizationResult
} from "@/lib/types/mlb-trends";
import { backendCurrentOddsProvider } from "@/services/current-odds/backend-provider";
// Removed: therundownCurrentOddsProvider (TheRundown is paid - using OddsHarvester via backend)
import type { CurrentOddsBoardResponse } from "@/services/current-odds/provider-types";
import type { HistoricalOddsHarvestResponse } from "@/services/historical-odds/provider-types";

import {
  DefaultMlbBoardNormalizationService,
  type MlbBoardNormalizationService
} from "./mlb-board-normalization-service";
import { extractHistoricalTrendMarkets } from "./mlb-historical-market-extraction";
import {
  DefaultMlbHistoricalNormalizationService,
  type MlbHistoricalNormalizationService
} from "./mlb-historical-normalization-service";

const DEFAULT_HISTORICAL_LIMIT = 500;
const SHARKEDGE_BACKEND_URL =
  process.env.SHARKEDGE_BACKEND_URL?.trim() || "https://shark-odds-1.onrender.com";
const HISTORICAL_SOURCE_KEY = "oddsharvester_historical" as const;

type HistoricalTrendInputEnvelope = {
  rows: unknown[];
  warnings: string[];
};

type HistoricalEventRow = Awaited<ReturnType<typeof fetchRawHistoricalEvents>>[number];
type HistoricalHarvestGame = HistoricalOddsHarvestResponse["sports"][number]["games"][number];

type BoardResponseCandidate = {
  providerKey: string;
  response: CurrentOddsBoardResponse;
};

function getResponseAgeMinutes(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(0, (Date.now() - parsed) / 60000);
}

function scoreBoardCandidate(candidate: BoardResponseCandidate) {
  const ageMinutes = getResponseAgeMinutes(candidate.response.generated_at);
  let score = 0;

  if (ageMinutes === null) {
    score -= 8;
  } else if (ageMinutes <= 5) {
    score += 16;
  } else if (ageMinutes <= 15) {
    score += 10;
  } else {
    score += 2;
  }

  score -= candidate.response.errors.length * 8;
  score += candidate.response.sports.length * 2;
  score += Math.min(
    12,
    candidate.response.sports.reduce((total, sport) => total + sport.games.length, 0)
  );

  if (candidate.providerKey === backendCurrentOddsProvider.key) {
    score += 2;
  }

  return score;
}

function normalizeToken(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function buildHistoricalMatchKey(awayTeamName: string | null | undefined, homeTeamName: string | null | undefined) {
  return `${normalizeToken(awayTeamName)}|${normalizeToken(homeTeamName)}`;
}

function getHistoricalEventTeams(event: HistoricalEventRow) {
  const homeParticipant =
    event.participants.find((participant) => participant.role === "HOME" || participant.isHome === true) ?? null;
  const awayParticipant =
    event.participants.find((participant) => participant.role === "AWAY" || participant.isHome === false) ?? null;

  const homeTeamName =
    homeParticipant?.competitor.team?.name ??
    homeParticipant?.competitor.name ??
    null;
  const awayTeamName =
    awayParticipant?.competitor.team?.name ??
    awayParticipant?.competitor.name ??
    null;

  return {
    homeParticipant,
    awayParticipant,
    homeTeamName,
    awayTeamName,
    homeCompetitorId: homeParticipant?.competitorId ?? null,
    awayCompetitorId: awayParticipant?.competitorId ?? null
  };
}

function parseDate(value: Date | string | null | undefined) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed) : null;
  }

  return null;
}

async function fetchRawHistoricalEvents() {
  return prisma.event.findMany({
    where: {
      league: { key: "MLB" },
      status: "FINAL"
    },
    orderBy: { startTime: "desc" },
    take: DEFAULT_HISTORICAL_LIMIT,
    include: {
      participants: {
        include: {
          competitor: {
            include: {
              team: true
            }
          }
        },
        orderBy: [{ sortOrder: "asc" }]
      },
      eventResult: true,
      markets: {
        where: {
          marketType: { in: ["moneyline", "spread", "total"] },
          sourceKey: HISTORICAL_SOURCE_KEY
        },
        include: {
          sportsbook: true,
          selectionCompetitor: {
            include: {
              team: true
            }
          },
          snapshots: {
            orderBy: [{ capturedAt: "asc" }]
          }
        }
      }
    }
  });
}

async function loadHistoricalHarvestResponse() {
  const response = await fetch(`${SHARKEDGE_BACKEND_URL}/api/historical/odds/harvest?sport_key=baseball_mlb`, {
    cache: "no-store",
    signal: AbortSignal.timeout(90_000)
  });

  if (!response.ok) {
    throw new Error(`Historical MLB harvest request failed with ${response.status}.`);
  }

  return (await response.json()) as HistoricalOddsHarvestResponse;
}

function buildHistoricalGameIndex(games: HistoricalHarvestGame[]) {
  const index = new Map<string, HistoricalHarvestGame[]>();

  for (const game of games) {
    const key = buildHistoricalMatchKey(game.away_team, game.home_team);
    const existing = index.get(key);
    if (existing) {
      existing.push(game);
    } else {
      index.set(key, [game]);
    }
  }

  return index;
}

function selectMatchingHistoricalGame(args: {
  event: HistoricalEventRow;
  candidates: HistoricalHarvestGame[];
}) {
  if (!args.candidates.length) {
    return { game: null as HistoricalHarvestGame | null, ambiguous: false };
  }

  if (args.candidates.length === 1) {
    return { game: args.candidates[0] ?? null, ambiguous: false };
  }

  const eventStart = parseDate(args.event.startTime);
  if (!eventStart) {
    return { game: null, ambiguous: true };
  }

  const ranked = args.candidates
    .map((game) => ({
      game,
      deltaMinutes: Math.abs(
        ((parseDate(game.commence_time)?.getTime() ?? Number.POSITIVE_INFINITY) - eventStart.getTime()) / 60000
      )
    }))
    .sort((left, right) => left.deltaMinutes - right.deltaMinutes);

  const best = ranked[0] ?? null;
  const second = ranked[1] ?? null;

  if (!best || !Number.isFinite(best.deltaMinutes) || best.deltaMinutes > 12 * 60) {
    return { game: null, ambiguous: true };
  }

  if (second && Math.abs(second.deltaMinutes - best.deltaMinutes) < 15) {
    return { game: null, ambiguous: true };
  }

  return { game: best.game, ambiguous: false };
}

function summarizeHistoricalCoverage(args: {
  totalEvents: number;
  moneylineCount: number;
  totalCount: number;
  runlineCount: number;
  archivedFallbackMoneylineCount: number;
  archivedFallbackTotalCount: number;
  archivedFallbackRunlineCount: number;
  ambiguousMatches: number;
  harvestGameCount: number;
  normalizationWarnings: string[];
}) {
  const warnings = [...args.normalizationWarnings];

  warnings.push(
    `Historical MLB moneylines found for ${args.moneylineCount} of ${args.totalEvents} finalized events.`
  );
  warnings.push(
    `Historical MLB totals found for ${args.totalCount} of ${args.totalEvents} finalized events.`
  );
  warnings.push(
    `Historical MLB runlines found for ${args.runlineCount} of ${args.totalEvents} finalized events.`
  );

  if (args.archivedFallbackMoneylineCount > 0 || args.archivedFallbackTotalCount > 0 || args.archivedFallbackRunlineCount > 0) {
    warnings.push(
      `Archived pregame bookmaker payloads supplied fallback historical moneylines for ${args.archivedFallbackMoneylineCount}, totals for ${args.archivedFallbackTotalCount}, and runlines for ${args.archivedFallbackRunlineCount} finalized MLB events.`
    );
  }

  if (args.harvestGameCount === 0) {
    warnings.push("Historical MLB harvest returned no archived games.");
  }

  if (args.ambiguousMatches > 0) {
    warnings.push(
      `Skipped archived historical market attachment for ${args.ambiguousMatches} finalized MLB events because matchup/date matching was ambiguous.`
    );
  }

  return warnings;
}

async function loadHistoricalTrendInputEnvelope(): Promise<HistoricalTrendInputEnvelope> {
  const [events, historicalHarvestResult] = await Promise.allSettled([
    fetchRawHistoricalEvents(),
    loadHistoricalHarvestResponse()
  ]);

  if (events.status !== "fulfilled") {
    throw events.reason;
  }

  const warnings: string[] = [];
  const finalizedEvents = events.value;

  let harvestedGames: HistoricalHarvestGame[] = [];
  if (historicalHarvestResult.status === "fulfilled") {
    const sport = historicalHarvestResult.value.sports.find((entry) => entry.key === "baseball_mlb");
    harvestedGames = sport?.games ?? [];

    if (Array.isArray(historicalHarvestResult.value.errors) && historicalHarvestResult.value.errors.length) {
      warnings.push(...historicalHarvestResult.value.errors.map((error) => `Historical MLB harvest warning: ${error}`));
    }
  } else {
    warnings.push("Historical MLB harvest request failed; using persisted historical markets only.");
  }

  const indexedGames = buildHistoricalGameIndex(harvestedGames);
  let moneylineCount = 0;
  let totalCount = 0;
  let runlineCount = 0;
  let archivedFallbackMoneylineCount = 0;
  let archivedFallbackTotalCount = 0;
  let archivedFallbackRunlineCount = 0;
  let ambiguousMatches = 0;

  const rows = finalizedEvents.map((event) => {
    const teams = getHistoricalEventTeams(event);
    const candidates = indexedGames.get(buildHistoricalMatchKey(teams.awayTeamName, teams.homeTeamName)) ?? [];
    const matchedHistorical = selectMatchingHistoricalGame({
      event,
      candidates
    });

    if (matchedHistorical.ambiguous) {
      ambiguousMatches += 1;
    }

    const extraction = extractHistoricalTrendMarkets({
      structuredMarkets: event.markets,
      historicalGame: matchedHistorical.game,
      scheduledStart: event.startTime,
      homeTeamName: teams.homeTeamName ?? "",
      awayTeamName: teams.awayTeamName ?? "",
      homeCompetitorId: teams.homeCompetitorId,
      awayCompetitorId: teams.awayCompetitorId
    });

    if (extraction.sourceByMarketType.moneyline !== "none") {
      moneylineCount += 1;
      if (extraction.sourceByMarketType.moneyline === "archived_historical_bookmaker") {
        archivedFallbackMoneylineCount += 1;
      }
    }

    if (extraction.sourceByMarketType.total !== "none") {
      totalCount += 1;
      if (extraction.sourceByMarketType.total === "archived_historical_bookmaker") {
        archivedFallbackTotalCount += 1;
      }
    }

    if (extraction.sourceByMarketType.runline !== "none") {
      runlineCount += 1;
      if (extraction.sourceByMarketType.runline === "archived_historical_bookmaker") {
        archivedFallbackRunlineCount += 1;
      }
    }

    return {
      ...event,
      markets: extraction.markets,
      source: extraction.markets.length ? HISTORICAL_SOURCE_KEY : event.providerKey ?? null
    };
  });

  return {
    rows,
    warnings: summarizeHistoricalCoverage({
      totalEvents: finalizedEvents.length,
      moneylineCount,
      totalCount,
      runlineCount,
      archivedFallbackMoneylineCount,
      archivedFallbackTotalCount,
      archivedFallbackRunlineCount,
      ambiguousMatches,
      harvestGameCount: harvestedGames.length,
      normalizationWarnings: warnings
    })
  };
}

function selectPreferredBoardResponse(candidates: Array<BoardResponseCandidate | null>) {
  const viableCandidates = candidates.filter(
    (candidate): candidate is BoardResponseCandidate => Boolean(candidate?.response?.configured)
  );

  if (!viableCandidates.length) {
    return null;
  }

  return [...viableCandidates].sort((left, right) => scoreBoardCandidate(right) - scoreBoardCandidate(left))[0]
    ?.response ?? null;
}

export async function loadRawMlbHistoricalTrendInputs(): Promise<unknown[]> {
  return (await loadHistoricalTrendInputEnvelope()).rows;
}

export async function loadRawMlbBoardTrendInputs(): Promise<unknown[]> {
  // OddsHarvester/SportsDataverse via backend (removed paid providers)
  const backendResponse = await backendCurrentOddsProvider.fetchBoard();

  const response = selectPreferredBoardResponse([
    backendResponse ? { providerKey: backendCurrentOddsProvider.key, response: backendResponse } : null
  ]);

  if (!response?.configured) {
    return [];
  }

  const sport = response.sports.find((entry) => entry.key === "baseball_mlb");
  if (!sport) {
    return [];
  }

  return sport.games.map((game) => ({
    ...game,
    source: response.provider ?? response.provider_mode ?? "current-odds",
    status: "PREGAME"
  }));
}

export async function loadNormalizedMlbHistoricalTrendRows(
  service: MlbHistoricalNormalizationService = new DefaultMlbHistoricalNormalizationService()
): Promise<MlbHistoricalNormalizationResult> {
  const input = await loadHistoricalTrendInputEnvelope();
  const normalized = service.normalizeHistoricalGames(input.rows);
  return {
    rows: normalized.rows,
    warnings: [...input.warnings, ...normalized.warnings]
  };
}

export async function loadNormalizedMlbBoardTrendRows(
  service: MlbBoardNormalizationService = new DefaultMlbBoardNormalizationService()
): Promise<MlbBoardNormalizationResult> {
  const input = await loadRawMlbBoardTrendInputs();
  return service.normalizeBoardGames(input);
}
