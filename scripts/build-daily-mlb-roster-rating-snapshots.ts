import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildDailyMlbRosterRatingSnapshots } from "@/services/simulation/mlb-daily-roster-rating-snapshot";

function argValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? "";
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function numberArg(name: string, fallback: number) {
  const raw = argValue(name);
  return raw && Number.isFinite(Number(raw)) ? Number(raw) : fallback;
}

async function main() {
  const season = numberArg("season", new Date().getUTCFullYear());
  const rosterType = (argValue("rosterType") || "active") as "active" | "40Man" | "fullSeason";
  const snapshotDate = argValue("snapshotDate") || new Date().toISOString().slice(0, 10);
  const outPath = argValue("out") || path.join(process.cwd(), "data", "mlb", `daily-roster-rating-snapshot-${snapshotDate}.json`);
  const persist = !hasFlag("dryRun");
  const report = await buildDailyMlbRosterRatingSnapshots({
    season,
    rosterType,
    snapshotDate,
    persist,
    includeStatsApiStats: !hasFlag("rosterOnly"),
    fetchConcurrency: numberArg("concurrency", 6),
    minHitterPlateAppearances: numberArg("minHitterPlateAppearances", 0),
    minPitcherBattersFaced: numberArg("minPitcherBattersFaced", 0)
  });

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    ok: report.ok,
    modelVersion: report.modelVersion,
    season: report.season,
    rosterType: report.rosterType,
    snapshotDate: report.snapshotDate,
    persisted: report.persisted,
    teamsCovered: `${report.teamsCovered}/${report.teamsExpected}`,
    playersSeen: report.playersSeen,
    hittersRated: report.hittersRated,
    pitchersRated: report.pitchersRated,
    warnings: report.warnings,
    outPath
  }, null, 2));

  if (!report.ok) process.exitCode = 2;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
