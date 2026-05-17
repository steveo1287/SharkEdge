import { runOddsApiSnapshotPull } from "@/services/odds/the-odds-api-budget-service";
import { runUfcUpcomingToSimPipeline } from "@/services/ufc/upcoming-to-sim-pipeline";

function argValue(name: string) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

function listArg(name: string) {
  const value = argValue(name);
  if (!value) return undefined;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
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

async function refreshUfcOddsIfRequested() {
  if (hasFlag("dryRun") || hasFlag("noOddsRefresh")) return null;
  return runOddsApiSnapshotPull({ mode: "manual", sportsCsv: "mma_mixed_martial_arts" }).catch((error) => ({
    ok: false,
    skipped: false,
    reason: error instanceof Error ? error.message : String(error),
    ufcMarketOdds: null
  }));
}

async function main() {
  const oddsRefresh = await refreshUfcOddsIfRequested();
  const result = await runUfcUpcomingToSimPipeline({
    dryRun: hasFlag("dryRun"),
    skipIngest: hasFlag("skipIngest"),
    includeUfcStats: !hasFlag("skipUfcStats"),
    includeUfcCom: !hasFlag("skipUfcCom"),
    includeEspn: !hasFlag("skipEspn"),
    includeTapology: !hasFlag("skipTapology"),
    includeMvp: !hasFlag("skipMvp"),
    allowFallbackFeatures: hasFlag("allowFallbackFeatures") || !hasFlag("noFallbackFeatures"),
    forceRegenerate: !hasFlag("skipExisting") && !hasFlag("noForceRegenerate"),
    recordShadow: hasFlag("shadow") || !hasFlag("noShadow"),
    modelVersion: argValue("modelVersion") ?? undefined,
    horizonDays: numberArg("horizonDays"),
    limit: numberArg("limit"),
    simulations: numberArg("simulations"),
    seed: numberArg("seed"),
    ufcStatsListUrl: argValue("ufcStatsListUrl") ?? undefined,
    ufcComUrls: listArg("ufcComUrls"),
    espnUrls: listArg("espnUrls"),
    tapologyUrls: listArg("tapologyUrls"),
    mvpListUrl: argValue("mvpListUrl") ?? undefined,
    mvpEventUrls: listArg("mvpEventUrls")
  });

  console.log(JSON.stringify({ oddsRefresh, sim: result }, null, 2));
  if (!result.ok) process.exit(1);
}

main().catch((error) => {
  console.error("[worker-ufc-upcoming-to-sim]", error instanceof Error ? error.message : error);
  process.exit(1);
});
