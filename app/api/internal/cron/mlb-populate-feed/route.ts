import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import { buildDailyMlbRosterRatingSnapshots } from "@/services/simulation/mlb-daily-roster-rating-snapshot";
import {
  buildMlbMicroTendencyFeedsFromStatcast,
  parseMlbStatcastCsv
} from "@/services/simulation/mlb-statcast-micro-feed-builder";
import { normalizeMlbStatcastRowsForMicroFeed } from "@/services/simulation/mlb-statcast-row-normalizer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function boolParam(value: string | null | undefined, fallback: boolean) {
  if (value == null || value === "") return fallback;
  return !["0", "false", "no", "off"].includes(value.trim().toLowerCase());
}

function intParam(value: string | null | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
}

function rosterTypeParam(value: string | null | undefined): "active" | "40Man" | "fullSeason" {
  if (value === "active" || value === "40Man" || value === "fullSeason") return value;
  return "active";
}

async function fetchCsvFromUrl(url: string) {
  if (!url.startsWith("https://")) throw new Error("Only https:// Statcast CSV URLs are allowed.");
  const response = await fetch(url, {
    headers: {
      accept: "text/csv,*/*",
      "user-agent": "SharkEdge MLB populate feed worker"
    },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Statcast CSV fetch failed: ${response.status} ${response.statusText}`);
  const csv = await response.text();
  if (!csv.includes("pitch_type") || !csv.includes("batter") || !csv.includes("pitcher")) {
    throw new Error("Fetched Statcast payload does not look like a pitch-level CSV export.");
  }
  return csv;
}

async function loadStatcastCsv(args: { csvPath?: string; csvUrl?: string }) {
  if (args.csvPath) return { source: args.csvPath, csv: await readFile(args.csvPath, "utf8") };
  if (args.csvUrl) return { source: args.csvUrl, csv: await fetchCsvFromUrl(args.csvUrl) };
  return null;
}

async function maybeBuildMicroFeeds(args: {
  snapshotDate: string;
  include: boolean;
  csvPath?: string;
  csvUrl?: string;
  minBatterPitches: number;
  minPitcherPitches: number;
  minTerminalEvents: number;
}) {
  if (!args.include) {
    return {
      built: false,
      reason: "Statcast micro feed skipped.",
      diagnostics: null,
      warnings: [] as string[],
      outputs: null
    };
  }

  const csvPayload = await loadStatcastCsv({ csvPath: args.csvPath, csvUrl: args.csvUrl });
  if (!csvPayload) {
    return {
      built: false,
      reason: "No Statcast CSV configured. Set MLB_STATCAST_CSV_URL or MLB_STATCAST_CSV_PATH to refresh micro feeds.",
      diagnostics: null,
      warnings: ["Statcast micro feed requested but no CSV source is configured."],
      outputs: null
    };
  }

  const outDir = process.env.MLB_MICRO_FEED_OUT_DIR || path.join(process.cwd(), "data", "mlb", "micro");
  const normalized = normalizeMlbStatcastRowsForMicroFeed(parseMlbStatcastCsv(csvPayload.csv));
  const feed = buildMlbMicroTendencyFeedsFromStatcast(normalized, {
    sourceLabel: csvPayload.source,
    minBatterPitches: args.minBatterPitches,
    minPitcherPitches: args.minPitcherPitches,
    minTerminalEvents: args.minTerminalEvents
  });

  await mkdir(outDir, { recursive: true });
  const allPath = path.join(outDir, `statcast-micro-feed-${args.snapshotDate}.json`);
  const latestAllPath = path.join(outDir, "statcast-micro-feed.json");
  const battersPath = path.join(outDir, "batter-micro-tendencies.json");
  const pitchersPath = path.join(outDir, "pitcher-micro-tendencies.json");

  await writeFile(allPath, `${JSON.stringify(feed, null, 2)}\n`, "utf8");
  await writeFile(latestAllPath, `${JSON.stringify(feed, null, 2)}\n`, "utf8");
  await writeFile(battersPath, `${JSON.stringify(feed.batters, null, 2)}\n`, "utf8");
  await writeFile(pitchersPath, `${JSON.stringify(feed.pitchers, null, 2)}\n`, "utf8");

  return {
    built: true,
    reason: "Statcast micro feeds refreshed.",
    diagnostics: feed.diagnostics,
    warnings: feed.warnings,
    outputs: { allPath, latestAllPath, battersPath, pitchersPath }
  };
}

export async function GET(request: Request) {
  const unauthorized = ensureInternalApiAccess(request);
  if (unauthorized) return unauthorized;

  const startedAt = Date.now();
  const url = new URL(request.url);
  const snapshotDate = url.searchParams.get("snapshotDate")?.trim() || todayUtc();
  const season = intParam(url.searchParams.get("season"), new Date().getUTCFullYear(), 2020, 2035);
  const rosterType = rosterTypeParam(url.searchParams.get("rosterType") || process.env.MLB_ROSTER_RATING_TYPE);
  const dryRun = boolParam(url.searchParams.get("dryRun"), false);
  const includeStatsApiStats = boolParam(url.searchParams.get("includeStatsApiStats"), true);
  const includeStatcastMicro = boolParam(
    url.searchParams.get("includeStatcastMicro"),
    Boolean(process.env.MLB_STATCAST_CSV_URL || process.env.MLB_STATCAST_CSV_PATH)
  );
  const statcastCsv = url.searchParams.get("statcastCsv")?.trim() || process.env.MLB_STATCAST_CSV_PATH?.trim();
  const statcastUrl = url.searchParams.get("statcastUrl")?.trim() || process.env.MLB_STATCAST_CSV_URL?.trim();

  const warnings: string[] = [];
  let rosterRatings;
  try {
    rosterRatings = await buildDailyMlbRosterRatingSnapshots({
      season,
      rosterType,
      snapshotDate,
      persist: !dryRun,
      includeStatsApiStats,
      fetchConcurrency: intParam(url.searchParams.get("concurrency"), 6, 1, 12),
      minHitterPlateAppearances: intParam(url.searchParams.get("minHitterPlateAppearances"), 0, 0, 1000),
      minPitcherBattersFaced: intParam(url.searchParams.get("minPitcherBattersFaced"), 0, 0, 1000)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        ok: false,
        durationMs: Date.now() - startedAt,
        mode: dryRun ? "dry-run" : "persist",
        season,
        rosterType,
        snapshotDate,
        error: message,
        warnings: [`MLB roster rating snapshot failed: ${message}`]
      },
      { status: 500 }
    );
  }

  let microFeeds;
  try {
    microFeeds = await maybeBuildMicroFeeds({
      snapshotDate,
      include: includeStatcastMicro,
      csvPath: statcastCsv,
      csvUrl: statcastCsv ? undefined : statcastUrl,
      minBatterPitches: intParam(url.searchParams.get("minBatterPitches"), 80, 1, 2000),
      minPitcherPitches: intParam(url.searchParams.get("minPitcherPitches"), 80, 1, 2000),
      minTerminalEvents: intParam(url.searchParams.get("minTerminalEvents"), 25, 1, 500)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`Statcast micro feed failed: ${message}`);
    microFeeds = {
      built: false,
      reason: message,
      diagnostics: null,
      warnings: [message],
      outputs: null
    };
  }

  const allWarnings = [...rosterRatings.warnings, ...warnings, ...microFeeds.warnings];
  const ok = rosterRatings.ok && (dryRun || rosterRatings.persisted) && !warnings.length;

  return NextResponse.json(
    {
      ok,
      durationMs: Date.now() - startedAt,
      mode: dryRun ? "dry-run" : "persist",
      season,
      rosterType,
      snapshotDate,
      databasePersistence: rosterRatings.persisted,
      rosterRatings,
      microFeeds,
      warnings: allWarnings
    },
    { status: ok ? 200 : rosterRatings.ok ? 207 : 500 }
  );
}
