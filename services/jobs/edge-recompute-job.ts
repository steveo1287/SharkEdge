import { invalidateHotCache } from "@/lib/cache/live-cache";
import { prisma } from "@/lib/db/prisma";
import { buildEventProjectionFromHistory, buildPlayerPropProjectionsForEvent } from "@/services/modeling/model-engine";
import { recomputeCurrentMarketState, recomputeEdgeSignals } from "@/services/edges/edge-engine";
import { ingestEventProjection, ingestPlayerProjection } from "@/services/market-data/market-data-service";

function isProjection(
  value: Awaited<ReturnType<typeof buildPlayerPropProjectionsForEvent>>[number]
): value is NonNullable<Awaited<ReturnType<typeof buildPlayerPropProjectionsForEvent>>[number]> {
  return value !== null;
}

async function invalidateBoardCaches(leagueKey: string) {
  const keys = [
    `board:v1:${leagueKey}`,
    "board:v2:all:status:all:date:all:max:all",
    `board:v2:${leagueKey}:status:all:date:all:max:all`
  ];

  for (const key of keys) {
    await invalidateHotCache(key);
  }
}

export async function edgeRecomputeJob(eventId: string) {
  const eventProjection = await buildEventProjectionFromHistory(eventId);
  if (eventProjection) {
    await ingestEventProjection(eventProjection);
  }

  const playerProjections = await buildPlayerPropProjectionsForEvent(eventId);
  for (const projection of playerProjections.filter(isProjection)) {
    await ingestPlayerProjection(projection);
  }

  await recomputeCurrentMarketState(eventId);
  await recomputeEdgeSignals(eventId);

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { league: true }
  });
  if (event) {
    await invalidateHotCache("edges:v1:all");
    await invalidateHotCache(`event:v1:${event.id}`);
    await invalidateBoardCaches(event.league.key);
  }

  return {
    eventId,
    eventProjectionBuilt: Boolean(eventProjection),
    playerProjectionCount: playerProjections.length
  };
}
