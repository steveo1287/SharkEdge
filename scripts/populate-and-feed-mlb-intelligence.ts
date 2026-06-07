import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildDailyMlbRosterRatingSnapshots } from "@/services/simulation/mlb-daily-roster-rating-snapshot";
import {
  buildMlbMicroTendencyFeedsFromStatcast,
  parseMlbStatcastCsv
} from "@/services/simulation/mlb-statcast-micro-feed-builder";
import { normalizeMlbStatcastRowsForMicroFeed } from "@/services/simulation/mlb-statcast-row-normalizer";

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

async function fetchCsvFromUrl(url: string) {
  if (!url.startsWith("https://")) throw new Error("Only https:// Statcast CSV URLs are allowed.");
  const response = await fetch(url, {
    headers: {
      accept: "text/csv,*/*",
      "user-agent": "SharkEdge MLB populate feed worker"
    }
  });
  if (!response.ok) throw new Error(`Statcast CSV fetch failed: ${response.status} ${response.statusText}`);
  const csv = await response.text();
  if (!csv.includes("pitch_type") || !csv.includes("batter") || !csv.includes("pitcher")) {
    throw new Error("Fetched Statcast payload does not look like a pitch-level CSV export.");
  }
  return csv;
}

async function loadStatcastCsv() {
  const csvPath = argValue("statcastCsv") || process.env.MLB_STATCAST_CSV_PATH || "";
  const csvUrl = argValue("statcastUrl") || process.env.MLB_STATCAST_CSV_URL || "";
  if (csvPath) return { source: csvPath, csv: await readFile(csvPath, "utf8") };
  if (csvUrl) return { source: csvUrl, csv: await fetchCsvFromUrl(csvUrl) };
  return null;
}

async function maybeBuildMicroFeeds(snapshotDate: string) {
  const csvPayload = await loadStatcastCsv();
  if (!csvPayload) {
    return {
      built: false,
      reason: "No Statcast CSV provided. Set MLB_STATCAST_CSV_URL, MLB_STATCAST_CSV_PATH, --statcastUrl, or --statcastCsv to refresh micro feeds.",
      diagnostics: null,
      outputs: null
    };
  }

  const outDir = argValue("microOutDir") || process.env.MLB_MICRO_FEED_OUT_DIR || path.join(process.cwd(), "data", "mlb", "micro");
  const normalized = normalizeMlbStatcastRowsForMicroFeed(parseMlbStatcastCsv(csvPayload.csv));
  const feed = buildMlbMicroTendencyFeedsFromStatcast(normalized, {
    sourceLabel: csvPayload.source,
    minBatterPitches: numberArg("minBatterPitches", 80),
    minPitcherPitches: numberArg("minPitcherPitches", 80),
    minTerminalEvents: numberArg("minTerminalEvents", 25)
  });

  await mkdir(outDir, { recursive: true });
  const allPath = path.join(outDir, `statcast-micro-feed-${snapshotDate}.json`);
  const latestAllPath = path.join(outDir, "statcast-micro-feed.json");
  const battersPath = path.join(outDir, "batter-micro-tendencies.json");
  const pitchersPath = path.join(outDir, "pitcher-micro-tendencies.json");
  await writeFile(allPath, `${JSON.stringify(feed, null, 2)}\n`, "utf8");
  await writeFile(latestAllPath, `${JSON.stringify(feed, null, 2)}\n`, "utf8");
  await writeFile(battersPath, `${JSON.stringify(feed.batters, null, 2)}\n`, "utf8");
  await writeFile(pitchersPath, `${JSON.stringify(feed.pitchers, null, 2)}\n`, "utf8");

  return {
    built: true,
    reason: "Statcast micro feeds refreshed and written to live feed paths.",
    diagnostics: feed.diagnostics,
    warnings: feed.warnings,
    outputs: { allPath, latestAllPath, battersPath, pitchersPath }
  };
}

async function main() {
  const season = numberArg("season", new Date().getUTCFullYear());
  const rosterType = (argValue("rosterType") || "active") as "active" | "40Man" | "fullSeason";
  const snapshotDate = argValue("snapshotDate") || new Date().toISOString().slice(0, 10);
  const outPath = argValue("out") || path.join(process.cwd(), "data", "mlb", `populate-feed-report-${snapshotDate}.json`);
  const dryRun = hasFlag("dryRun");

  const rosterRatings = await buildDailyMlbRosterRatingSnapshots({
    season,
    rosterType,
    snapshotDate,
    persist: !dryRun,
    includeStatsApiStats: !hasFlag("rosterOnly"),
    fetchConcurrency: numberArg("concurrency", 6),
    minHitterPlateAppearances: numberArg("minHitterPlateAppearances", 0),
    minPitcherBattersFaced: numberArg("minPitcherBattersFaced", 0)
  });

  const microFeeds = await maybeBuildMicroFeeds(snapshotDate);
  const report = {
    ok: rosterRatings.ok && (!microFeeds.built || !microFeeds.warnings?.length),
    modelVersion: "mlb-populate-and-feed-v1",
    generatedAt: new Date().toISOString(),
    snapshotDate,
    dryRun,
    rosterRatings: {
      ok: rosterRatings.ok,
      persisted: rosterRatings.persisted,
      teamsCovered: rosterRatings.teamsCovered,
      teamsExpected: rosterRatings.teamsExpected,
      playersSeen: rosterRatings.playersSeen,
      hittersRated: rosterRatings.hittersRated,
      pitchersRated: rosterRatings.pitchersRated,
      warnings: rosterRatings.warnings,
      teams: rosterRatings.teams
    },
    microFeeds
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    ok: report.ok,
    snapshotDate,
    dryRun,
    rosterRatings: report.rosterRatings,
    microFeeds,
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
