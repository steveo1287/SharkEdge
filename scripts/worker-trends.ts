import type { SupportedLeagueKey } from "@/lib/types/ledger";
import { runSimAccuracyLedgerJob } from "@/services/simulation/sim-accuracy-ledger";
import { warmTrendDashboardCaches } from "@/services/trends/dashboard-cache";
import { refreshTrendIntelligence } from "@/services/trends/refresh-service";
import { getNumberArg, getStringArg, logStep, parseArgs } from "./_runtime-utils";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const leagues = getStringArg(args, "leagues")
    ?.split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean) as SupportedLeagueKey[] | undefined;
  const days = getNumberArg(args, "days", 7);
  const skipSimLedger = getStringArg(args, "sim") === "false";

  logStep("worker:trends:start", {
    leagues: leagues ?? null,
    days,
    skipSimLedger
  });

  const result = await refreshTrendIntelligence({
    leagues,
    days
  });
  const simLedger = skipSimLedger ? { ok: true, skipped: true } : await runSimAccuracyLedgerJob().catch((error) => ({
    ok: false,
    error: error instanceof Error ? error.message : "Sim ledger refresh failed."
  }));
  const warm = await warmTrendDashboardCaches({
    leagues: ["ALL", "MLB", "NBA", "NHL", "NFL", "NCAAF"],
    markets: ["ALL", "moneyline", "spread", "total"]
  });

  logStep("worker:trends:done", {
    bookFeedRefresh: result.bookFeedRefresh.summaries.map((summary) => ({
      providerKey: summary.providerKey,
      status: summary.status,
      reason: summary.reason ?? null
    })),
    publishedTrendCount: result.publishedTrendCount,
    importedCount: result.catalog.importedCount,
    leagues: result.leagues,
    simLedger,
    warmedTrendDashboards: warm.warmed.length
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
