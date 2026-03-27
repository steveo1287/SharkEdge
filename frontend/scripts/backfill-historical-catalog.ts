import type { SupportedLeagueKey } from "@/lib/types/ledger";
import { backfillHistoricalEventCatalog } from "@/services/historical-odds/catalog-backfill-service";

function readListArg(flag: string) {
  const raw = process.argv.find((argument) => argument.startsWith(`${flag}=`));
  return raw?.split("=")[1] ?? null;
}

function readNumberArg(flag: string) {
  const raw = readListArg(flag);
  if (!raw) {
    return undefined;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function main() {
  const leagues = readListArg("--leagues")
    ?.split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean) as SupportedLeagueKey[] | undefined;
  const days = readNumberArg("--days");
  const startDate = readListArg("--startDate");
  const endDate = readListArg("--endDate");

  const result = await backfillHistoricalEventCatalog({
    leagues,
    days,
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined
  });

  console.info(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
