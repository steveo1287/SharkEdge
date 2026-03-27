import type { SupportedLeagueKey } from "@/lib/types/ledger";
import { backfillHistoricalEventCatalog } from "@/services/historical-odds/catalog-backfill-service";
import { backfillHistoricalIntelligence } from "@/services/historical-odds/backfill-service";
import { ingestHistoricalOddsSnapshots } from "@/services/historical-odds/ingestion-service";

type SupportedHistoricalLeagueKey = "NBA" | "NCAAB" | "MLB" | "NHL" | "NFL" | "NCAAF";

function readArg(flag: string) {
  return process.argv.find((argument) => argument.startsWith(`${flag}=`))?.split("=")[1] ?? null;
}

async function main() {
  const leagues = readArg("--leagues")
    ?.split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean) as SupportedLeagueKey[] | undefined;
  const daysRaw = readArg("--days");
  const days = daysRaw ? Number(daysRaw) : undefined;

  const catalogResult = await backfillHistoricalEventCatalog({
    leagues,
    days: Number.isFinite(days) ? days : undefined
  });

  const targetLeagues: Array<SupportedHistoricalLeagueKey> = leagues?.length
    ? leagues.filter((leagueKey): leagueKey is SupportedHistoricalLeagueKey =>
        ["NBA", "NCAAB", "MLB", "NHL", "NFL", "NCAAF"].includes(leagueKey)
      )
    : ["NBA", "NCAAB", "MLB", "NHL", "NFL", "NCAAF"];
  const oddsResults = [];
  const intelligenceResults = [];

  for (const leagueKey of targetLeagues) {
    try {
      const oddsResult = await ingestHistoricalOddsSnapshots(leagueKey);
      oddsResults.push(oddsResult);
    } catch (error) {
      oddsResults.push({
        leagueKey,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    try {
      const intelligenceResult = await backfillHistoricalIntelligence({
        leagueKey,
        limit: 5000
      });
      intelligenceResults.push(intelligenceResult);
    } catch (error) {
      intelligenceResults.push({
        leagueKey,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  console.info(
    JSON.stringify(
      {
        catalogResult,
        oddsResults,
        intelligenceResults
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
