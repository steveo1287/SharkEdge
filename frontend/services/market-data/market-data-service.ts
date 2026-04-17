import { Prisma, SportCode } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { americanToImplied } from "@/lib/odds/index";
import { invalidateHotCache, readHotCache, writeHotCache } from "@/lib/cache/live-cache";
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

type EventContext = {
  eventId: string;
  sportId: string;
  leagueId: string;
  leagueKey: string;
  homeCompetitorId: string | null;
  awayCompetitorId: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  roster: Array<{
    id: string;
    key: string | null;
    name: string;
    teamId: string;
    aliases: string[];
  }>;
};

type NormalizedIngestMarketRow = {
  sportsbookId: string;
  marketType: string;
  marketLabel: string;
  period: string;
  selection: string;
  side: string | null;
  line: number | null;
  oddsAmerican: number;
  selectionCompetitorId: string | null;
  playerId: string | null;
  fetchedAt: Date;
};

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

function normalizeToken(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "_");
}

function normalizeSide(value: string | null | undefined) {
  const normalized = normalizeToken(value);
  if (["home", "away", "over", "under"].includes(normalized)) {
    return normalized;
  }
  return normalized || null;
}

function normalizePeriod(value: string | null | undefined) {
  const normalized = normalizeToken(value);
  if (!normalized) {
    return "full_game";
  }
  if (["full_game", "game", "full"].includes(normalized)) {
    return "full_game";
  }
  if (["first_5", "first5", "f5", "first_five", "five_innings"].includes(normalized)) {
    return "first_5";
  }
  return normalized;
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

async function ensureSportsbook(bookName: string) {
  const key = normalizeToken(bookName);
  return prisma.sportsbook.upsert({
    where: { key },
    update: { name: bookName, isActive: true },
    create: { key, name: bookName, region: "global", isActive: true }
  });
}

function buildLegacySelections(payload: IngestPayload, line: IngestPayload["lines"][number]) {
  if (!line.odds) {
    return [];
  }

  return [
    {
      marketType: "moneyline" as const,
      period: "full_game",
      marketLabel: "moneyline",
      rows: [
        {
          selection: payload.homeTeam,
          side: "home",
          line: null,
          oddsAmerican: line.odds.homeMoneyline ?? null,
          teamSide: "home" as const
        },
        {
          selection: payload.awayTeam,
          side: "away",
          line: null,
          oddsAmerican: line.odds.awayMoneyline ?? null,
          teamSide: "away" as const
        }
      ]
    },
    {
      marketType: "spread" as const,
      period: "full_game",
      marketLabel: "spread",
      rows: [
        {
          selection: payload.homeTeam,
          side: "home",
          line: line.odds.homeSpread ?? null,
          oddsAmerican: line.odds.homeSpreadOdds ?? null,
          teamSide: "home" as const
        },
        {
          selection: payload.awayTeam,
          side: "away",
          line: typeof line.odds.homeSpread === "number" ? -line.odds.homeSpread : null,
          oddsAmerican: line.odds.awaySpreadOdds ?? null,
          teamSide: "away" as const
        }
      ]
    },
    {
      marketType: "total" as const,
      period: "full_game",
      marketLabel: "total",
      rows: [
        {
          selection: "Over",
          side: "over",
          line: line.odds.total ?? null,
          oddsAmerican: line.odds.overOdds ?? null,
          teamSide: undefined
        },
        {
          selection: "Under",
          side: "under",
          line: line.odds.total ?? null,
          oddsAmerican: line.odds.underOdds ?? null,
          teamSide: undefined
        }
      ]
    }
  ];
}

async function resolveTeamByName(leagueId: string, name: string) {
  const normalized = normalizeToken(name);
  const teams = await prisma.team.findMany({
    where: { leagueId },
    include: { aliases: true }
  });

  return (
    teams.find((team) => {
      const candidates = [
        team.name,
        team.city,
        team.nickname,
        team.abbreviation,
        team.key,
        ...team.aliases.map((alias) => alias.alias),
        ...team.aliases.map((alias) => alias.normalizedAlias)
      ]
        .filter((value): value is string => Boolean(value))
        .map((value) => normalizeToken(value));
      return candidates.includes(normalized);
    }) ?? null
  );
}

async function ensureTeamCompetitor(args: {
  sportId: string;
  leagueId: string;
  team: { id: string; name: string; abbreviation: string; key: string | null };
}) {
  const key = args.team.key ? `team:${args.team.key}` : `team:${args.team.id}`;
  return prisma.competitor.upsert({
    where: { key },
    update: {
      name: args.team.name,
      abbreviation: args.team.abbreviation,
      teamId: args.team.id,
      leagueId: args.leagueId,
      sportId: args.sportId,
      type: "TEAM"
    },
    create: {
      key,
      name: args.team.name,
      abbreviation: args.team.abbreviation,
      shortName: args.team.abbreviation,
      teamId: args.team.id,
      leagueId: args.leagueId,
      sportId: args.sportId,
      type: "TEAM",
      externalIds: Prisma.JsonNull,
      metadataJson: Prisma.JsonNull
    }
  });
}

async function loadEventContext(args: {
  payload: IngestPayload;
  eventId: string;
  sportId: string;
  leagueId: string;
  leagueKey: string;
}) {
  const homeTeam = await resolveTeamByName(args.leagueId, args.payload.homeTeam);
  const awayTeam = await resolveTeamByName(args.leagueId, args.payload.awayTeam);

  const homeCompetitor = homeTeam
    ? await ensureTeamCompetitor({
        sportId: args.sportId,
        leagueId: args.leagueId,
        team: homeTeam
      })
    : null;
  const awayCompetitor = awayTeam
    ? await ensureTeamCompetitor({
        sportId: args.sportId,
        leagueId: args.leagueId,
        team: awayTeam
      })
    : null;

  if (homeCompetitor && awayCompetitor) {
    await prisma.eventParticipant.upsert({
      where: {
        eventId_competitorId: {
          eventId: args.eventId,
          competitorId: awayCompetitor.id
        }
      },
      update: {
        role: "AWAY",
        sortOrder: 0,
        isHome: false
      },
      create: {
        eventId: args.eventId,
        competitorId: awayCompetitor.id,
        role: "AWAY",
        sortOrder: 0,
        isHome: false
      }
    });
    await prisma.eventParticipant.upsert({
      where: {
        eventId_competitorId: {
          eventId: args.eventId,
          competitorId: homeCompetitor.id
        }
      },
      update: {
        role: "HOME",
        sortOrder: 1,
        isHome: true
      },
      create: {
        eventId: args.eventId,
        competitorId: homeCompetitor.id,
        role: "HOME",
        sortOrder: 1,
        isHome: true
      }
    });
  }

  const teamIds = [homeTeam?.id, awayTeam?.id].filter((value): value is string => Boolean(value));
  const roster = teamIds.length
    ? await prisma.player.findMany({
        where: { teamId: { in: teamIds } },
        include: { aliases: true }
      })
    : [];

  return {
    eventId: args.eventId,
    sportId: args.sportId,
    leagueId: args.leagueId,
    leagueKey: args.leagueKey,
    homeCompetitorId: homeCompetitor?.id ?? null,
    awayCompetitorId: awayCompetitor?.id ?? null,
    homeTeamId: homeTeam?.id ?? null,
    awayTeamId: awayTeam?.id ?? null,
    roster: roster.map((player) => ({
      id: player.id,
      key: player.key,
      name: player.name,
      teamId: player.teamId,
      aliases: player.aliases.map((alias) => alias.alias)
    }))
  } satisfies EventContext;
}

function resolveSelectionCompetitorId(
  context: EventContext,
  market: {
    marketType: string;
    teamSide?: "home" | "away";
    teamId?: string;
    selection: string;
  }
) {
  if (market.marketType !== "team_total") {
    return null;
  }
  if (market.teamId) {
    if (context.homeTeamId === market.teamId) return context.homeCompetitorId;
    if (context.awayTeamId === market.teamId) return context.awayCompetitorId;
  }
  if (market.teamSide === "home") {
    return context.homeCompetitorId;
  }
  if (market.teamSide === "away") {
    return context.awayCompetitorId;
  }
  const selection = normalizeToken(market.selection);
  if (selection && selection.includes(normalizeToken("home"))) {
    return context.homeCompetitorId;
  }
  if (selection && selection.includes(normalizeToken("away"))) {
    return context.awayCompetitorId;
  }
  return null;
}

async function resolvePlayerId(
  context: EventContext,
  market: {
    playerId?: string;
    playerName?: string;
    teamId?: string;
    teamSide?: "home" | "away";
  }
) {
  if (market.playerId) {
    const direct = context.roster.find(
      (player) => player.id === market.playerId || player.key === market.playerId
    );
    if (direct) {
      return direct.id;
    }

    const existing = await prisma.player.findFirst({
      where: {
        OR: [{ id: market.playerId }, { key: market.playerId }]
      },
      select: { id: true }
    });
    if (existing) {
      return existing.id;
    }
  }

  if (!market.playerName) {
    return null;
  }

  const normalizedName = normalizeToken(market.playerName);
  const targetTeamId =
    market.teamId ??
    (market.teamSide === "home" ? context.homeTeamId : market.teamSide === "away" ? context.awayTeamId : null);

  const rosterMatches = context.roster.filter((player) => {
    if (targetTeamId && player.teamId !== targetTeamId) {
      return false;
    }
    const candidates = [player.name, ...player.aliases, player.key]
      .filter((value): value is string => Boolean(value))
      .map((value) => normalizeToken(value));
    return candidates.includes(normalizedName);
  });

  return rosterMatches[0]?.id ?? null;
}

async function normalizeAdvancedRows(
  context: EventContext,
  sportsbookId: string,
  line: IngestPayload["lines"][number]
): Promise<NormalizedIngestMarketRow[]> {
  if (!line.markets?.length) {
    return [];
  }

  const normalized: NormalizedIngestMarketRow[] = [];
  for (const market of line.markets) {
    if (typeof market.oddsAmerican !== "number") {
      continue;
    }

    const marketType = market.marketType;
    const period = normalizePeriod(market.period);
    const selectionCompetitorId = resolveSelectionCompetitorId(context, {
      marketType,
      teamSide: market.teamSide,
      teamId: market.teamId,
      selection: market.selection
    });
    const playerId = await resolvePlayerId(context, {
      playerId: market.playerId,
      playerName: market.playerName,
      teamId: market.teamId,
      teamSide: market.teamSide
    });

    normalized.push({
      sportsbookId,
      marketType,
      marketLabel: market.marketLabel ?? market.marketType,
      period,
      selection: market.selection,
      side: normalizeSide(market.side),
      line: typeof market.line === "number" ? market.line : null,
      oddsAmerican: Math.round(market.oddsAmerican),
      selectionCompetitorId,
      playerId,
      fetchedAt: new Date(line.fetchedAt)
    });
  }

  return normalized;
}

function normalizeLegacyRows(
  context: EventContext,
  payload: IngestPayload,
  sportsbookId: string,
  line: IngestPayload["lines"][number]
): NormalizedIngestMarketRow[] {
  const normalized: NormalizedIngestMarketRow[] = [];

  for (const market of buildLegacySelections(payload, line)) {
    for (const row of market.rows) {
      if (typeof row.oddsAmerican !== "number") {
        continue;
      }

      normalized.push({
        marketType: market.marketType,
        marketLabel: market.marketLabel,
        period: market.period,
        selection: row.selection,
        side: normalizeSide(row.side),
        line: typeof row.line === "number" ? row.line : null,
        oddsAmerican: row.oddsAmerican,
        selectionCompetitorId: null,
        playerId: null,
        fetchedAt: new Date(line.fetchedAt),
        sportsbookId
      });
    }
  }

  return normalized;
}

function buildEventMarketKey(row: {
  eventId: string;
  sportsbookId: string;
  marketType: string;
  period: string;
  selectionCompetitorId: string | null;
  playerId: string | null;
  side: string | null;
  selection: string;
}) {
  return [
    row.eventId,
    row.sportsbookId,
    row.marketType,
    row.period,
    row.selectionCompetitorId ?? "none",
    row.playerId ?? "none",
    row.side ?? "none",
    normalizeToken(row.selection)
  ].join(":");
}

export async function upsertOddsIngestPayload(payload: IngestPayload) {
  const { sportId, league } = await ensureSportLeague(payload);

  const event = await prisma.event.upsert({
    where: { externalEventId: payload.eventKey },
    update: {
      name: buildEventName(payload),
      startTime: new Date(payload.commenceTime),
      leagueId: league.id,
      sportId,
      providerKey: payload.source,
      metadataJson: payload.sourceMeta ? (payload.sourceMeta as Prisma.InputJsonValue) : Prisma.JsonNull
    },
    create: {
      externalEventId: payload.eventKey,
      providerKey: payload.source,
      sportId,
      leagueId: league.id,
      name: buildEventName(payload),
      slug: normalizeToken(payload.eventKey),
      startTime: new Date(payload.commenceTime),
      status: "SCHEDULED",
      resultState: "PENDING",
      eventType: league.sport === "MMA" || league.sport === "BOXING" ? "COMBAT_HEAD_TO_HEAD" : "TEAM_HEAD_TO_HEAD",
      metadataJson: payload.sourceMeta ? (payload.sourceMeta as Prisma.InputJsonValue) : Prisma.JsonNull
    }
  });

  const context = await loadEventContext({
    payload,
    eventId: event.id,
    sportId,
    leagueId: league.id,
    leagueKey: league.key
  });

  const touchedMarketIds: string[] = [];

  for (const line of payload.lines) {
    const sportsbook = await ensureSportsbook(line.book);
    const advancedRows = await normalizeAdvancedRows(context, sportsbook.id, line);
    const legacyRows = advancedRows.length ? [] : normalizeLegacyRows(context, payload, sportsbook.id, line);
    const normalizedRows = [...advancedRows, ...legacyRows];

    for (const row of normalizedRows) {
      const eventMarketId = buildEventMarketKey({
        eventId: event.id,
        sportsbookId: row.sportsbookId,
        marketType: row.marketType,
        period: row.period,
        selectionCompetitorId: row.selectionCompetitorId,
        playerId: row.playerId,
        side: row.side,
        selection: row.selection
      });

      const oddsDecimal =
        row.oddsAmerican > 0
          ? 1 + row.oddsAmerican / 100
          : 1 + 100 / Math.max(1, Math.abs(row.oddsAmerican));

      const eventMarket = await prisma.eventMarket.upsert({
        where: { id: eventMarketId },
        update: {
          sportsbookId: row.sportsbookId,
          marketType: row.marketType as never,
          marketLabel: row.marketLabel,
          period: row.period,
          selection: row.selection,
          side: row.side,
          line: row.line,
          oddsAmerican: row.oddsAmerican,
          oddsDecimal,
          impliedProbability: americanToImplied(row.oddsAmerican),
          currentLine: row.line,
          currentOdds: row.oddsAmerican,
          isLive: false,
          sourceKey: payload.source,
          updatedAt: row.fetchedAt,
          selectionCompetitorId: row.selectionCompetitorId,
          playerId: row.playerId
        } as any,
        create: {
          id: eventMarketId,
          eventId: event.id,
          sportsbookId: row.sportsbookId,
          marketType: row.marketType as never,
          marketLabel: row.marketLabel,
          period: row.period,
          selection: row.selection,
          side: row.side,
          line: row.line,
          oddsAmerican: row.oddsAmerican,
          oddsDecimal,
          impliedProbability: americanToImplied(row.oddsAmerican),
          openingLine: row.line,
          currentLine: row.line,
          openingOdds: row.oddsAmerican,
          currentOdds: row.oddsAmerican,
          isLive: false,
          sourceKey: payload.source,
          updatedAt: row.fetchedAt,
          selectionCompetitorId: row.selectionCompetitorId,
          playerId: row.playerId
        } as any
      });

      touchedMarketIds.push(eventMarket.id);

      await prisma.eventMarketSnapshot.create({
        data: {
          eventMarketId: eventMarket.id,
          capturedAt: row.fetchedAt,
          line: row.line,
          oddsAmerican: row.oddsAmerican,
          impliedProbability: americanToImplied(row.oddsAmerican)
        }
      });
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
      scope: "event_projection",
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

  await prisma.playerProjection.deleteMany({
    where: {
      modelRunId: modelRun.id,
      eventId: input.eventId,
      playerId: input.playerId,
      statKey: input.statKey
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
          selectionCompetitor: true,
          player: true,
          bestHomeBook: true,
          bestAwayBook: true,
          bestOverBook: true,
          bestUnderBook: true
        } as any
      },
      edgeSignals: {
        where: { isActive: true },
        include: {
          selectionCompetitor: true,
          player: true,
          sportsbook: true
        } as any,
        orderBy: [{ edgeScore: "desc" }, { evPercent: "desc" }],
        take: 6
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
