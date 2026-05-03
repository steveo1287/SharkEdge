import { runUfcOperationalCard } from "@/services/ufc/card-runner";
import { ingestUfcRealDataSnapshot } from "@/services/ufc/real-data-ingestion";
import { fetchUfcStatsSnapshotWithDiagnostics } from "@/services/ufc/ufcstats-fetcher";

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

function compactSummary(fetchResult: Awaited<ReturnType<typeof fetchUfcStatsSnapshotWithDiagnostics>>) {
  return {
    eventName: fetchResult.event.eventName,
    eventDate: fetchResult.event.eventDate,
    sourceKey: fetchResult.snapshot.sourceKey,
    fightsInSnapshot: fetchResult.snapshot.fights.length,
    fightLinksFound: fetchResult.diagnostics.fightLinksFound,
    fightDetailsParsed: fetchResult.diagnostics.fightDetailsParsed,
    fighterProfilesRequested: fetchResult.diagnostics.fighterProfilesRequested,
    fighterProfilesParsed: fetchResult.diagnostics.fighterProfilesParsed,
    dataQualityGrade: fetchResult.diagnostics.dataQualityGrade,
    warnings: fetchResult.diagnostics.warnings,
    fatalErrors: fetchResult.diagnostics.fatalErrors,
    wouldIngest: fetchResult.diagnostics.fatalErrors.length === 0 && fetchResult.snapshot.fights.length > 0,
    wouldSimulate: fetchResult.diagnostics.fatalErrors.length === 0 && fetchResult.snapshot.fights.length > 0 && hasFlag("simulate")
  };
}

async function main() {
  const eventUrl = argValue("eventUrl");
  if (!eventUrl) throw new Error("Missing --eventUrl=<ufcstats event url>");

  const fetchResult = await fetchUfcStatsSnapshotWithDiagnostics({
    eventUrl,
    snapshotAt: argValue("snapshotAt") ?? new Date().toISOString(),
    modelVersion: argValue("modelVersion") ?? "ufc-fight-iq-v1"
  });

  if (hasFlag("dryRun")) {
    console.log(JSON.stringify({ ok: fetchResult.diagnostics.fatalErrors.length === 0, mode: "dry-run", summary: compactSummary(fetchResult) }, null, 2));
    return;
  }

  if (fetchResult.diagnostics.fatalErrors.length > 0) {
    console.log(JSON.stringify({ ok: false, mode: "fetch", summary: compactSummary(fetchResult) }, null, 2));
    process.exit(1);
  }

  if (hasFlag("simulate")) {
    const result = await runUfcOperationalCard(fetchResult.snapshot, {
      simulations: numberArg("simulations"),
      seed: numberArg("seed"),
      recordShadow: hasFlag("shadow")
    });
    console.log(JSON.stringify({ ok: true, mode: "fetch-ingest-simulate", summary: compactSummary(fetchResult), result }, null, 2));
    return;
  }

  const ingested = await ingestUfcRealDataSnapshot(fetchResult.snapshot);
  console.log(JSON.stringify({ ok: true, mode: "fetch-ingest", summary: compactSummary(fetchResult), ingested }, null, 2));
}

main().catch((error) => {
  console.error("[worker-ufcstats-snapshot]", error instanceof Error ? error.message : error);
  process.exit(1);
});
