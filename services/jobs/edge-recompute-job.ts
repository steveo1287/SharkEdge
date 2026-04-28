import { invalidateHotCache } from "@/lib/cache/live-cache";
import { prisma } from "@/lib/db/prisma";
import { buildEventProjectionFromHistory, buildPlayerPropProjectionsForEvent } from "@/services/modeling/model-engine";
import { recomputeCurrentMarketState, recomputeEdgeSignals } from "@/services/edges/edge-engine";
import { ingestEventProjection, ingestPlayerProjection } from "@/services/market-data/market-data-service";
import { applyMarketCalibrationToPlayerProjection } from "@/services/simulation/prop-projection-calibrator";
import { evaluatePlayerProjectionReadiness } from "@/services/simulation/player-prop-readiness";

function isProjection(
  value: Awaited<ReturnType<typeof buildPlayerPropProjectionsForEvent>>[number]
): value is NonNullable<Awaited<ReturnType<typeof buildPlayerPropProjectionsForEvent>>[number]> {
  return value !== null;
}

export async function edgeRecomputeJob(eventId: string) {
  const eventProjection = await buildEventProjectionFromHistory(eventId);
  if (eventProjection) {
    await ingestEventProjection(eventProjection);
  }

  const playerProjections = await buildPlayerPropProjectionsForEvent(eventId);
  const validPlayerProjections = playerProjections.filter(isProjection);
  const playerIds = Array.from(new Set(validPlayerProjections.map((projection) => projection.playerId)));
  const recentStats = playerIds.length
    ? await prisma.playerGameStat.findMany({
        where: { playerId: { in: playerIds } },
        orderBy: { createdAt: "desc" },
        take: Math.max(12, playerIds.length * 12)
      })
    : [];
  const recentStatsByPlayerId = new Map<string, typeof recentStats>();
  for (const stat of recentStats) {
    const existing = recentStatsByPlayerId.get(stat.playerId) ?? [];
    if (existing.length < 12) {
      existing.push(stat);
      recentStatsByPlayerId.set(stat.playerId, existing);
    }
  }

  let calibratedPlayerProjectionCount = 0;
  let eligiblePlayerProjectionCount = 0;
  let skippedPlayerProjectionCount = 0;
  const skipReasons: Record<string, number> = {};

  for (const projection of validPlayerProjections) {
    const readiness = evaluatePlayerProjectionReadiness(
      projection,
      recentStatsByPlayerId.get(projection.playerId) ?? []
    );

    if (!readiness.eligible) {
      skippedPlayerProjectionCount += 1;
      skipReasons[readiness.reason] = (skipReasons[readiness.reason] ?? 0) + 1;
      continue;
    }

    eligiblePlayerProjectionCount += 1;
    const calibratedProjection = applyMarketCalibrationToPlayerProjection(readiness.projection);
    const metadata = calibratedProjection.metadata as Record<string, unknown> | undefined;
    if (metadata?.marketCalibrated === true) {
      calibratedPlayerProjectionCount += 1;
    }
    await ingestPlayerProjection(calibratedProjection);
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
    await invalidateHotCache(`board:v1:${event.league.key}`);
  }

  return {
    eventId,
    eventProjectionBuilt: Boolean(eventProjection),
    playerProjectionCount: validPlayerProjections.length,
    eligiblePlayerProjectionCount,
    skippedPlayerProjectionCount,
    calibratedPlayerProjectionCount,
    skipReasons
  };
}
