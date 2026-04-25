import type { LeagueKey } from "@/lib/types/domain";
import { ingestTheRundownCurrentOdds } from "@/services/current-odds/therundown-ingestion-service";
import { getStringArg, logStep, parseArgs } from "./_runtime-utils";

const ALLOWED_LEAGUES = new Set<LeagueKey>(["NBA", "MLB", "NHL", "NFL", "NCAAF"]);

function parseLeagues(raw: string | undefined) {
  if (!raw) {
    return undefined;
  }

  const leagues = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is LeagueKey => ALLOWED_LEAGUES.has(value as LeagueKey));

  return leagues.length ? leagues : undefined;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const leagues = parseLeagues(getStringArg(args, "leagues"));

  logStep("worker:therundown:start", {
    leagues: leagues ?? null
  });

  const result = await ingestTheRundownCurrentOdds({
    leagues
  });

  logStep("worker:therundown:done", result);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
