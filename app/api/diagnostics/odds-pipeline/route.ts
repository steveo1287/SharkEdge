import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const diagnostics: Record<string, any> = {};

  // 1. Database connection
  try {
    await prisma.$queryRaw`SELECT 1`;
    diagnostics.database = { reachable: true };
  } catch (error) {
    return NextResponse.json(
      {
        error: "Database connection failed",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 503 }
    );
  }

  // 2. League row counts
  try {
    diagnostics.leagues = {
      total: await prisma.league.count(),
      byKey: await prisma.league.findMany({
        select: { key: true },
        take: 20
      })
    };
  } catch (error) {
    diagnostics.leagues = { error: "Failed to query leagues" };
  }

  // 3. Recent Events
  try {
    const events = await prisma.event.findMany({
      where: {
        startTime: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
          lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)  // Next 7 days
        }
      },
      select: {
        id: true,
        name: true,
        league: { select: { key: true } },
        providerKey: true,
        startTime: true
      },
      orderBy: { startTime: "asc" },
      take: 50
    });

    diagnostics.events = {
      total: await prisma.event.count({
        where: {
          startTime: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          }
        }
      }),
      recent: events,
      oldestEvent: await prisma.event.findFirst({
        orderBy: { createdAt: "asc" },
        select: { createdAt: true, name: true }
      })
    };
  } catch (error) {
    diagnostics.events = { error: "Failed to query events" };
  }

  // 4. Recent EventMarkets
  try {
    const markets = await prisma.eventMarket.findMany({
      where: {
        updatedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      },
      select: {
        id: true,
        marketType: true,
        oddsAmerican: true,
        updatedAt: true,
        event: { select: { name: true, league: { select: { key: true } } } },
        sportsbook: { select: { name: true } }
      },
      orderBy: { updatedAt: "desc" },
      take: 50
    });

    diagnostics.eventMarkets = {
      total24h: await prisma.eventMarket.count({
        where: {
          updatedAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
          }
        }
      }),
      bySource: await prisma.eventMarket.groupBy({
        by: ["sourceKey"],
        _count: true
      }),
      recent: markets,
      latestUpdate: markets[0]?.updatedAt || null
    };
  } catch (error) {
    diagnostics.eventMarkets = { error: "Failed to query event markets" };
  }

  // 5. OddsHarvester source count
  try {
    diagnostics.oddsharvester = {
      eventCount: await prisma.event.count({
        where: { providerKey: "oddsharvester" }
      }),
      marketCount: await prisma.eventMarket.count({
        where: { sourceKey: "oddsharvester" }
      }),
      recentMarkets: await prisma.eventMarket.findMany({
        where: { sourceKey: "oddsharvester" },
        select: {
          event: { select: { name: true, league: { select: { key: true } } } },
          marketType: true,
          oddsAmerican: true,
          updatedAt: true
        },
        orderBy: { updatedAt: "desc" },
        take: 10
      })
    };
  } catch (error) {
    diagnostics.oddsharvester = { error: "Failed to query oddsharvester data" };
  }

  // 6. Sportsbooks
  try {
    diagnostics.sportsbooks = {
      total: await prisma.sportsbook.count(),
      active: await prisma.sportsbook.count({ where: { isActive: true } }),
      list: await prisma.sportsbook.findMany({
        select: { key: true, name: true, isActive: true },
        orderBy: { name: "asc" }
      })
    };
  } catch (error) {
    diagnostics.sportsbooks = { error: "Failed to query sportsbooks" };
  }

  // 7. Test query: board feed simulation
  try {
    const testEvents = await prisma.event.findMany({
      where: {
        startTime: {
          gte: new Date(Date.now() - 12 * 60 * 60 * 1000),
          lte: new Date(Date.now() + 48 * 60 * 60 * 1000)
        }
      },
      select: {
        id: true,
        name: true,
        league: { select: { key: true } },
        _count: { select: { markets: true } }
      },
      take: 10
    });

    diagnostics.boardFeedTest = {
      queryable: true,
      eventCount: testEvents.length,
      events: testEvents
    };
  } catch (error) {
    diagnostics.boardFeedTest = { error: "Failed to test board feed query" };
  }

  return NextResponse.json({ ok: true, generatedAt: new Date().toISOString(), diagnostics });
}
