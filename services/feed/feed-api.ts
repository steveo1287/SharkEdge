import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { prisma } from "@/lib/db/prisma";
import { getBoardFeed } from "@/services/market-data/market-data-service";
import { getPropsExplorerData } from "@/services/odds/props-service";

function buildEmptyFeedPayload(source: string, note: string) {
  return {
    generatedAt: new Date().toISOString(),
    count: 0,
    source,
    note,
    data: []
  };
}

function isRecoverableFeedError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("does not exist") ||
    message.includes("relation") ||
    message.includes("table") ||
    message.includes("prisma") ||
    message.includes("Prisma") ||
    message.includes("database") ||
    message.includes("prepared statement") ||
    message.includes("Can't reach database server") ||
    message.includes("Can't connect to database server")
  );
}

export async function getBoardApi(
  leagueKey?: string,
  options?: { skipCache?: boolean }
) {
  return getBoardFeed(leagueKey, options);
}

export async function getEdgesApi(options?: { skipCache?: boolean }) {
  const cacheKey = "edges:v1:all";
  if (!options?.skipCache) {
    const cached = await readHotCache<unknown>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  try {
    const signals = await prisma.edgeSignal.findMany({
      where: { isActive: true },
      include: {
        event: { include: { league: true } },
        player: true,
        sportsbook: true
      },
      orderBy: [{ edgeScore: "desc" }, { evPercent: "desc" }],
      take: 100
    });

    const payload = {
      generatedAt: new Date().toISOString(),
      count: signals.length,
      data: signals.map((signal) => ({
        id: signal.id,
        eventId: signal.eventId,
        eventLabel: signal.event.name,
        league: signal.event.league.key,
        marketType: signal.marketType,
        player: signal.player?.name ?? null,
        sportsbook: signal.sportsbook.name,
        side: signal.side,
        lineValue: signal.lineValue,
        offeredOddsAmerican: signal.offeredOddsAmerican,
        fairOddsAmerican: signal.fairOddsAmerican,
        modelProb: signal.modelProb,
        noVigProb: signal.noVigProb,
        evPercent: signal.evPercent,
        kellyFull: signal.kellyFull,
        kellyHalf: signal.kellyHalf,
        confidenceScore: signal.confidenceScore,
        edgeScore: signal.edgeScore,
        flags: signal.flagsJson,
        expiresAt: signal.expiresAt?.toISOString() ?? null
      }))
    };
    await writeHotCache(cacheKey, payload, 45);
    return payload;
  } catch (error) {
    if (!isRecoverableFeedError(error)) {
      throw error;
    }

    const payload = buildEmptyFeedPayload(
      "edges_degraded_fallback",
      error instanceof Error
        ? `Edges degraded safely after a Prisma/database failure: ${error.message}`
        : "Edges degraded safely after a Prisma/database failure."
    );
    await writeHotCache(cacheKey, payload, 30);
    return payload;
  }
}

export async function getEventApi(
  eventId: string,
  options?: { skipCache?: boolean }
) {
  const cacheKey = `event:v1:${eventId}`;
  if (!options?.skipCache) {
    const cached = await readHotCache<unknown>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      league: true,
      participants: {
        include: { competitor: true }
      },
      currentMarketStates: {
        include: {
          bestHomeBook: true,
          bestAwayBook: true,
          bestOverBook: true,
          bestUnderBook: true
        }
      },
      eventProjections: {
        orderBy: { modelRun: { createdAt: "desc" } },
        take: 1
      },
      playerProjections: {
        include: { player: true },
        orderBy: { meanValue: "desc" },
        take: 25
      },
      edgeSignals: {
        where: { isActive: true },
        orderBy: [{ edgeScore: "desc" }, { evPercent: "desc" }],
        take: 20,
        include: { player: true, sportsbook: true }
      },
      lineMovements: {
        orderBy: { movedAt: "desc" },
        take: 25,
        include: { sportsbook: true, player: true }
      },
      eventResult: true
    }
  });

  if (!event) {
    throw new Error("Event not found.");
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    event
  };
  await writeHotCache(cacheKey, payload, 45);
  return payload;
}

export async function getPropsApi() {
  try {
    const projections = await prisma.playerProjection.findMany({
      include: {
        event: { include: { league: true } },
        player: true,
        modelRun: true
      },
      orderBy: [{ meanValue: "desc" }],
      take: 200
    });

    return {
      generatedAt: new Date().toISOString(),
      count: projections.length,
      source: "player_projections",
      data: projections.map((projection) => ({
        id: projection.id,
        eventId: projection.eventId,
        eventLabel: projection.event.name,
        league: projection.event.league.key,
        playerId: projection.playerId,
        playerName: projection.player.name,
        statKey: projection.statKey,
        meanValue: projection.meanValue,
        medianValue: projection.medianValue,
        stdDev: projection.stdDev,
        metadata: projection.metadataJson
      }))
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const missingProjectionTable =
      message.includes("player_projections") || message.includes("playerProjection");

    if (!missingProjectionTable) {
      throw error;
    }

    const fallback = await getPropsExplorerData({
      league: "ALL",
      marketType: "ALL",
      team: "all",
      player: "all",
      sportsbook: "all",
      valueFlag: "all",
      sortBy: "best_price"
    });

    return {
      generatedAt: new Date().toISOString(),
      count: fallback.props.length,
      source: "props_explorer_fallback",
      note: "Player projections are not migrated in this runtime yet. Falling back to live/stored props explorer rows.",
      data: fallback.props.map((prop) => ({
        id: prop.id,
        eventId: prop.gameId,
        eventLabel: prop.gameLabel ?? `${prop.team.abbreviation} vs ${prop.opponent.abbreviation}`,
        league: prop.leagueKey,
        playerId: prop.player.id,
        playerName: prop.player.name,
        statKey: prop.marketType,
        meanValue: prop.line,
        medianValue: null,
        stdDev: null,
        metadata: {
          source: prop.source ?? fallback.source,
          supportStatus: prop.supportStatus ?? null,
          sportsbook: prop.bestAvailableSportsbookName ?? prop.sportsbook.name,
          oddsAmerican: prop.bestAvailableOddsAmerican ?? prop.oddsAmerican,
          expectedValuePct: prop.expectedValuePct ?? null
        }
      }))
    };
  }
}

export async function getLineMovementsApi() {
  try {
    const rows = await prisma.lineMovement.findMany({
      include: {
        event: { include: { league: true } },
        sportsbook: true,
        player: true
      },
      orderBy: { movedAt: "desc" },
      take: 200
    });

    return {
      generatedAt: new Date().toISOString(),
      count: rows.length,
      data: rows
    };
  } catch (error) {
    if (!isRecoverableFeedError(error)) {
      throw error;
    }

    return buildEmptyFeedPayload(
      "line_movements_degraded_fallback",
      error instanceof Error
        ? `Line movements degraded safely after a Prisma/database failure: ${error.message}`
        : "Line movements degraded safely after a Prisma/database failure."
    );
  }
}
