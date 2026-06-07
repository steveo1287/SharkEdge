import { writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildMlbEliteRatingSystem,
  type MlbEliteHitterTendencyRow,
  type MlbEliteMarketCalibrationRow,
  type MlbElitePitcherTendencyRow,
  type MlbEliteRatingBuild,
  type MlbEliteTeamContextRow
} from "@/services/simulation/mlb-elite-rating-system";
import type {
  MlbRawHitterStatRow,
  MlbRawPitcherStatRow,
  MlbTheShowRatingRow
} from "@/services/simulation/mlb-real-player-ratings";

export type MlbEliteRatingSnapshotSource = {
  season: number | string;
  hitterStats: MlbRawHitterStatRow[];
  pitcherStats: MlbRawPitcherStatRow[];
  hitterSplits?: MlbRawHitterStatRow[];
  pitcherSplits?: MlbRawPitcherStatRow[];
  hitterTendencies?: MlbEliteHitterTendencyRow[];
  pitcherTendencies?: MlbElitePitcherTendencyRow[];
  teamContexts?: MlbEliteTeamContextRow[];
  marketCalibration?: MlbEliteMarketCalibrationRow[];
  theShowRatings?: MlbTheShowRatingRow[];
};

function requireJsonArray(value: unknown, label: string) {
  if (!Array.isArray(value)) throw new Error(`${label} must be a JSON array.`);
  return value;
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  if (!filePath) return fallback;
  const file = await import("node:fs/promises").then((fs) => fs.readFile(filePath, "utf8"));
  return JSON.parse(file) as T;
}

export async function buildMlbEliteRatingSnapshotFromFiles(args: {
  season: number | string;
  hitterStatsPath: string;
  pitcherStatsPath: string;
  hitterSplitsPath?: string;
  pitcherSplitsPath?: string;
  hitterTendenciesPath?: string;
  pitcherTendenciesPath?: string;
  teamContextsPath?: string;
  marketCalibrationPath?: string;
  theShowRatingsPath?: string;
  outPath?: string;
}): Promise<MlbEliteRatingBuild> {
  const hitterStats = requireJsonArray(await readJson<unknown>(args.hitterStatsPath, []), "hitterStats") as MlbRawHitterStatRow[];
  const pitcherStats = requireJsonArray(await readJson<unknown>(args.pitcherStatsPath, []), "pitcherStats") as MlbRawPitcherStatRow[];
  const hitterSplits = requireJsonArray(await readJson<unknown>(args.hitterSplitsPath ?? "", []), "hitterSplits") as MlbRawHitterStatRow[];
  const pitcherSplits = requireJsonArray(await readJson<unknown>(args.pitcherSplitsPath ?? "", []), "pitcherSplits") as MlbRawPitcherStatRow[];
  const hitterTendencies = requireJsonArray(await readJson<unknown>(args.hitterTendenciesPath ?? "", []), "hitterTendencies") as MlbEliteHitterTendencyRow[];
  const pitcherTendencies = requireJsonArray(await readJson<unknown>(args.pitcherTendenciesPath ?? "", []), "pitcherTendencies") as MlbElitePitcherTendencyRow[];
  const teamContexts = requireJsonArray(await readJson<unknown>(args.teamContextsPath ?? "", []), "teamContexts") as MlbEliteTeamContextRow[];
  const marketCalibration = requireJsonArray(await readJson<unknown>(args.marketCalibrationPath ?? "", []), "marketCalibration") as MlbEliteMarketCalibrationRow[];
  const theShowRatings = requireJsonArray(await readJson<unknown>(args.theShowRatingsPath ?? "", []), "theShowRatings") as MlbTheShowRatingRow[];

  const snapshot = buildMlbEliteRatingSystem({
    season: args.season,
    hitterStats,
    pitcherStats,
    hitterSplits,
    pitcherSplits,
    hitterTendencies,
    pitcherTendencies,
    teamContexts,
    marketCalibration,
    theShowRatings,
    options: {
      minHitterPlateAppearances: 1,
      minPitcherBattersFaced: 1,
      theShowPriorWeight: 0.08
    }
  });

  if (args.outPath) {
    await writeFile(args.outPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  }

  return snapshot;
}

function argValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? "";
}

async function main() {
  const hitterStatsPath = argValue("hitters");
  const pitcherStatsPath = argValue("pitchers");
  if (!hitterStatsPath || !pitcherStatsPath) {
    throw new Error("Usage: tsx scripts/build-mlb-elite-rating-snapshot.ts --season=2026 --hitters=data/hitters.json --pitchers=data/pitchers.json [--hitterTendencies=...] [--pitcherTendencies=...] [--out=...]");
  }

  const season = argValue("season") || new Date().getUTCFullYear();
  const outPath = argValue("out") || path.join(process.cwd(), "data", `mlb-elite-ratings-${season}.json`);
  const snapshot = await buildMlbEliteRatingSnapshotFromFiles({
    season,
    hitterStatsPath,
    pitcherStatsPath,
    hitterSplitsPath: argValue("hitterSplits"),
    pitcherSplitsPath: argValue("pitcherSplits"),
    hitterTendenciesPath: argValue("hitterTendencies"),
    pitcherTendenciesPath: argValue("pitcherTendencies"),
    teamContextsPath: argValue("teamContexts"),
    marketCalibrationPath: argValue("marketCalibration"),
    theShowRatingsPath: argValue("theShowRatings"),
    outPath
  });

  console.log(JSON.stringify({
    modelVersion: snapshot.modelVersion,
    season: snapshot.season,
    hitters: snapshot.hitters.length,
    pitchers: snapshot.pitchers.length,
    dataQuality: snapshot.diagnostics.dataQuality,
    outPath
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
