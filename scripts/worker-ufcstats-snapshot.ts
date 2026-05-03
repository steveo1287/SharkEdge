import { runUfcOperationalCard } from "@/services/ufc/card-runner";
import { ingestUfcRealDataSnapshot } from "@/services/ufc/real-data-ingestion";
import { fetchUfcStatsSnapshot } from "@/services/ufc/ufcstats-fetcher";

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

  const snapshot = await fetchUfcStatsSnapshot({
    eventUrl,
    snapshotAt: argValue("snapshotAt") ?? new Date().toISOString(),
    modelVersion: argValue("modelVersion") ?? "ufc-fight-iq-v1"
  });

  if (hasFlag("simulate")) {
    const result = await runUfcOperationalCard(snapshot, {
      simulations: numberArg("simulations"),
      seed: numberArg("seed"),
      recordShadow: hasFlag("shadow")
    });
    console.log(JSON.stringify({ ok: true, mode: "fetch-ingest-simulate", fights: result.plannedFights.length, result }, null, 2));
    return;
  }

  const ingested = await ingestUfcRealDataSnapshot(snapshot);
  console.log(JSON.stringify({ ok: true, mode: "fetch-ingest", fights: snapshot.fights.length, ingested }, null, 2));
}

main().catch((error) => {
  console.error("[worker-ufcstats-snapshot]", error instanceof Error ? error.message : error);
  process.exit(1);
});
