import {
  backfillPropWarehouse,
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
  const eventId = getStringArg(args, "eventId");
  const maxEvents = getNumberArg(args, "maxEvents", 4);
  const lookaheadHours = getNumberArg(args, "lookaheadHours", 36);
  const dryRun = getBooleanArg(args, "dryRun");
  const mode = getStringArg(args, "mode") ?? "sync";
  const gto76Path = getStringArg(args, "gto76Path") ?? process.env.GTO76_IMPORT_PATH?.trim();
  const dkscrapyPath = getStringArg(args, "dkscrapyPath") ?? process.env.DKSCRAPY_IMPORT_PATH?.trim();

  logStep("worker:props:start", {
    league,
    eventId: eventId ?? null,
    maxEvents,
    lookaheadHours,
    dryRun,
    mode,
    gto76Path: gto76Path ?? null,
    dkscrapyPath: dkscrapyPath ?? null
  });

  const result =
    mode === "gto76" && gto76Path
      ? await importGto76Props({
          path: gto76Path,
          dryRun
        })
      : mode === "dkscrapy" && dkscrapyPath
        ? await importDKscraPyProps({
            path: dkscrapyPath,
            dryRun,
            league: league as "ALL" | "NBA" | "NCAAB" | "MLB" | "NFL" | "NCAAF"
          })
      : mode === "backfill"
      ? await backfillPropWarehouse({
          league,
          from: getStringArg(args, "from"),
          to: getStringArg(args, "to"),
          dryRun
        })
      : await syncPropWarehouse({
          league,
          eventId,
          maxEvents,
          lookaheadHours,
          dryRun
        });

  if (mode !== "gto76" && gto76Path && (league === "ALL" || league === "NBA")) {
    const gto76Result = await importGto76Props({
      path: gto76Path,
      dryRun
    });

    logStep("worker:props:gto76", {
      path: gto76Path,
      importedRows: gto76Result.importedRows,
      storedRows: gto76Result.storedRows,
      storedSnapshots: gto76Result.storedSnapshots,
      skippedRows: gto76Result.skippedRows
    });
  }

  if (mode !== "dkscrapy" && dkscrapyPath) {
    const dkscrapyResult = await importDKscraPyProps({
      path: dkscrapyPath,
      dryRun,
      league: league as "ALL" | "NBA" | "NCAAB" | "MLB" | "NFL" | "NCAAF"
    });

    logStep("worker:props:dkscrapy", {
      path: dkscrapyPath,
      importedRows: dkscrapyResult.importedRows,
      storedRows: dkscrapyResult.storedRows,
      storedSnapshots: dkscrapyResult.storedSnapshots,
      skippedRows: dkscrapyResult.skippedRows
    });
  }

  logStep("worker:props:done", result);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
