import { backfillMlbCandidatePickLedger } from "@/services/simulation/mlb-candidate-pick-ledger";

function argValue(name: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const limit = Number(argValue("limit") ?? 5000);
  const dryRun = hasFlag("dry-run") || hasFlag("dryRun");
  const result = await backfillMlbCandidatePickLedger({ limit, dryRun });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
