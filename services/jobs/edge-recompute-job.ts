import { invalidateHotCache } from "@/lib/cache/live-cache";
import { prisma } from "@/lib/db/prisma";
import { buildEventProjectionFromHistory, buildPlayerPropProjectionsForEvent } from "@/services/modeling/model-engine";
import { recomputeCurrentMarketState, recomputeEdgeSignals } from "@/services/edges/edge-engine";
import { ingestEventProjection, ingestPlayerProjection } from "@/services/market-data/market-data-service";
import { applyMarketCalibrationToPlayerProjection } from "@/services/simulation/prop-projection-calibrator";

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
  let calibratedPlayerProjectionCount = 0;

  for (const projection of playerProjections.filter(isProjection)) {
    const calibratedProjection = applyMarketCalibrationToPlayerProjection(projection);
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
    playerProjectionCount: playerProjections.length,
    calibratedPlayerProjectionCount
  };
}
