import { runUfcUpcomingToSimPipeline } from "@/services/ufc/upcoming-to-sim-pipeline";

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
  const result = await runUfcUpcomingToSimPipeline({
    dryRun: hasFlag("dryRun"),
    skipIngest: true,
    includeUfcStats: false,
    includeUfcCom: false,
    includeEspn: false,
    includeTapology: false,
    includeMvp: !hasFlag("skipMvp"),
    allowFallbackFeatures: false,
    forceRegenerate: true,
    recordShadow: !hasFlag("noShadow"),
    modelVersion: argValue("modelVersion") ?? undefined,
    horizonDays: numberArg("horizonDays"),
    limit: numberArg("limit"),
    offset: numberArg("offset"),
    simulations: numberArg("simulations"),
    seed: numberArg("seed")
  });

  console.log(JSON.stringify({
    ok: result.ok,
    mode: "style-genome-backfill",
    regenerated: result.simulatedCount,
    skipped: result.skippedCount,
    candidates: result.candidates,
    errors: result.errors
  }, null, 2));

  if (!result.ok) process.exit(1);
}

main().catch((error) => {
  console.error("[worker-ufc-style-genome-backfill]", error instanceof Error ? error.message : error);
  process.exit(1);
});
