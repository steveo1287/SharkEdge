import { syncPropWarehouse } from "@/services/props/warehouse-service";
import { getBooleanArg, getNumberArg, getStringArg, logStep, parseArgs } from "./_runtime-utils";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const league = (getStringArg(args, "league")?.toUpperCase() ?? "ALL") as
    | "ALL"
    | "NBA";
  const maxEvents = getNumberArg(args, "maxEvents", 2);
  const lookaheadHours = getNumberArg(args, "lookaheadHours", 18);
  const dryRun = getBooleanArg(args, "dryRun");

  logStep("worker:props-refresh:start", {
    league,
    maxEvents,
    lookaheadHours,
    dryRun
  });

  const result = await syncPropWarehouse({
    league,
    maxEvents,
    lookaheadHours,
    dryRun
  });

  logStep("worker:props-refresh:done", result);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
