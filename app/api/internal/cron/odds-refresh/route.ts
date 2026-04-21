import { NextResponse } from "next/server";
import { ingestBackendCurrentOdds } from "@/services/current-odds/backend-ingestion-service";
import { refreshCurrentBookFeeds } from "@/services/current-odds/book-feed-refresh-service";
import { prisma } from "@/lib/db/prisma";
import { currentMarketStateJob } from "@/services/jobs/current-market-state-job";
import { recomputeEdgeSignals } from "@/services/edges/edge-engine";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function isAuthorized(request: Request) {
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return false;
  }
  return bearer === cronSecret;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const backendIngest = await ingestBackendCurrentOdds({
    allowedSources: ["oddsharvester", "theoddsapi", "scraper"]
  });
  const refresh = await refreshCurrentBookFeeds({ force: true });

  const activeEvents = await prisma.event.findMany({
    where: {
      startTime: {
        gte: new Date(Date.now() - 1000 * 60 * 60 * 12),
        lte: new Date(Date.now() + 1000 * 60 * 60 * 48)
      }
    },
    select: { id: true }
  });

  for (const event of activeEvents) {
    await currentMarketStateJob(event.id, { skipBookFeedRefresh: true });
    await recomputeEdgeSignals(event.id);
  }

  const [events, eventMarkets, currentMarketStates, edgeSignals] = await Promise.all([
    prisma.event.count({
      where: {
        startTime: {
          gte: new Date(Date.now() - 1000 * 60 * 60 * 12),
          lte: new Date(Date.now() + 1000 * 60 * 60 * 48)
        }
      }
    }),
    prisma.eventMarket.count({
      where: {
        updatedAt: {
          gte: new Date(Date.now() - 1000 * 60 * 60 * 6)
        }
      }
    }),
    prisma.currentMarketState.count({
      where: {
        updatedAt: {
          gte: new Date(Date.now() - 1000 * 60 * 60 * 6)
        }
      }
    }),
    prisma.edgeSignal.count({
      where: {
        isActive: true
      }
    })
  ]);

  return NextResponse.json({
    ok: true,
    backendIngest,
    refresh,
    inventory: {
      events,
      eventMarkets,
      currentMarketStates,
      edgeSignals
    }
  });
}
