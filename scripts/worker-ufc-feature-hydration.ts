import { hydrateUpcomingUfcFeatureSnapshots } from "@/services/ufc/upcoming-feature-hydration";

function argValue(name: string) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function numberArg(name: string) {
  const value = argValue(name);
  if (value == null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid numeric arg --${name}=${value}`);
  return parsed;
}

async function main() {
  const result = await hydrateUpcomingUfcFeatureSnapshots({
    dryRun: hasFlag("dryRun"),
    modelVersion: argValue("modelVersion") ?? undefined,
    horizonDays: numberArg("horizonDays"),
    limit: numberArg("limit")
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

main().catch((error) => {
  console.error("[worker-ufc-feature-hydration]", error instanceof Error ? error.message : error);
  process.exit(1);
});
