import { importArnavSaraogiMlbHistoricalOdds } from "@/services/historical-odds/arnavsaraogi-mlb-import-service";

const pathArg = process.argv.find((argument) => argument.startsWith("--path="));
const dryRun = process.argv.includes("--dry-run");

const filePath = pathArg?.split("=")[1];
if (!filePath) {
  console.error("Missing --path=... for ArnavSaraogi MLB historical import.");
  process.exit(1);
}

async function main() {
  const result = await importArnavSaraogiMlbHistoricalOdds({
    path: filePath!,
    dryRun
  });
  console.info(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

