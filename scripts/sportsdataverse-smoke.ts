import { loadEnvConfig } from "@next/env";

import type { LeagueKey } from "@/lib/types/domain";
import { sportsdataverseEventProvider } from "@/services/events/sportsdataverse-provider";

loadEnvConfig(process.cwd());

const ALLOWED_LEAGUES = new Set<LeagueKey>(["NBA", "NCAAB", "NCAAF"]);

function parseLeague(argv: string[]) {
  const raw = argv.find((value) => value.startsWith("--league="))?.split("=")[1]?.trim().toUpperCase();
  if (!raw) {
    return "NBA" as LeagueKey;
  }

  return ALLOWED_LEAGUES.has(raw as LeagueKey) ? (raw as LeagueKey) : ("NBA" as LeagueKey);
}

async function main() {
  const league = parseLeague(process.argv.slice(2));
  const events = await sportsdataverseEventProvider.fetchScoreboard(league);

  console.log(
    JSON.stringify(
      {
        provider: sportsdataverseEventProvider.key,
        league,
        eventCount: events.length,
        sample: events.slice(0, 5).map((event) => ({
          externalEventId: event.externalEventId,
          name: event.name,
          startTime: event.startTime,
          status: event.status
        }))
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
