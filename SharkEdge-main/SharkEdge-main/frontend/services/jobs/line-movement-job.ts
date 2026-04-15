import { invalidateHotCache } from "@/lib/cache/live-cache";
import { prisma } from "@/lib/db/prisma";
import type { LeagueKey } from "@/lib/types/domain";
import { refreshCurrentBookFeeds } from "@/services/current-odds/book-feed-refresh-service";

function toLeagueKey(value: string): LeagueKey | null {
  const allowed = new Set<LeagueKey>(["NBA", "NCAAB", "MLB", "NHL", "NFL", "NCAAF", "UFC", "BOXING"]);
  return allowed.has(value as LeagueKey) ? (value as LeagueKey) : null;
}

export async function lineMovementJob(
  eventId?: string,
  options?: {
    skipBookFeedRefresh?: boolean;
    leagues?: LeagueKey[];
  }
) {
  let bookFeedRefresh = null;

  if (options?.skipBookFeedRefresh) {
    bookFeedRefresh = {
      generatedAt: new Date().toISOString(),
      summaries: []
    };
  } else if (eventId) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { league: true }
    });

    const leagueKey = event?.league?.key ? toLeagueKey(event.league.key) : null;
    if (leagueKey) {
      bookFeedRefresh = await refreshCurrentBookFeeds({
        leagues: [leagueKey]
      });
    } else {
      bookFeedRefresh = {
        generatedAt: new Date().toISOString(),
        summaries: []
      };
    }
  } else {
    const leagues = options?.leagues?.filter((league) => toLeagueKey(league) !== null) ?? options?.leagues;
    bookFeedRefresh = leagues && !leagues.length
      ? {
          generatedAt: new Date().toISOString(),
          summaries: []
        }
      : await refreshCurrentBookFeeds({
          leagues
        });
  }

  const markets = await prisma.eventMarket.findMany({
    where: eventId ? { eventId } : undefined,
    include: {
      snapshots: {
        orderBy: { capturedAt: "desc" },
        take: 2
      }
    }
  });

  let created = 0;
  for (const market of markets) {
    if (market.snapshots.length < 2 || !market.sportsbookId) {
      continue;
    }
    const [latest, previous] = market.snapshots;
    if (latest.oddsAmerican === previous.oddsAmerican && latest.line === previous.line) {
      continue;
    }
    await prisma.lineMovement.create({
      data: {
        eventId: market.eventId,
        marketType: market.marketType,
        sportsbookId: market.sportsbookId,
        side: market.side ?? market.selection,
        playerId: null,
        lineValue: latest.line,
        oldOddsAmerican: previous.oddsAmerican,
        newOddsAmerican: latest.oddsAmerican,
        oldLineValue: previous.line,
        newLineValue: latest.line,
        movementType:
          latest.line !== previous.line
            ? "steam"
            : "stale-correction"
      }
    });
    created += 1;
  }

  if (created > 0) {
    await invalidateHotCache("edges:v1:all");
    if (eventId) {
      await invalidateHotCache(`event:v1:${eventId}`);
    }
  }

  return {
    created,
    bookFeedRefresh
  };
}
