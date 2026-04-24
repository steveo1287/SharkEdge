import { invalidateHotCache } from "@/lib/cache/live-cache";
import { prisma } from "@/lib/db/prisma";
import type { LeagueKey } from "@/lib/types/domain";
import { refreshCurrentBookFeeds } from "@/services/current-odds/book-feed-refresh-service";
import { recomputeCurrentMarketState } from "@/services/edges/edge-engine";

function toLeagueKey(value: string): LeagueKey | null {
  const allowed = new Set<LeagueKey>(["NBA", "MLB", "NHL", "NFL", "NCAAF", "UFC", "BOXING"]);
  return allowed.has(value as LeagueKey) ? (value as LeagueKey) : null;
}

export async function currentMarketStateJob(
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

  await recomputeCurrentMarketState(eventId);

  if (eventId) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { league: true }
    });
    if (event) {
      await invalidateHotCache(`board:v1:${event.league.key}`);
      await invalidateHotCache(`event:v1:${event.id}`);
    }
  } else {
    await invalidateHotCache("board:v1:all");
  }

  return {
    ok: true,
    eventId: eventId ?? null,
    bookFeedRefresh
  };
}
