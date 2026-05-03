import { gradeOpenNbaPropPredictionSnapshots } from "@/services/simulation/nba-prop-ledger-grader";
import { getNumberArg, logStep, parseArgs } from "./_runtime-utils";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const limit = getNumberArg(args, "limit", 250);

  logStep("worker:nba-prop-ledger-grade:start", { limit });
  const result = await gradeOpenNbaPropPredictionSnapshots({ limit });
  logStep("worker:nba-prop-ledger-grade:done", result);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
