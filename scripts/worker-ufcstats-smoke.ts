import { runUfcOperationalCard } from "@/services/ufc/card-runner";
import { ingestUfcRealDataSnapshot } from "@/services/ufc/real-data-ingestion";
import { fetchUfcStatsSnapshotWithDiagnostics } from "@/services/ufc/ufcstats-fetcher";
import { buildUfcStatsSmokeReport } from "@/services/ufc/ufcstats-smoke-report";

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
  const eventUrl = argValue("eventUrl");
  if (!eventUrl) throw new Error("Missing --eventUrl=<ufcstats event url>");

  const fetchResult = await fetchUfcStatsSnapshotWithDiagnostics({
    eventUrl,
    snapshotAt: argValue("snapshotAt") ?? new Date().toISOString(),
    modelVersion: argValue("modelVersion") ?? "ufc-fight-iq-v1"
  });
  const report = buildUfcStatsSmokeReport(fetchResult);

  if (hasFlag("dryRun")) {
    console.log(JSON.stringify({ ok: report.ok, mode: "smoke-dry-run", report }, null, 2));
    return;
  }

  if (!report.ok) {
    console.log(JSON.stringify({ ok: false, mode: "smoke-blocked", report }, null, 2));
    process.exit(1);
  }

  if (hasFlag("simulate")) {
    const result = await runUfcOperationalCard(fetchResult.snapshot, {
      simulations: numberArg("simulations"),
      seed: numberArg("seed"),
      recordShadow: hasFlag("shadow")
    });
    console.log(JSON.stringify({ ok: true, mode: "smoke-ingest-simulate", report, result }, null, 2));
    return;
  }

  const ingested = await ingestUfcRealDataSnapshot(fetchResult.snapshot);
  console.log(JSON.stringify({ ok: true, mode: "smoke-ingest", report, ingested }, null, 2));
}

main().catch((error) => {
  console.error("[worker-ufcstats-smoke]", error instanceof Error ? error.message : error);
  process.exit(1);
});
