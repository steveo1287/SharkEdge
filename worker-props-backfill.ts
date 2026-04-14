import type { SupportedLeagueKey } from "@/lib/types/ledger";
import { importFreeHistoricalWarehouse } from "@/services/historical-warehouse/free-sources-service";

import { getNumberArg, getStringArg, logStep, parseArgs } from "./_runtime-utils";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const leagues = getStringArg(args, "leagues")
    ?.split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean) as SupportedLeagueKey[] | undefined;
  const days = getNumberArg(args, "days", 365);

  logStep("worker:historical-free:start", {
    leagues: leagues ?? "ALL",
    days
  });

  const result = await importFreeHistoricalWarehouse({
    leagues,
    days
  });

  logStep("worker:historical-free:complete", {
    importedCount: result.importedCount,
    skippedCount: result.skippedCount,
    leagues: result.leagues.map((league) => ({
      leagueKey: league.leagueKey,
      importedCount: league.importedCount,
      sourceKey: league.sourceKey
    }))
  });

  console.info(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
