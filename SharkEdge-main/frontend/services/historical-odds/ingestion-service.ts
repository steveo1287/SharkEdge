import { Prisma } from "@prisma/client";

import { getServerDatabaseResolution, hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import type { LeagueKey, SportCode } from "@/lib/types/domain";
import { americanToDecimal, americanToImpliedProbability } from "@/lib/utils/odds";
import { getBackendBaseUrl } from "@/services/backend/base-url";
import { deriveCoverResult, deriveOuResult } from "@/services/events/result-normalization";
import { invalidateTrendCache } from "@/services/trends/cache";

import type {
  HistoricalOddsBookmaker,
  HistoricalOddsGame,
  HistoricalOddsHarvestResponse,
  HistoricalOddsIngestionResult,
  HistoricalOddsOutcome
} from "./provider-types";

const HISTORICAL_SOURCE_KEY = "oddsharvester_historical" as const;
const HISTORICAL_BACKEND_TIMEOUT_MS = 90_000;
const PRE_EVENT_LONG_BUCKET_MINUTES = 30;
const PRE_EVENT_MEDIUM_BUCKET_MINUTES = 10;
const PRE_EVENT_TIGHT_BUCKET_MINUTES = 3;

const HISTORICAL_LEAGUE_CONFIG = {
  NBA: {
    backendSportKey: "basketball_nba",
    leagueName: "NBA",
    sportProfileKey: "basketball",
    sportName: "Basketball",
    sportCode: "BASKETBALL" as SportCode,
    category: "team"
  },
  NCAAB: {
    backendSportKey: "basketball_ncaab",
    leagueName: "NCAA Men's Basketball",
    sportProfileKey: "basketball",
    sportName: "Basketball",
    sportCode: "BASKETBALL" as SportCode,
    category: "team"
  },
  MLB: {
    backendSportKey: "baseball_mlb",
    leagueName: "Major League Baseball",
    sportProfileKey: "baseball",
    sportName: "Baseball",
    sportCode: "BASEBALL" as SportCode,
    category: "team"
  },
  NHL: {
    backendSportKey: "icehockey_nhl",
    leagueName: "National Hockey League",
    sportProfileKey: "hockey",
    sportName: "Hockey",
    sportCode: "HOCKEY" as SportCode,
    category: "team"
  },
  NFL: {
    backendSportKey: "americanfootball_nfl",
    leagueName: "National Football League",
    sportProfileKey: "football",
    sportName: "Football",
    sportCode: "FOOTBALL" as SportCode,
    category: "team"
  },
  NCAAF: {
    backendSportKey: "americanfootball_ncaaf",
    leagueName: "College Football",
    sportProfileKey: "football",
    sportName: "Football",
    sportCode: "FOOTBALL" as SportCode,
    category: "team"
  }
} satisfies Partial<
  Record<
    LeagueKey,
    {
      backendSportKey: string;
      leagueName: string;
      sportProfileKey: string;
      sportName: string;
      sportCode: SportCode;
      category: string;
    }
  >
>;

const ESPN_HISTORICAL_SCOREBOARD_PATHS: Record<SupportedHistoricalLeagueKey, string> = {
  NBA: "basketball/nba",
  NCAAB: "basketball/mens-college-basketball",
  MLB: "baseball/mlb",
  NHL: "hockey/nhl",
  NFL: "football/nfl",
  NCAAF: "football/college-football"
};

const ESPN_SCOREBOARD_CACHE = new Map<string, Array<Record<string, unknown>>>();

type SupportedHistoricalLeagueKey = keyof typeof HISTORICAL_LEAGUE_CONFIG;

function normalizeToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function formatEspnDate(date: Date) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

async function fetchEspnScoreboardByDate(
  leagueKey: SupportedHistoricalLeagueKey,
  date: Date
) {
  const path = ESPN_HISTORICAL_SCOREBOARD_PATHS[leagueKey];
  const cacheKey = `${leagueKey}:${formatEspnDate(date)}`;
  const cached = ESPN_SCOREBOARD_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  const response = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?limit=100&dates=${formatEspnDate(date)}`,
    {
      headers: {
        "User-Agent": "Mozilla/5.0 SharkEdge/1.5"
      },
      cache: "no-store",
      signal: AbortSignal.timeout(30000)
    }
  );

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as { events?: Array<Record<string, unknown>> };
  const events = Array.isArray(payload.events) ? payload.events : [];
  ESPN_SCOREBOARD_CACHE.set(cacheKey, events);
  return events;
}

function findHistoricalScoreMatch(
  events: Array<Record<string, unknown>>,
  game: HistoricalOddsGame
) {
  const targetHome = normalizeToken(game.home_team);
  const targetAway = normalizeToken(game.away_team);

  return (
    events.find((event) => {
      const competition =
        Array.isArray(event.competitions) && event.competitions[0] && typeof event.competitions[0] === "object"
          ? (event.competitions[0] as Record<string, unknown>)
          : null;
      const competitors = Array.isArray(competition?.competitors)
        ? (competition?.competitors as Array<Record<string, unknown>>)
        : [];
      const home = competitors.find(
        (competitor) => String(competitor.homeAway ?? "").toLowerCase() === "home"
      );
      const away = competitors.find(
        (competitor) => String(competitor.homeAway ?? "").toLowerCase() === "away"
      );

      const homeName = normalizeToken(String((home?.team as Record<string, unknown> | undefined)?.displayName ?? ""));
      const awayName = normalizeToken(String((away?.team as Record<string, unknown> | undefined)?.displayName ?? ""));

      return homeName === targetHome && awayName === targetAway;
    }) ?? null
  );
}

async function findHistoricalResultEvent(
  leagueKey: SupportedHistoricalLeagueKey,
  game: HistoricalOddsGame,
  capturedAt: Date
) {
  const baseDate = new Date(game.commence_time ?? capturedAt.toISOString());
  const datesToTry = [0, -1, 1].map((offset) => {
    const copy = new Date(baseDate);
    copy.setUTCDate(copy.getUTCDate() + offset);
    return copy;
  });

  for (const date of datesToTry) {
    const events = await fetchEspnScoreboardByDate(leagueKey, date);
    const match = findHistoricalScoreMatch(events, game);
    if (match) {
      return match;
    }
  }

  return null;
}

async function applyHistoricalResultFromEspn(
  tx: Prisma.TransactionClient,
  args: {
    leagueKey: SupportedHistoricalLeagueKey;
    eventId: string;
    game: HistoricalOddsGame;
    awayCompetitorId: string;
    homeCompetitorId: string;
    capturedAt: Date;
  }
) {
  const matchedEvent = await findHistoricalResultEvent(args.leagueKey, args.game, args.capturedAt);
  if (!matchedEvent) {
    return false;
  }

  const competition =
    Array.isArray(matchedEvent.competitions) && matchedEvent.competitions[0] && typeof matchedEvent.competitions[0] === "object"
      ? (matchedEvent.competitions[0] as Record<string, unknown>)
      : null;
  const competitors = Array.isArray(competition?.competitors)
    ? (competition?.competitors as Array<Record<string, unknown>>)
    : [];
  const home = competitors.find(
    (competitor) => String(competitor.homeAway ?? "").toLowerCase() === "home"
  );
  const away = competitors.find(
    (competitor) => String(competitor.homeAway ?? "").toLowerCase() === "away"
  );
  const statusType = ((matchedEvent.status ?? {}) as Record<string, unknown>).type as
    | Record<string, unknown>
    | undefined;
  const statusState = String(statusType?.state ?? "").toLowerCase();

  if (statusState !== "post") {
    return false;
  }

  const homeScore = readNumber(home?.score);
  const awayScore = readNumber(away?.score);
  const homeWinner = typeof home?.winner === "boolean" ? home.winner : null;
  const awayWinner = typeof away?.winner === "boolean" ? away.winner : null;
  const competitionStatus =
    typeof competition?.status === "object" && competition.status
      ? (competition.status as Record<string, unknown>)
      : null;
  const normalizedPeriod =
    typeof competitionStatus?.period === "number" ? competitionStatus.period : null;

  await tx.event.update({
    where: {
      id: args.eventId
    },
    data: {
      status: "FINAL",
      resultState: "OFFICIAL",
      scoreJson: {
        homeScore,
        awayScore
      },
      stateJson: {
        detail:
          (typeof statusType?.detail === "string" && statusType.detail) ||
          (typeof statusType?.shortDetail === "string" ? statusType.shortDetail : null),
        shortDetail: typeof statusType?.shortDetail === "string" ? statusType.shortDetail : null,
        period: normalizedPeriod
      },
      resultJson: {
        completed: true,
        source: "espn_scoreboard_match"
      },
      lastSyncedAt: args.capturedAt,
      syncState: "FRESH"
    }
  });

  await Promise.all([
    tx.eventParticipant.updateMany({
      where: {
        eventId: args.eventId,
        competitorId: args.awayCompetitorId
      },
      data: {
        score: awayScore === null ? null : String(awayScore),
        isWinner: awayWinner
      }
    }),
    tx.eventParticipant.updateMany({
      where: {
        eventId: args.eventId,
        competitorId: args.homeCompetitorId
      },
      data: {
        score: homeScore === null ? null : String(homeScore),
        isWinner: homeWinner
      }
    })
  ]);

  const winnerCompetitorId =
    homeWinner === true
      ? args.homeCompetitorId
      : awayWinner === true
        ? args.awayCompetitorId
        : homeScore !== null && awayScore !== null
          ? homeScore > awayScore
            ? args.homeCompetitorId
            : awayScore > homeScore
              ? args.awayCompetitorId
              : null
          : null;
  const loserCompetitorId =
    winnerCompetitorId === args.homeCompetitorId
      ? args.awayCompetitorId
      : winnerCompetitorId === args.awayCompetitorId
        ? args.homeCompetitorId
        : null;

  await tx.eventResult.upsert({
    where: {
      eventId: args.eventId
    },
    update: {
      winnerCompetitorId,
      loserCompetitorId,
      winningSide:
        winnerCompetitorId === args.homeCompetitorId
          ? "HOME"
          : winnerCompetitorId === args.awayCompetitorId
            ? "AWAY"
            : null,
      period:
        typeof competition?.status === "object" &&
        typeof (competition.status as Record<string, unknown>).period === "number"
          ? String((competition.status as Record<string, unknown>).period)
          : null,
      margin:
        homeScore !== null && awayScore !== null ? Math.abs(homeScore - awayScore) : null,
      totalPoints:
        homeScore !== null && awayScore !== null ? homeScore + awayScore : null,
      participantResultsJson: {
        away: {
          competitorId: args.awayCompetitorId,
          name: args.game.away_team,
          score: awayScore,
          isWinner: awayWinner
        },
        home: {
          competitorId: args.homeCompetitorId,
          name: args.game.home_team,
          score: homeScore,
          isWinner: homeWinner
        }
      },
      metadataJson: {
        source: "espn_scoreboard_match",
        detail:
          (typeof statusType?.detail === "string" && statusType.detail) ||
          (typeof statusType?.shortDetail === "string" ? statusType.shortDetail : null)
      },
      officialAt: args.capturedAt
    },
    create: {
      eventId: args.eventId,
      winnerCompetitorId,
      loserCompetitorId,
      winningSide:
        winnerCompetitorId === args.homeCompetitorId
          ? "HOME"
          : winnerCompetitorId === args.awayCompetitorId
            ? "AWAY"
            : null,
      period:
        typeof competition?.status === "object" &&
        typeof (competition.status as Record<string, unknown>).period === "number"
          ? String((competition.status as Record<string, unknown>).period)
          : null,
      margin:
        homeScore !== null && awayScore !== null ? Math.abs(homeScore - awayScore) : null,
      totalPoints:
        homeScore !== null && awayScore !== null ? homeScore + awayScore : null,
      participantResultsJson: {
        away: {
          competitorId: args.awayCompetitorId,
          name: args.game.away_team,
          score: awayScore,
          isWinner: awayWinner
        },
        home: {
          competitorId: args.homeCompetitorId,
          name: args.game.home_team,
          score: homeScore,
          isWinner: homeWinner
        }
      },
      metadataJson: {
        source: "espn_scoreboard_match",
        detail:
          (typeof statusType?.detail === "string" && statusType.detail) ||
          (typeof statusType?.shortDetail === "string" ? statusType.shortDetail : null)
      },
      officialAt: args.capturedAt
    }
  });

  return true;
}

function deriveAbbreviation(name: string) {
  const parts = name
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean);

  if (parts.length >= 2) {
    return parts
      .slice(0, 3)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }

  return name.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase();
}

function bucketDate(date: Date, bucketMinutes: number) {
  const bucketMs = bucketMinutes * 60 * 1000;
  return new Date(Math.floor(date.getTime() / bucketMs) * bucketMs);
}

function getSnapshotBucketMinutes(game: HistoricalOddsGame, capturedAt: Date) {
  if (!game.commence_time) {
    return PRE_EVENT_MEDIUM_BUCKET_MINUTES;
  }

  const startTime = new Date(game.commence_time);
  const diffMinutes = (startTime.getTime() - capturedAt.getTime()) / (60 * 1000);

  if (diffMinutes <= 90) {
    return PRE_EVENT_TIGHT_BUCKET_MINUTES;
  }

  if (diffMinutes <= 6 * 60) {
    return PRE_EVENT_MEDIUM_BUCKET_MINUTES;
  }

  return PRE_EVENT_LONG_BUCKET_MINUTES;
}

function getSnapshotBucketCapturedAt(game: HistoricalOddsGame, capturedAt: Date) {
  return bucketDate(capturedAt, getSnapshotBucketMinutes(game, capturedAt));
}

function getSupportedHistoricalLeagues() {
  return Object.keys(HISTORICAL_LEAGUE_CONFIG) as SupportedHistoricalLeagueKey[];
}

function getBackendSportKey(leagueKey: SupportedHistoricalLeagueKey) {
  return HISTORICAL_LEAGUE_CONFIG[leagueKey].backendSportKey;
}

function resolveLeagueKeyFromSportKey(sportKey: string) {
  return (
    getSupportedHistoricalLeagues().find(
      (leagueKey) => HISTORICAL_LEAGUE_CONFIG[leagueKey].backendSportKey === sportKey
    ) ?? null
  );
}

function assertHistoricalStorageAvailable() {
  if (!hasUsableServerDatabaseUrl()) {
    const resolution = getServerDatabaseResolution();
    throw new Error(
      `Historical odds storage requires Postgres. Set DATABASE_URL, POSTGRES_PRISMA_URL, or POSTGRES_URL before running OddsHarvester ingestion. Current source: ${resolution.key ?? "none"}.`
    );
  }
}

async function fetchBackendJson<T>(path: string) {
  const response = await fetch(`${getBackendBaseUrl()}${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(HISTORICAL_BACKEND_TIMEOUT_MS)
  });

  if (!response.ok) {
    throw new Error(`Historical odds backend request failed: ${response.status} ${path}`);
  }

  return (await response.json()) as T;
}

export async function getHistoricalOddsProviderStatus() {
  return fetchBackendJson<Record<string, unknown>>("/api/historical/odds/provider-status");
}

async function fetchHistoricalHarvest(
  league: SupportedHistoricalLeagueKey | "ALL"
): Promise<HistoricalOddsHarvestResponse> {
  const sportKey =
    league === "ALL" ? null : encodeURIComponent(getBackendSportKey(league));
  const path = sportKey
    ? `/api/historical/odds/harvest?sport_key=${sportKey}`
    : "/api/historical/odds/harvest";

  return fetchBackendJson<HistoricalOddsHarvestResponse>(path);
}

async function ensureLeagueProfile(
  tx: Prisma.TransactionClient,
  leagueKey: SupportedHistoricalLeagueKey
) {
  const config = HISTORICAL_LEAGUE_CONFIG[leagueKey];
  const sport = await tx.sport.upsert({
    where: {
      key: config.sportProfileKey
    },
    update: {
      name: config.sportName,
      code: config.sportCode,
      category: config.category
    },
    create: {
      key: config.sportProfileKey,
      name: config.sportName,
      code: config.sportCode,
      category: config.category
    }
  });

  const league = await tx.league.upsert({
    where: {
      key: leagueKey
    },
    update: {
      name: config.leagueName,
      sport: config.sportCode,
      sportId: sport.id
    },
    create: {
      key: leagueKey,
      name: config.leagueName,
      sport: config.sportCode,
      sportId: sport.id
    }
  });

  return {
    sport,
    league
  };
}

async function ensureCompetitor(
  tx: Prisma.TransactionClient,
  args: {
    leagueKey: SupportedHistoricalLeagueKey;
    sportId: string;
    leagueId: string;
    name: string;
  }
) {
  const key = `${args.leagueKey}:${normalizeToken(args.name)}`;

  return tx.competitor.upsert({
    where: {
      key
    },
    update: {
      name: args.name,
      shortName: args.name,
      abbreviation: deriveAbbreviation(args.name),
      type: "TEAM",
      sportId: args.sportId,
      leagueId: args.leagueId,
      metadataJson: {
        sourceType: "HARVESTED_HISTORICAL"
      },
      externalIds: {
        oddsharvester: args.name
      }
    },
    create: {
      key,
      type: "TEAM",
      name: args.name,
      shortName: args.name,
      abbreviation: deriveAbbreviation(args.name),
      sportId: args.sportId,
      leagueId: args.leagueId,
      metadataJson: {
        sourceType: "HARVESTED_HISTORICAL"
      },
      externalIds: {
        oddsharvester: args.name
      }
    }
  });
}

async function ensureSportsbook(tx: Prisma.TransactionClient, bookmaker: HistoricalOddsBookmaker) {
  return tx.sportsbook.upsert({
    where: {
      key: bookmaker.key
    },
    update: {
      name: bookmaker.title,
      region: "US",
      isActive: true
    },
    create: {
      key: bookmaker.key,
      name: bookmaker.title,
      region: "US",
      isActive: true
    }
  });
}

function getSelectionRole(
  outcome: HistoricalOddsOutcome,
  game: HistoricalOddsGame
): "AWAY" | "HOME" | "OVER" | "UNDER" | null {
  const normalizedName = normalizeToken(outcome.name ?? "");

  if (normalizedName === "over") {
    return "OVER";
  }

  if (normalizedName === "under") {
    return "UNDER";
  }

  if (normalizedName === normalizeToken(game.away_team)) {
    return "AWAY";
  }

  if (normalizedName === normalizeToken(game.home_team)) {
    return "HOME";
  }

  return null;
}

function resolveSelectionCompetitorId(args: {
  side: "AWAY" | "HOME" | "OVER" | "UNDER" | null;
  outcome: HistoricalOddsOutcome;
  game: HistoricalOddsGame;
  awayCompetitorId: string;
  homeCompetitorId: string;
}) {
  if (args.side === "AWAY") {
    return args.awayCompetitorId;
  }

  if (args.side === "HOME") {
    return args.homeCompetitorId;
  }

  const normalizedSelection = normalizeToken(args.outcome.name ?? "");
  const awayTokens = [args.game.away_team, args.game.away_team.split(" ").at(-1) ?? ""].map(normalizeToken);
  const homeTokens = [args.game.home_team, args.game.home_team.split(" ").at(-1) ?? ""].map(normalizeToken);

  if (awayTokens.some((token) => token && token === normalizedSelection)) {
    return args.awayCompetitorId;
  }

  if (homeTokens.some((token) => token && token === normalizedSelection)) {
    return args.homeCompetitorId;
  }

  return null;
}

async function refreshHistoricalMarketAnchors(
  tx: Prisma.TransactionClient,
  eventMarketId: string
) {
  const snapshots = await tx.eventMarketSnapshot.findMany({
    where: {
      eventMarketId
    },
    orderBy: {
      capturedAt: "asc"
    },
    select: {
      line: true,
      oddsAmerican: true
    }
  });

  const openingSnapshot = snapshots[0] ?? null;
  const closingSnapshot = snapshots.at(-1) ?? null;

  if (!openingSnapshot || !closingSnapshot) {
    return;
  }

  await tx.eventMarket.update({
    where: {
      id: eventMarketId
    },
    data: {
      openingLine: openingSnapshot.line ?? null,
      currentLine: closingSnapshot.line ?? null,
      closingLine: closingSnapshot.line ?? null,
      openingOdds: openingSnapshot.oddsAmerican,
      currentOdds: closingSnapshot.oddsAmerican,
      closingOdds: closingSnapshot.oddsAmerican
    }
  });
}

async function refreshHistoricalEventResultOutcomes(
  tx: Prisma.TransactionClient,
  args: {
    eventId: string;
    awayCompetitorId: string;
    homeCompetitorId: string;
  }
) {
  const event = await tx.event.findUnique({
    where: {
      id: args.eventId
    },
    include: {
      eventResult: true,
      markets: {
        where: {
          marketType: {
            in: ["spread", "total"]
          }
        },
        select: {
          id: true,
          marketType: true,
          side: true,
          line: true,
          selectionCompetitorId: true
        }
      }
    }
  });

  if (!event?.eventResult) {
    return;
  }

  const participantResults =
    event.eventResult.participantResultsJson &&
    typeof event.eventResult.participantResultsJson === "object"
      ? (event.eventResult.participantResultsJson as Record<string, { score?: number | null }>)
      : {};
  const awayScore = participantResults.away?.score ?? null;
  const homeScore = participantResults.home?.score ?? null;

  const coverResult = deriveCoverResult({
    markets: event.markets,
    awayCompetitorId: args.awayCompetitorId,
    homeCompetitorId: args.homeCompetitorId,
    awayScore,
    homeScore
  });
  const ouResult = deriveOuResult({
    markets: event.markets,
    totalPoints: event.eventResult.totalPoints
  });

  await tx.eventResult.update({
    where: {
      eventId: args.eventId
    },
    data: {
      coverResult: coverResult ?? Prisma.JsonNull,
      ouResult
    }
  });
}

function buildMarketLabel(
  marketType: "moneyline" | "spread" | "total",
  outcome: HistoricalOddsOutcome
) {
  const outcomeName = outcome.name ?? "Selection";
  const pointLabel =
    typeof outcome.point === "number"
      ? ` ${outcome.point > 0 ? "+" : ""}${outcome.point}`
      : "";

  if (marketType === "moneyline") {
    return `${outcomeName} moneyline`;
  }

  if (marketType === "spread") {
    return `${outcomeName} spread${pointLabel}`;
  }

  return `${outcomeName} ${typeof outcome.point === "number" ? outcome.point : ""}`.trim();
}

async function upsertHistoricalMarket(
  tx: Prisma.TransactionClient,
  args: {
    eventId: string;
    sportsbookId: string;
    marketType: "moneyline" | "spread" | "total";
    outcome: HistoricalOddsOutcome;
    game: HistoricalOddsGame;
    awayCompetitorId: string;
    homeCompetitorId: string;
    capturedAt: Date;
  }
) {
  if (typeof args.outcome.price !== "number") {
    return null;
  }

  const side = getSelectionRole(args.outcome, args.game);
  const selectionCompetitorId = resolveSelectionCompetitorId({
    side,
    outcome: args.outcome,
    game: args.game,
    awayCompetitorId: args.awayCompetitorId,
    homeCompetitorId: args.homeCompetitorId
  });

  const bucketCapturedAt = getSnapshotBucketCapturedAt(args.game, args.capturedAt);
  const existing = await tx.eventMarket.findFirst({
    where: {
      eventId: args.eventId,
      sportsbookId: args.sportsbookId,
      marketType: args.marketType,
      selection: args.outcome.name ?? "Selection",
      side,
      line: args.outcome.point ?? null,
      sourceKey: HISTORICAL_SOURCE_KEY
    },
    orderBy: {
      updatedAt: "desc"
    }
  });

  const eventMarket = existing
    ? await tx.eventMarket.update({
        where: {
          id: existing.id
        },
        data: {
          marketLabel: buildMarketLabel(args.marketType, args.outcome),
          selection: args.outcome.name ?? "Selection",
          side,
          line: args.outcome.point ?? null,
          oddsAmerican: args.outcome.price,
          oddsDecimal: americanToDecimal(args.outcome.price),
          impliedProbability: americanToImpliedProbability(args.outcome.price),
          isLive: false,
          sourceKey: HISTORICAL_SOURCE_KEY,
          selectionCompetitorId,
          updatedAt: args.capturedAt
        }
      })
    : await tx.eventMarket.create({
        data: {
          eventId: args.eventId,
          sportsbookId: args.sportsbookId,
          marketType: args.marketType,
          marketLabel: buildMarketLabel(args.marketType, args.outcome),
          selection: args.outcome.name ?? "Selection",
          side,
          line: args.outcome.point ?? null,
          oddsAmerican: args.outcome.price,
          oddsDecimal: americanToDecimal(args.outcome.price),
          impliedProbability: americanToImpliedProbability(args.outcome.price),
          isLive: false,
          sourceKey: HISTORICAL_SOURCE_KEY,
          selectionCompetitorId,
          updatedAt: args.capturedAt
        }
      });

  const existingSnapshot = await tx.eventMarketSnapshot.findFirst({
    where: {
      eventMarketId: eventMarket.id,
      capturedAt: bucketCapturedAt
    },
    select: {
      id: true,
      line: true,
      oddsAmerican: true
    }
  });

  if (existingSnapshot) {
    if (
      existingSnapshot.line !== (args.outcome.point ?? null) ||
      existingSnapshot.oddsAmerican !== args.outcome.price
    ) {
      await tx.eventMarketSnapshot.update({
        where: {
          id: existingSnapshot.id
        },
        data: {
          line: args.outcome.point ?? null,
          oddsAmerican: args.outcome.price,
          impliedProbability: americanToImpliedProbability(args.outcome.price)
        }
      });
    }
  } else {
    await tx.eventMarketSnapshot.create({
      data: {
        eventMarketId: eventMarket.id,
        capturedAt: bucketCapturedAt,
        line: args.outcome.point ?? null,
        oddsAmerican: args.outcome.price,
        impliedProbability: americanToImpliedProbability(args.outcome.price)
      }
    });
  }

  await refreshHistoricalMarketAnchors(tx, eventMarket.id);

  return eventMarket.id;
}

async function ingestHistoricalGame(
  tx: Prisma.TransactionClient,
  args: {
    leagueKey: SupportedHistoricalLeagueKey;
    game: HistoricalOddsGame;
    capturedAt: Date;
  }
) {
  const { sport, league } = await ensureLeagueProfile(tx, args.leagueKey);
  const awayCompetitor = await ensureCompetitor(tx, {
    leagueKey: args.leagueKey,
    sportId: sport.id,
    leagueId: league.id,
    name: args.game.away_team
  });
  const homeCompetitor = await ensureCompetitor(tx, {
    leagueKey: args.leagueKey,
    sportId: sport.id,
    leagueId: league.id,
    name: args.game.home_team
  });
  const event = await tx.event.upsert({
    where: {
      externalEventId: `${HISTORICAL_SOURCE_KEY}:${args.game.id}`
    },
    update: {
      sportId: sport.id,
      leagueId: league.id,
      providerKey: HISTORICAL_SOURCE_KEY,
      name: `${args.game.away_team} at ${args.game.home_team}`,
      startTime: new Date(args.game.commence_time ?? args.capturedAt.toISOString()),
      status: "SCHEDULED",
      resultState: "PENDING",
      eventType: "TEAM_HEAD_TO_HEAD",
      venue: null,
      scoreJson: Prisma.JsonNull,
      stateJson: Prisma.JsonNull,
      resultJson: Prisma.JsonNull,
      metadataJson: {
        sourceType: "HARVESTED_HISTORICAL",
        bookmakersAvailable: args.game.bookmakers_available
      },
      syncState: "FRESH",
      lastSyncedAt: args.capturedAt
    },
    create: {
      externalEventId: `${HISTORICAL_SOURCE_KEY}:${args.game.id}`,
      sportId: sport.id,
      leagueId: league.id,
      providerKey: HISTORICAL_SOURCE_KEY,
      name: `${args.game.away_team} at ${args.game.home_team}`,
      startTime: new Date(args.game.commence_time ?? args.capturedAt.toISOString()),
      status: "SCHEDULED",
      resultState: "PENDING",
      eventType: "TEAM_HEAD_TO_HEAD",
      venue: null,
      scoreJson: Prisma.JsonNull,
      stateJson: Prisma.JsonNull,
      resultJson: Prisma.JsonNull,
      metadataJson: {
        sourceType: "HARVESTED_HISTORICAL",
        bookmakersAvailable: args.game.bookmakers_available
      },
      syncState: "FRESH",
      lastSyncedAt: args.capturedAt
    }
  });

  await tx.eventParticipant.deleteMany({
    where: {
      eventId: event.id
    }
  });

  await tx.eventParticipant.createMany({
    data: [
      {
        eventId: event.id,
        competitorId: awayCompetitor.id,
        role: "AWAY",
        sortOrder: 0,
        isHome: false,
        metadataJson: {
          sourceType: "HARVESTED_HISTORICAL"
        }
      },
      {
        eventId: event.id,
        competitorId: homeCompetitor.id,
        role: "HOME",
        sortOrder: 1,
        isHome: true,
        metadataJson: {
          sourceType: "HARVESTED_HISTORICAL"
        }
      }
    ]
  });

  await applyHistoricalResultFromEspn(tx, {
    leagueKey: args.leagueKey,
    eventId: event.id,
    game: args.game,
    awayCompetitorId: awayCompetitor.id,
    homeCompetitorId: homeCompetitor.id,
    capturedAt: args.capturedAt
  });

  let marketCount = 0;
  let snapshotCount = 0;

  for (const bookmaker of args.game.bookmakers) {
    const sportsbook = await ensureSportsbook(tx, bookmaker);
    const marketGroups = [
      {
        marketType: "moneyline" as const,
        outcomes: bookmaker.markets.moneyline
      },
      {
        marketType: "spread" as const,
        outcomes: bookmaker.markets.spread
      },
      {
        marketType: "total" as const,
        outcomes: bookmaker.markets.total
      }
    ];

    for (const group of marketGroups) {
      for (const outcome of group.outcomes) {
        const eventMarketId = await upsertHistoricalMarket(tx, {
          eventId: event.id,
          sportsbookId: sportsbook.id,
          marketType: group.marketType,
          outcome,
          game: args.game,
          awayCompetitorId: awayCompetitor.id,
          homeCompetitorId: homeCompetitor.id,
          capturedAt: args.capturedAt
        });

        if (eventMarketId) {
          marketCount += 1;
          snapshotCount += 1;
        }
      }
    }
  }

  await refreshHistoricalEventResultOutcomes(tx, {
    eventId: event.id,
    awayCompetitorId: awayCompetitor.id,
    homeCompetitorId: homeCompetitor.id
  });

  return {
    eventId: event.id,
    marketCount,
    snapshotCount
  };
}

export async function ingestHistoricalOddsSnapshots(
  league: SupportedHistoricalLeagueKey | "ALL" = "ALL"
): Promise<HistoricalOddsIngestionResult> {
  assertHistoricalStorageAvailable();
  const payload = await fetchHistoricalHarvest(league);

  if (!payload.configured) {
    throw new Error(payload.message ?? "Historical odds harvesting is not configured.");
  }

  const capturedAt = new Date(payload.generated_at);
  const summary = {
    sourceKey: HISTORICAL_SOURCE_KEY,
    capturedAt: capturedAt.toISOString(),
    leagues: [] as LeagueKey[],
    sportCount: 0,
    gameCount: 0,
    marketCount: 0,
    snapshotCount: 0
  };

  for (const sport of payload.sports) {
    const leagueKey = resolveLeagueKeyFromSportKey(sport.key);
    if (!leagueKey) {
      continue;
    }

    summary.leagues.push(leagueKey);
    summary.sportCount += 1;

    for (const game of sport.games) {
      const result = await prisma.$transaction((tx) =>
        ingestHistoricalGame(tx, {
          leagueKey,
          game,
          capturedAt
        })
      );

      summary.gameCount += 1;
      summary.marketCount += result.marketCount;
      summary.snapshotCount += result.snapshotCount;
    }
  }

  summary.leagues = Array.from(new Set(summary.leagues));
  await invalidateTrendCache();
  return summary;
}
