import { backfillPropWarehouse, syncPropWarehouse } from "@/services/props/warehouse-service";
import { getBooleanArg, getNumberArg, getStringArg, logStep, parseArgs } from "./_runtime-utils";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const league = (getStringArg(args, "league")?.toUpperCase() ?? "ALL") as
    | "ALL"
    | "NBA";
  const eventId = getStringArg(args, "eventId");
  const maxEvents = getNumberArg(args, "maxEvents", 4);
  const lookaheadHours = getNumberArg(args, "lookaheadHours", 36);
  const dryRun = getBooleanArg(args, "dryRun");
  const mode = getStringArg(args, "mode") ?? "sync";

  logStep("worker:props:start", {
    league,
    eventId: eventId ?? null,
    maxEvents,
    lookaheadHours,
    dryRun,
    mode
  });

  const result =
    mode === "backfill"
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

  logStep("worker:props:done", result);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
