import { ingestHistoricalOddsSnapshots } from "../services/historical-odds/ingestion-service";

const leagueArg = process.argv.find((argument) => argument.startsWith("--league="));
const league =
  (leagueArg?.split("=")[1] as
    | "ALL"
    | "NBA"
    | "NCAAB"
    | "MLB"
    | "NHL"
    | "NFL"
    | "NCAAF"
    | undefined) ?? "ALL";

async function main() {
  const result = await ingestHistoricalOddsSnapshots(league);
  console.info(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
