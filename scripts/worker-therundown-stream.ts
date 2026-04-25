import type { LeagueKey } from "@/lib/types/domain";
import { streamTheRundownCurrentOdds } from "@/services/current-odds/therundown-stream-service";
import { getNumberArg, getStringArg, logStep, parseArgs } from "./_runtime-utils";

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
  const flushIntervalMs = getNumberArg(args, "flushIntervalMs", 15000);

  logStep("worker:therundown-stream:start", {
    leagues: leagues ?? null,
    flushIntervalMs
  });

  const stream = await streamTheRundownCurrentOdds({
    leagues,
    flushIntervalMs
  });

  logStep("worker:therundown-stream:bootstrapped", stream.bootstrap);

  const result = await stream.closed;
  logStep("worker:therundown-stream:closed", result);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
