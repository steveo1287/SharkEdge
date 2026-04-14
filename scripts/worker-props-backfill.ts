import { backfillPropWarehouse } from "@/services/props/warehouse-service";
import { getBooleanArg, getStringArg, logStep, parseArgs } from "./_runtime-utils";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const league = (getStringArg(args, "league")?.toUpperCase() ?? "ALL") as
    | "ALL"
    | "NBA"
    | "NCAAB";
  const from = getStringArg(args, "from");
  const to = getStringArg(args, "to");
  const dryRun = getBooleanArg(args, "dryRun");

  logStep("worker:props-backfill:start", {
    league,
    from: from ?? null,
    to: to ?? null,
    dryRun
  });

  const result = await backfillPropWarehouse({
    league,
    from,
    to,
    dryRun
  });

  logStep("worker:props-backfill:done", result);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
