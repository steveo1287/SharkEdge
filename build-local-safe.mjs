import { backfillHistoricalIntelligence } from "../services/historical-odds/backfill-service";

const leagueArg = process.argv.find((argument) => argument.startsWith("--league="));
const limitArg = process.argv.find((argument) => argument.startsWith("--limit="));

const leagueKey = leagueArg?.split("=")[1];
const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;

async function main() {
  const result = await backfillHistoricalIntelligence({
    ...(leagueKey ? { leagueKey } : {}),
    ...(typeof limit === "number" && Number.isFinite(limit) ? { limit } : {})
  });

  console.info(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
