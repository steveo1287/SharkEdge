import { prisma } from "@/lib/db/prisma";
import type { LeagueKey } from "@/lib/types/domain";
import { refreshCurrentBookFeeds } from "@/services/current-odds/book-feed-refresh-service";
import { currentMarketStateJob } from "@/services/jobs/current-market-state-job";
import { getBooleanArg, getStringArg, logStep, parseArgs } from "./_runtime-utils";

const ALLOWED_LEAGUES = new Set<LeagueKey>(["NBA", "NCAAB", "MLB", "NHL", "NFL", "NCAAF", "UFC", "BOXING"]);

function toLeagueKey(value: string | null | undefined): LeagueKey | null {
  if (!value) {
    return null;
  }

  return ALLOWED_LEAGUES.has(value as LeagueKey) ? (value as LeagueKey) : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const eventId = getStringArg(args, "eventId");
  const leagueKey = getStringArg(args, "leagueKey");
  const liveOnly = getBooleanArg(args, "liveOnly");

  if (eventId) {
    logStep("worker:current-markets:start", { eventId });
    const result = await currentMarketStateJob(eventId);
    logStep("worker:current-markets:done", result);
    return;
  }

  const events = await prisma.event.findMany({
    where: {
      ...(leagueKey ? { league: { key: leagueKey } } : {}),
      ...(liveOnly ? { status: "LIVE" } : {}),
      startTime: {
        gte: new Date(Date.now() - 1000 * 60 * 60 * 8),
        lte: new Date(Date.now() + 1000 * 60 * 60 * 24)
      }
    },
    select: { id: true }
  });

  logStep("worker:current-markets:batch", {
    count: events.length,
    leagueKey: leagueKey ?? null,
    liveOnly
  });

  const batchLeagues = Array.from(
    new Set(
      (leagueKey
        ? [toLeagueKey(leagueKey)]
        : (
            await prisma.event.findMany({
              where: {
                id: { in: events.map((event) => event.id) }
              },
              select: {
                league: {
                  select: { key: true }
                }
              }
            })
          ).map((event) => toLeagueKey(event.league.key))
      ).filter((value): value is LeagueKey => Boolean(value))
    )
  );

  if (batchLeagues.length) {
    const bookFeedRefresh = await refreshCurrentBookFeeds({
      leagues: batchLeagues
    });

    logStep("worker:current-markets:book-feeds", {
      leagues: batchLeagues,
      summaries: bookFeedRefresh.summaries.map((summary) => ({
        providerKey: summary.providerKey,
        status: summary.status,
        reason: summary.reason ?? null
      }))
    });
  }

  for (const event of events) {
    await currentMarketStateJob(event.id, {
      skipBookFeedRefresh: true
    });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
