import { gradePendingMlbPlayerPropInningLedgers } from "@/services/simulation/mlb-player-prop-inning-grader";

function argValue(name: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

async function main() {
  const limit = Number(argValue("limit") ?? 1000);
  const dryRun = process.argv.includes("--dry-run");
  const result = await gradePendingMlbPlayerPropInningLedgers({ limit, dryRun });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok && result.errors.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
