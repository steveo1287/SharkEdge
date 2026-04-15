import { writeHotCache } from "@/lib/cache/live-cache";
import { prisma } from "@/lib/db/prisma";
import {
  getBoardApi,
  getEdgesApi,
  getEventApi
} from "@/services/feed/feed-api";

export async function refreshBoardCache(leagueKey?: string) {
  const payload = await getBoardApi(leagueKey, { skipCache: true });
  await writeHotCache(`board:v1:${leagueKey ?? "all"}`, payload, 45);
  return payload;
}

export async function refreshEdgesCache() {
  const payload = await getEdgesApi({ skipCache: true });
  await writeHotCache("edges:v1:all", payload, 45);
  return payload;
}

export async function refreshEventCache(eventId: string) {
  const payload = await getEventApi(eventId, { skipCache: true });
  await writeHotCache(`event:v1:${eventId}`, payload, 45);
  return payload;
}

export async function refreshActiveEventCaches(leagueKey?: string) {
  const events = await prisma.event.findMany({
    where: {
      ...(leagueKey ? { league: { key: leagueKey } } : {}),
      startTime: {
        gte: new Date(Date.now() - 1000 * 60 * 60 * 8),
        lte: new Date(Date.now() + 1000 * 60 * 60 * 24)
      }
    },
    select: { id: true }
  });

  for (const event of events) {
    await refreshEventCache(event.id);
  }

  return {
    count: events.length
  };
}
