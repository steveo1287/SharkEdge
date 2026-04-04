import { MarketType, Prisma, SportCode } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { americanToImplied } from "@/lib/odds/index";
import { invalidateHotCache, readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import type { LeagueKey } from "@/lib/types/domain";
import { scopeEventExternalId } from "@/lib/utils/entity-routing";
import type { z } from "zod";
import {
  eventProjectionIngestSchema,
  ingestPayloadSchema,
  injuryIngestSchema,
  playerProjectionIngestSchema
} from "@/lib/validation/intelligence";

type IngestPayload = z.infer<typeof ingestPayloadSchema>;
type EventProjectionPayload = z.infer<typeof eventProjectionIngestSchema>;
type PlayerProjectionPayload = z.infer<typeof playerProjectionIngestSchema>;
type InjuryPayload = z.infer<typeof injuryIngestSchema>;

const SPORT_MAP: Record<string, { sport: SportCode; leagueKey: string }> = {
  nba: { sport: "BASKETBALL", leagueKey: "NBA" },
  basketball_nba: { sport: "BASKETBALL", leagueKey: "NBA" },
  ncaab: { sport: "BASKETBALL", leagueKey: "NCAAB" },
  basketball_ncaab: { sport: "BASKETBALL", leagueKey: "NCAAB" },
  mlb: { sport: "BASEBALL", leagueKey: "MLB" },
  baseball_mlb: { sport: "BASEBALL", leagueKey: "MLB" },
  nhl: { sport: "HOCKEY", leagueKey: "NHL" },
  icehockey_nhl: { sport: "HOCKEY", leagueKey: "NHL" },
  nfl: { sport: "FOOTBALL", leagueKey: "NFL" },
  americanfootball_nfl: { sport: "FOOTBALL", leagueKey: "NFL" },
  ncaaf: { sport: "FOOTBALL", leagueKey: "NCAAF" },
  americanfootball_ncaaf: { sport: "FOOTBALL", leagueKey: "NCAAF" },
  ufc: { sport: "MMA", leagueKey: "UFC" },
  boxing: { sport: "BOXING", leagueKey: "BOXING" }
};

function normalizeToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function resolveSportAndLeague(payload: IngestPayload) {
  const direct = SPORT_MAP[normalizeToken(payload.sport)];
  if (direct) {
    return direct;
  }

  const league = String(payload.sourceMeta?.league ?? "").trim();
  const mapped = SPORT_MAP[normalizeToken(league)];
  if (mapped) {
    return mapped;
  }

  throw new Error(`Unsupported sport/league combination for ${payload.sport}.`);
}

async function ensureSportLeague(payload: IngestPayload) {
  const resolved = resolveSportAndLeague(payload);
  const league = await prisma.league.findUnique({
    where: { key: resolved.leagueKey },
    include: { sportProfile: true }
  });
  if (!league || !league.sportId) {
    throw new Error(`League ${resolved.leagueKey} is missing from the database.`);
  }
  return { sportId: league.sportId, league };
}

function buildEventName(payload: IngestPayload) {
  return `${payload.awayTeam} @ ${payload.homeTeam}`;
}

function buildSelections(payload: IngestPayload, line: IngestPayload["lines"][number]) {
  return [
    {
      marketType: "moneyline" as const,
      rows: [
        {
          selection: payload.homeTeam,
          side: "home",
          line: null,
          oddsAmerican: line.odds.homeMoneyline ?? null
        },
        {
          selection: payload.awayTeam,
          side: "away",
          line: null,
          oddsAmerican: line.odds.awayMoneyline ?? null
        }
      ]
    },
    {
      marketType: "spread" as const,
      rows: [
        {
          selection: payload.homeTeam,
          side: "home",
          line: line.odds.homeSpread ?? null,
          oddsAmerican: line.odds.homeSpreadOdds ?? null
        },
        {
          selection: payload.awayTeam,
          side: "away",
          line: typeof line.odds.homeSpread === "number" ? -line.odds.homeSpread : null,
          oddsAmerican: line.odds.awaySpreadOdds ?? null
        }
      ]
    },
    {
      marketType: "total" as const,
      rows: [
        {
          selection: "Over",
          side: "over",
          line: line.odds.total ?? null,
          oddsAmerican: line.odds.overOdds ?? null
        },
        {
          selection: "Under",
          side: "under",
          line: line.odds.total ?? null,
          oddsAmerican: line.odds.underOdds ?? null
        }
      ]
    }
  ];
}

async function ensureSportsbook(bookName: string) {
  const key = normalizeToken(bookName);
  return prisma.sportsbook.upsert({
    where: { key },
    update: { name: bookName, isActive: true },
    create: { key, name: bookName, region: "global", isActive: true }
  });
}

export async function upsertOddsIngestPayload(payload: IngestPayload) {
  const { sportId, league } = await ensureSportLeague(payload);
  const scopedExternalEventId = scopeEventExternalId(league.key as LeagueKey, payload.eventKey);
  const metadataJson = payload.sourceMeta
    ? ({
        ...(payload.sourceMeta as Record<string, unknown>),
        rawExternalEventId: payload.eventKey
      } as Prisma.InputJsonValue)
    : ({
        rawExternalEventId: payload.eventKey
      } as Prisma.InputJsonValue);

  const event = await prisma.event.upsert({
    where: { externalEventId: scopedExternalEventId },
    update: {
      name: buildEventName(payload),
      startTime: new Date(payload.commenceTime),
      leagueId: league.id,
      sportId,
      providerKey: payload.source,
      metadataJson
    },
    create: {
      externalEventId: scopedExternalEventId,
      providerKey: payload.source,
      sportId,
      leagueId: league.id,
      name: buildEventName(payload),
      slug: normalizeToken(payload.eventKey),
      startTime: new Date(payload.commenceTime),
      status: "SCHEDULED",
      resultState: "PENDING",
      eventType: league.sport === "MMA" || league.sport === "BOXING" ? "COMBAT_HEAD_TO_HEAD" : "TEAM_HEAD_TO_HEAD",
      metadataJson
    }
  });

  const touchedMarketIds: string[] = [];

  for (const line of payload.lines) {
    const sportsbook = await ensureSportsbook(line.book);
    for (const market of buildSelections(payload, line)) {
      for (const row of market.rows) {
        if (typeof row.oddsAmerican !== "number") {
          continue;
        }
        const eventMarket = await prisma.eventMarket.upsert({
          where: {
            id: `${event.id}:${sportsbook.id}:${market.marketType}:${row.side}:${row.selection}:${row.line ?? "na"}`
          },
          update: {
            marketLabel: market.marketType,
            selection: row.selection,
            side: row.side,
            line: row.line,
            oddsAmerican: Math.round(row.oddsAmerican),
            oddsDecimal: row.oddsAmerican > 0 ? 1 + row.oddsAmerican / 100 : 1 + 100 / Math.abs(row.oddsAmerican),
            impliedProbability: americanToImplied(Math.round(row.oddsAmerican)),
            currentLine: row.line,
            currentOdds: Math.round(row.oddsAmerican),
            isLive: false,
            sourceKey: payload.source,
            updatedAt: new Date(line.fetchedAt)
          },
          create: {
            id: `${event.id}:${sportsbook.id}:${market.marketType}:${row.side}:${row.selection}:${row.line ?? "na"}`,
            eventId: event.id,
            sportsbookId: sportsbook.id,
            marketType: market.marketType,
            marketLabel: market.marketType,
            selection: row.selection,
            side: row.side,
            line: row.line,
            oddsAmerican: Math.round(row.oddsAmerican),
            oddsDecimal: row.oddsAmerican > 0 ? 1 + row.oddsAmerican / 100 : 1 + 100 / Math.abs(row.oddsAmerican),
            impliedProbability: americanToImplied(Math.round(row.oddsAmerican)),
            openingLine: row.line,
            currentLine: row.line,
            openingOdds: Math.round(row.oddsAmerican),
            currentOdds: Math.round(row.oddsAmerican),
            isLive: false,
            sourceKey: payload.source,
            updatedAt: new Date(line.fetchedAt)
          }
        });

        touchedMarketIds.push(eventMarket.id);

        await prisma.eventMarketSnapshot.create({
          data: {
            eventMarketId: eventMarket.id,
            capturedAt: new Date(line.fetchedAt),
            line: row.line,
            oddsAmerican: Math.round(row.oddsAmerican),
            impliedProbability: americanToImplied(Math.round(row.oddsAmerican))
          }
        });
      }
    }
  }

  await invalidateHotCache(`board:v1:${league.key}`);
  await invalidateHotCache(`event:v1:${event.id}`);

  return { eventId: event.id, eventKey: payload.eventKey, touchedMarketIds };
}

export async function ingestEventProjection(input: EventProjectionPayload) {
  const modelRun = await prisma.modelRun.upsert({
    where: { key: `${input.modelKey}:${input.modelVersion ?? "latest"}:event` },
    update: { modelName: input.modelKey, version: input.modelVersion, status: "ACTIVE" },
    create: {
      key: `${input.modelKey}:${input.modelVersion ?? "latest"}:event`,
      modelName: input.modelKey,
      version: input.modelVersion,
      status: "ACTIVE"
    }
  });

  return prisma.eventProjection.upsert({
    where: {
      modelRunId_eventId: {
        modelRunId: modelRun.id,
        eventId: input.eventId
      }
    },
    update: {
      projectedHomeScore: input.projectedHomeScore,
      projectedAwayScore: input.projectedAwayScore,
      projectedTotal: input.projectedTotal,
      projectedSpreadHome: input.projectedSpreadHome,
      winProbHome: input.winProbHome,
      winProbAway: input.winProbAway,
      metadataJson: input.metadata ? (input.metadata as Prisma.InputJsonValue) : Prisma.JsonNull
    },
    create: {
      modelRunId: modelRun.id,
      eventId: input.eventId,
      projectedHomeScore: input.projectedHomeScore,
      projectedAwayScore: input.projectedAwayScore,
      projectedTotal: input.projectedTotal,
      projectedSpreadHome: input.projectedSpreadHome,
      winProbHome: input.winProbHome,
      winProbAway: input.winProbAway,
      metadataJson: input.metadata ? (input.metadata as Prisma.InputJsonValue) : Prisma.JsonNull
    }
  });
}

export async function ingestPlayerProjection(input: PlayerProjectionPayload) {
  const modelRun = await prisma.modelRun.upsert({
    where: { key: `${input.modelKey}:${input.modelVersion ?? "latest"}:player` },
    update: { modelName: input.modelKey, version: input.modelVersion, status: "ACTIVE" },
    create: {
      key: `${input.modelKey}:${input.modelVersion ?? "latest"}:player`,
      modelName: input.modelKey,
      version: input.modelVersion,
      status: "ACTIVE"
    }
  });

  return prisma.playerProjection.create({
    data: {
      modelRunId: modelRun.id,
      eventId: input.eventId,
      playerId: input.playerId,
      statKey: input.statKey,
      meanValue: input.meanValue,
      medianValue: input.medianValue,
      stdDev: input.stdDev,
      hitProbOver: input.hitProbOver ? (input.hitProbOver as Prisma.InputJsonValue) : Prisma.JsonNull,
      hitProbUnder: input.hitProbUnder ? (input.hitProbUnder as Prisma.InputJsonValue) : Prisma.JsonNull,
      metadataJson: input.metadata ? (input.metadata as Prisma.InputJsonValue) : Prisma.JsonNull
    }
  });
}

export async function ingestInjury(input: InjuryPayload) {
  return prisma.injury.create({
    data: {
      leagueId: input.leagueId,
      teamId: input.teamId,
      playerId: input.playerId,
      gameId: input.gameId,
      status: input.status,
      source: input.source,
      description: input.description,
      effectiveAt: input.effectiveAt ? new Date(input.effectiveAt) : undefined,
      reportedAt: new Date(input.reportedAt),
      metadataJson: input.metadata ? (input.metadata as Prisma.InputJsonValue) : Prisma.JsonNull
    }
  });
}

export async function getBoardFeed(
  leagueKey?: string,
  options?: { skipCache?: boolean }
) {
  const cacheKey = `board:v1:${leagueKey ?? "all"}`;
  if (!options?.skipCache) {
    const cached = await readHotCache<unknown>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const events = await prisma.event.findMany({
    where: {
      ...(leagueKey ? { league: { key: leagueKey } } : {}),
      startTime: {
        gte: new Date(Date.now() - 1000 * 60 * 60 * 12),
        lte: new Date(Date.now() + 1000 * 60 * 60 * 48)
      }
    },
    include: {
      league: true,
      participants: { include: { competitor: true } },
      currentMarketStates: {
        include: {
          bestHomeBook: true,
          bestAwayBook: true,
          bestOverBook: true,
          bestUnderBook: true
        }
      },
      edgeSignals: {
        where: { isActive: true },
        orderBy: [{ edgeScore: "desc" }, { evPercent: "desc" }],
        take: 3
      }
    },
    orderBy: { startTime: "asc" }
  });

  const board = {
    generatedAt: new Date().toISOString(),
    events: events.map((event) => ({
      id: event.id,
      eventKey: event.externalEventId,
      league: event.league.key,
      name: event.name,
      startTime: event.startTime.toISOString(),
      status: event.status,
      participants: event.participants.map((participant) => ({
        role: participant.role,
        competitor: participant.competitor.name
      })),
      markets: event.currentMarketStates,
      topSignals: event.edgeSignals
    }))
  };

  await writeHotCache(cacheKey, board, 45);
  return board;
}
