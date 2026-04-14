import {
  refreshActiveEventCaches,
  refreshBoardCache,
  refreshEdgesCache,
  refreshEventCache
} from "@/services/feed/cache-refresh";
import { getStringArg, logStep, parseArgs } from "./_runtime-utils";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const leagueKey = getStringArg(args, "leagueKey");
  const eventId = getStringArg(args, "eventId");

  logStep("cache:refresh:start", {
    leagueKey: leagueKey ?? null,
    eventId: eventId ?? null
  });

  await refreshBoardCache(leagueKey);
  await refreshEdgesCache();
  if (eventId) {
    await refreshEventCache(eventId);
  } else {
    await refreshActiveEventCaches(leagueKey);
  }

  logStep("cache:refresh:done");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
