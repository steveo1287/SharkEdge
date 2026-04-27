import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { buildUfcEventProjection } from "@/services/modeling/ufc-fight-sim-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function parseLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 5;
  return Math.max(1, Math.min(20, Math.trunc(parsed)));
}

function trimProjection(projection: Awaited<ReturnType<typeof buildUfcEventProjection>>) {
  if (!projection) {
    return null;
  }

  const metadata = (projection.metadata ?? {}) as Record<string, unknown>;
  const fighterA = metadata.fighterA ?? null;
  const fighterB = metadata.fighterB ?? null;
  const matchupBreakdown = metadata.matchupBreakdown ?? null;
  const simulation = metadata.simulation ?? null;
  const marketAnchor = metadata.marketAnchor ?? null;
  const ratingsPrior = metadata.ratingsPrior ?? null;
  const pipeline = metadata.pipeline ?? null;

  return {
    eventId: projection.eventId,
    modelKey: projection.modelKey,
    modelVersion: projection.modelVersion,
    winProbHome: projection.winProbHome,
    winProbAway: projection.winProbAway,
    projectedHomeScore: projection.projectedHomeScore,
    projectedAwayScore: projection.projectedAwayScore,
    projectedSpreadHome: projection.projectedSpreadHome,
    fighterA,
    fighterB,
    matchupBreakdown,
    simulation,
    marketAnchor,
    ratingsPrior,
    pipeline
  };
}

async function loadUpcomingUfcEventIds(limit: number) {
  const league = await prisma.league.findFirst({
    where: { key: "UFC" },
    select: { id: true }
  });
  if (!league) {
    return [];
  }

  const now = new Date();
  const events = await prisma.event.findMany({
    where: {
      leagueId: league.id,
      startTime: {
        gte: new Date(now.getTime() - 1000 * 60 * 60 * 24),
        lte: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30)
      }
    },
    orderBy: { startTime: "asc" },
    take: limit,
    select: {
      id: true,
      externalEventId: true,
      name: true,
      startTime: true,
      status: true
    }
  });

  return events;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get("eventId")?.trim() ?? "";
    const limit = parseLimit(searchParams.get("limit"));

    if (eventId) {
      const projection = await buildUfcEventProjection(eventId);
      return NextResponse.json({
        ok: Boolean(projection),
        mode: "single",
        requestedEventId: eventId,
        projection: trimProjection(projection)
      });
    }

    const upcoming = await loadUpcomingUfcEventIds(limit);
    const projections = await Promise.all(
      upcoming.map(async (event) => ({
        event: {
          id: event.id,
          externalEventId: event.externalEventId,
          name: event.name,
          startTime: event.startTime.toISOString(),
          status: event.status
        },
        projection: trimProjection(await buildUfcEventProjection(event.id))
      }))
    );

    return NextResponse.json({
      ok: true,
      mode: "upcoming",
      requestedLimit: limit,
      returnedEvents: projections.length,
      projections
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to debug UFC simulation."
      },
      { status: 500 }
    );
  }
}
