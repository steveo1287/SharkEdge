import type { SupportedLeagueKey } from "@/lib/types/ledger";
import { refreshTrendIntelligence } from "@/services/trends/refresh-service";
import { getNumberArg, getStringArg, logStep, parseArgs } from "./_runtime-utils";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const leagues = getStringArg(args, "leagues")
    ?.split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean) as SupportedLeagueKey[] | undefined;
  const days = getNumberArg(args, "days", 7);

  logStep("worker:trends:start", {
    leagues: leagues ?? null,
    days
  });

  const result = await refreshTrendIntelligence({
    leagues,
    days
  });

  logStep("worker:trends:done", {
    bookFeedRefresh: result.bookFeedRefresh.summaries.map((summary) => ({
      providerKey: summary.providerKey,
      status: summary.status,
      reason: summary.reason ?? null
    })),
    publishedTrendCount: result.publishedTrendCount,
    importedCount: result.catalog.importedCount,
    leagues: result.leagues
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
