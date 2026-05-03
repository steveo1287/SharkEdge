import { ingestUpcomingUfcCards } from "@/services/ufc/upcoming-card-ingestion";

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

async function main() {
  const result = await ingestUpcomingUfcCards({
    dryRun: hasFlag("dryRun"),
    includeUfcStats: !hasFlag("skipUfcStats"),
    ufcStatsListUrl: argValue("ufcStatsListUrl") ?? undefined,
    ufcComUrls: listArg("ufcComUrls"),
    espnUrls: listArg("espnUrls"),
    tapologyUrls: listArg("tapologyUrls")
  });

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

main().catch((error) => {
  console.error("[worker-ufc-upcoming-cards]", error instanceof Error ? error.message : error);
  process.exit(1);
});
