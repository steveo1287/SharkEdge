import { getNumberArg, getStringArg, logStep, parseArgs } from "./_runtime-utils";
import { refreshUpcomingEventWeatherSnapshots } from "@/services/weather/venue-weather-enrichment-service";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const leaguesArg = getStringArg(args, "leagues");
  const eventIdsArg = getStringArg(args, "eventIds");
  const limit = getNumberArg(args, "limit", 40);
  const leagues = leaguesArg ? leaguesArg.split(",").map((value) => value.trim()).filter(Boolean) : undefined;
  const eventIds = eventIdsArg ? eventIdsArg.split(",").map((value) => value.trim()).filter(Boolean) : undefined;

  logStep("worker:weather-snapshots:start", { leagues, eventIds, limit });
  const result = await refreshUpcomingEventWeatherSnapshots({ leagues, eventIds, limit });
  logStep("worker:weather-snapshots:done", result);
}

main().catch((error) => {
  console.error("[runtime] worker:weather-snapshots:error", error);
  process.exitCode = 1;
});
