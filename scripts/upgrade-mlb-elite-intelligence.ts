import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildDailyMlbRosterRatingSnapshots } from "@/services/simulation/mlb-daily-roster-rating-snapshot";
import { persistMlbEnforcedTeamByTeamRatings } from "@/services/simulation/mlb-enforced-rating-persistence";
import { upgradeMlbEliteIntelligence } from "@/services/simulation/mlb-elite-intelligence-upgrade";
import { enforceMlbTeamByTeamPlayerRatings } from "@/services/simulation/mlb-team-by-team-rating-enforcer";
import type {
  MlbBatterMicroTendency,
  MlbPitcherMicroTendency
} from "@/services/simulation/mlb-micro-tendency-model";

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

function jsonArray<T>(filePath: string): T[] {
  if (!existsSync(filePath)) return [];
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  return Array.isArray(parsed) ? parsed as T[] : [];
}

async function main() {
  const season = numberArg("season", new Date().getUTCFullYear());
  const rosterType = (argValue("rosterType") || "active") as "active" | "40Man" | "fullSeason";
  const snapshotDate = argValue("snapshotDate") || new Date().toISOString().slice(0, 10);
  const outDir = argValue("outDir") || path.join(process.cwd(), "data", "mlb", "quality");
  const batterPath = argValue("batterMicro") || process.env.MLB_BATTER_MICRO_TENDENCIES_PATH || path.join(process.cwd(), "data", "mlb", "micro", "batter-micro-tendencies.json");
  const pitcherPath = argValue("pitcherMicro") || process.env.MLB_PITCHER_MICRO_TENDENCIES_PATH || path.join(process.cwd(), "data", "mlb", "micro", "pitcher-micro-tendencies.json");
  const rosterOnly = hasFlag("rosterOnly");
  const persist = hasFlag("persist") && !hasFlag("dryRun");
  const generatedAt = new Date().toISOString();

  const rosterRatings = await buildDailyMlbRosterRatingSnapshots({
    season,
    rosterType,
    snapshotDate,
    persist: false,
    includeStatsApiStats: !rosterOnly,
    fetchConcurrency: numberArg("concurrency", 6),
    minHitterPlateAppearances: numberArg("minHitterPlateAppearances", 0),
    minPitcherBattersFaced: numberArg("minPitcherBattersFaced", 0)
  });
  const batterTendencies = jsonArray<MlbBatterMicroTendency>(batterPath);
  const pitcherTendencies = jsonArray<MlbPitcherMicroTendency>(pitcherPath);
  const upgrade = enforceMlbTeamByTeamPlayerRatings(upgradeMlbEliteIntelligence({
    ratings: rosterRatings.ratings,
    batterTendencies,
    pitcherTendencies
  }));
  const persistence = await persistMlbEnforcedTeamByTeamRatings({
    result: upgrade,
    season,
    snapshotDate,
    generatedAt,
    persist
  });

  await mkdir(outDir, { recursive: true });
  const reportPath = path.join(outDir, `elite-intelligence-quality-${snapshotDate}.json`);
  const ratingsPath = path.join(outDir, `elite-ratings-upgraded-${snapshotDate}.json`);
  const teamReportPath = path.join(outDir, `team-by-team-rating-report-${snapshotDate}.json`);
  const persistencePath = path.join(outDir, `enforced-rating-persistence-${snapshotDate}.json`);
  await writeFile(reportPath, `${JSON.stringify(upgrade.report, null, 2)}\n`, "utf8");
  await writeFile(ratingsPath, `${JSON.stringify(upgrade.ratings, null, 2)}\n`, "utf8");
  await writeFile(teamReportPath, `${JSON.stringify(upgrade.teamByTeamReport, null, 2)}\n`, "utf8");
  await writeFile(persistencePath, `${JSON.stringify(persistence, null, 2)}\n`, "utf8");

  const output = {
    ok: upgrade.teamByTeamReport.noThinWithMlbSampleCount === 0 && (!persist || persistence.persisted),
    snapshotDate,
    season,
    rosterType,
    persisted: persistence.persisted,
    persistence,
    rosterRatings: {
      teamsCovered: rosterRatings.teamsCovered,
      playersSeen: rosterRatings.playersSeen,
      hittersRated: rosterRatings.hittersRated,
      pitchersRated: rosterRatings.pitchersRated
    },
    microFeeds: {
      batterPath,
      pitcherPath,
      batterCount: batterTendencies.length,
      pitcherCount: pitcherTendencies.length
    },
    eliteUpgrade: {
      averageRatingTrust: upgrade.report.averageRatingTrust,
      averageTendencyTrust: upgrade.report.averageTendencyTrust,
      averageCombinedTrust: upgrade.report.averageCombinedTrust,
      elitePlayers: upgrade.report.elitePlayers,
      bettablePlayers: upgrade.report.bettablePlayers,
      thinPlayers: upgrade.report.thinPlayers,
      warnings: upgrade.report.warnings,
      gates: upgrade.report.gates
    },
    teamByTeam: {
      teamCount: upgrade.teamByTeamReport.teamCount,
      playerCount: upgrade.teamByTeamReport.playerCount,
      floorAppliedCount: upgrade.teamByTeamReport.floorAppliedCount,
      noThinWithMlbSampleCount: upgrade.teamByTeamReport.noThinWithMlbSampleCount,
      teams: upgrade.teamByTeamReport.teams
    },
    outputs: { reportPath, ratingsPath, teamReportPath, persistencePath }
  };

  console.log(JSON.stringify(output, null, 2));
  if (!output.ok) process.exitCode = 2;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
