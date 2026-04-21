import { importSportsbookReviewHistoricalOdds } from "@/services/historical-odds/sportsbookreview-import-service";

const pathArg = process.argv.find((argument) => argument.startsWith("--path="));
const leagueArg = process.argv.find((argument) => argument.startsWith("--league="));
const dryRun = process.argv.includes("--dry-run");

const filePath = pathArg?.split("=")[1];
const league =
  (leagueArg?.split("=")[1] as "ALL" | "NBA" | "MLB" | "NFL" | "NHL" | undefined) ?? "ALL";

if (!filePath) {
  console.error("Missing --path=... for sportsbookreview historical import.");
  process.exit(1);
}

async function main() {
  const resolvedFilePath = filePath!;
  const result = await importSportsbookReviewHistoricalOdds({
    path: resolvedFilePath,
    league,
    dryRun
  });
  console.info(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
