import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
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
      where: { isActive: true }
    })
  ]);

  return NextResponse.json({
    ok: true,
    inventory: {
      events,
      eventMarkets,
      currentMarketStates,
      edgeSignals
    }
  });
}
