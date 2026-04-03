import type { SupportedLeagueKey } from "@/lib/types/ledger";
import { refreshTrendIntelligence } from "@/services/trends/refresh-service";
import {
  getBooleanArg,
  getNumberArg,
  getStringArg,
  logStep,
  parseArgs
} from "./_runtime-utils";

async function runRefresh(leagues?: SupportedLeagueKey[], days = 365) {
  logStep("worker:historical-refresh:start", {
    leagues: leagues ?? null,
    days
  });

  const result = await refreshTrendIntelligence({
    leagues,
    days
  });

  logStep("worker:historical-refresh:done", {
    leagues: result.leagues,
    bookFeedRefresh: result.bookFeedRefresh.summaries.map((summary) => ({
      providerKey: summary.providerKey,
      status: summary.status,
      reason: summary.reason ?? null
    })),
    importedCount: result.freeWarehouse.importedCount,
    contextCount: result.contexts.contextCount,
    warmedFeatureScopes: result.features.warmed,
    publishedTrendCount: result.publishedTrendCount
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const leagues = getStringArg(args, "leagues")
    ?.split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean) as SupportedLeagueKey[] | undefined;
  const days = getNumberArg(args, "days", 365);
  const loop = getBooleanArg(args, "loop");
  const intervalSeconds = getNumberArg(args, "intervalSeconds", 3600);

  do {
    await runRefresh(leagues, days);
    if (!loop) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
  } while (loop);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
