import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildMlbMicroTendencyFeedsFromStatcast,
  parseMlbStatcastCsv
} from "@/services/simulation/mlb-statcast-micro-feed-builder";
import { normalizeMlbStatcastRowsForMicroFeed } from "@/services/simulation/mlb-statcast-row-normalizer";

function argValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? "";
}

async function main() {
  const inputPath = argValue("csv");
  const outDir = argValue("outDir") || path.join(process.cwd(), "data", "mlb", "micro");
  const sourceLabel = argValue("source") || path.basename(inputPath || "statcast.csv");
  const minBatterPitches = Number(argValue("minBatterPitches") || 80);
  const minPitcherPitches = Number(argValue("minPitcherPitches") || 80);
  const minTerminalEvents = Number(argValue("minTerminalEvents") || 25);

  if (!inputPath) {
    throw new Error("Usage: npx tsx scripts/build-mlb-micro-feeds-from-statcast.ts --csv=data/mlb/statcast.csv --outDir=data/mlb/micro");
  }

  const csv = await readFile(inputPath, "utf8");
  const rows = normalizeMlbStatcastRowsForMicroFeed(parseMlbStatcastCsv(csv));
  const feed = buildMlbMicroTendencyFeedsFromStatcast(rows, {
    sourceLabel,
    minBatterPitches,
    minPitcherPitches,
    minTerminalEvents
  });

  await mkdir(outDir, { recursive: true });
  const allPath = path.join(outDir, "statcast-micro-feed.json");
  const battersPath = path.join(outDir, "batter-micro-tendencies.json");
  const pitchersPath = path.join(outDir, "pitcher-micro-tendencies.json");
  await writeFile(allPath, `${JSON.stringify(feed, null, 2)}\n`, "utf8");
  await writeFile(battersPath, `${JSON.stringify(feed.batters, null, 2)}\n`, "utf8");
  await writeFile(pitchersPath, `${JSON.stringify(feed.pitchers, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    modelVersion: feed.modelVersion,
    sourceLabel: feed.sourceLabel,
    rawRows: feed.diagnostics.rawRows,
    usableRows: feed.diagnostics.usableRows,
    terminalPitchRows: feed.diagnostics.terminalPitchRows,
    battedBallRows: feed.diagnostics.battedBallRows,
    batters: feed.diagnostics.batterCount,
    pitchers: feed.diagnostics.pitcherCount,
    warnings: feed.warnings,
    outputs: { allPath, battersPath, pitchersPath }
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
