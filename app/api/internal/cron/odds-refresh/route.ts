import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 10;

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

  const activeEvents = await prisma.event.findMany({
    where: {
      startTime: {
        gte: new Date(Date.now() - 1000 * 60 * 60 * 12),
        lte: new Date(Date.now() + 1000 * 60 * 60 * 48)
      }
    },
    select: { id: true }
  });

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
    mode: "status_only",
    worker: {
      managedBy: "external_worker",
      entrypoint: "workers/odds-refresh-worker.ts",
      note: "Heavy odds refresh and recompute now run outside the web service."
    },
    inventory: {
      events,
      activeEvents: activeEvents.length,
      eventMarkets,
      currentMarketStates,
      edgeSignals
    }
  });
}
