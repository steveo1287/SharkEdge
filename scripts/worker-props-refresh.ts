import {
  importDKscraPyProps,
  importGto76Props,
  syncPropWarehouse
} from "@/services/props/warehouse-service";
import { getBooleanArg, getNumberArg, getStringArg, logStep, parseArgs } from "./_runtime-utils";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const league = (getStringArg(args, "league")?.toUpperCase() ?? "ALL") as
    | "ALL"
    | "NBA"
    | "NCAAB";
  const maxEvents = getNumberArg(args, "maxEvents", 2);
  const lookaheadHours = getNumberArg(args, "lookaheadHours", 18);
  const dryRun = getBooleanArg(args, "dryRun");
  const gto76Path = getStringArg(args, "gto76Path") ?? process.env.GTO76_IMPORT_PATH?.trim();
  const dkscrapyPath = getStringArg(args, "dkscrapyPath") ?? process.env.DKSCRAPY_IMPORT_PATH?.trim();

  logStep("worker:props-refresh:start", {
    league,
    maxEvents,
    lookaheadHours,
    dryRun,
    gto76Path: gto76Path ?? null,
    dkscrapyPath: dkscrapyPath ?? null
  });

  const result = await syncPropWarehouse({
    league,
    maxEvents,
    lookaheadHours,
    dryRun
  });

  if (gto76Path && (league === "ALL" || league === "NBA")) {
    const gto76Result = await importGto76Props({
      path: gto76Path,
      dryRun
    });

    logStep("worker:props-refresh:gto76", {
      path: gto76Path,
      importedRows: gto76Result.importedRows,
      storedRows: gto76Result.storedRows,
      storedSnapshots: gto76Result.storedSnapshots,
      skippedRows: gto76Result.skippedRows
    });
  }

  if (dkscrapyPath) {
    const dkscrapyResult = await importDKscraPyProps({
      path: dkscrapyPath,
      dryRun,
      league: league as "ALL" | "NBA" | "NCAAB" | "MLB" | "NFL" | "NCAAF"
    });

    logStep("worker:props-refresh:dkscrapy", {
      path: dkscrapyPath,
      importedRows: dkscrapyResult.importedRows,
      storedRows: dkscrapyResult.storedRows,
      storedSnapshots: dkscrapyResult.storedSnapshots,
      skippedRows: dkscrapyResult.skippedRows
    });
  }

  logStep("worker:props-refresh:done", result);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
