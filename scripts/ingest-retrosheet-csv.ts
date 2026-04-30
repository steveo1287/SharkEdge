import fs from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import { mlbPitcherGameScore } from "@/services/analytics/team-strength/mlb-elo-adjustments";
import {
  getRetrosheetValue,
  parseCsvText,
  parseRetrosheetDate,
  toBoolean,
  toOptionalInteger,
  toRequiredInteger,
  validateRetrosheetColumns,
  type RetrosheetCsvKind
} from "@/services/data/retrosheet/csv";

const prisma = new PrismaClient();
const SOURCE_KEY = "RETROSHEET";

type LoadedCsv = {
  rows: Record<string, string>[];
  resolved: Record<string, string>;
};

async function main() {
  const csvDir = getCsvDirectory();
  const gameinfo = loadCsv(csvDir, "gameinfo", "gameinfo.csv");
  const teamstats = loadCsv(csvDir, "teamstats", "teamstats.csv");
  const pitching = loadCsv(csvDir, "pitching", "pitching.csv");

  let gamesImported = 0;
  let teamStatsImported = 0;
  let pitchingStatsImported = 0;

  for (const row of gameinfo.rows) {
    const game = mapGameRow(row, gameinfo.resolved);
    await prisma.retrosheetGame.upsert({
      where: { retrosheetGameId: game.retrosheetGameId },
      create: game,
      update: game
    });
    gamesImported += 1;
  }

  for (const row of teamstats.rows) {
    const stat = mapTeamStatRow(row, teamstats.resolved);
    await prisma.retrosheetTeamGameStat.upsert({
      where: {
        retrosheetGameId_teamId: {
          retrosheetGameId: stat.retrosheetGameId,
          teamId: stat.teamId
        }
      },
      create: stat,
      update: stat
    });
    teamStatsImported += 1;
  }

  for (const row of pitching.rows) {
    const stat = mapPitchingRow(row, pitching.resolved);
    await prisma.retrosheetPitchingGameStat.upsert({
      where: {
        retrosheetGameId_pitcherId_teamId: {
          retrosheetGameId: stat.retrosheetGameId,
          pitcherId: stat.pitcherId,
          teamId: stat.teamId
        }
      },
      create: stat,
      update: stat
    });
    pitchingStatsImported += 1;
  }

  console.log(JSON.stringify({
    ok: true,
    sourceKey: SOURCE_KEY,
    csvDir,
    gamesImported,
    teamStatsImported,
    pitchingStatsImported
  }, null, 2));
}

function loadCsv(csvDir: string, kind: RetrosheetCsvKind, filename: string): LoadedCsv {
  const filePath = path.join(csvDir, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing Retrosheet CSV file: ${filePath}`);
  }

  const text = fs.readFileSync(filePath, "utf8");
  const rows = parseCsvText(text);
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const validation = validateRetrosheetColumns(kind, headers);
  if (!validation.ok) {
    throw new Error(`${filename} missing required columns: ${validation.missing.join(", ")}`);
  }

  return {
    rows,
    resolved: validation.resolved
  };
}

function mapGameRow(row: Record<string, string>, resolved: Record<string, string>) {
  const gameDate = parseRetrosheetDate(getRetrosheetValue(row, "gameDate", resolved));
  return {
    retrosheetGameId: getRequiredString(row, resolved, "gameId"),
    sourceKey: SOURCE_KEY,
    gameDate,
    season: toRequiredInteger(getRetrosheetValue(row, "season", resolved), "season"),
    gameNumber: toOptionalInteger(getRetrosheetValue(row, "gameNumber", resolved)),
    homeTeamId: getRequiredString(row, resolved, "homeTeamId"),
    awayTeamId: getRequiredString(row, resolved, "awayTeamId"),
    homeScore: toRequiredInteger(getRetrosheetValue(row, "homeScore", resolved), "homeScore"),
    awayScore: toRequiredInteger(getRetrosheetValue(row, "awayScore", resolved), "awayScore"),
    parkId: emptyToNull(getRetrosheetValue(row, "parkId", resolved)),
    isPostseason: inferPostseason(getRetrosheetValue(row, "isPostseason", resolved)),
    rawJson: row
  };
}

function mapTeamStatRow(row: Record<string, string>, resolved: Record<string, string>) {
  const gameDate = parseRetrosheetDate(getRetrosheetValue(row, "gameDate", resolved));
  return {
    retrosheetGameId: getRequiredString(row, resolved, "gameId"),
    teamId: getRequiredString(row, resolved, "teamId"),
    opponentTeamId: emptyToNull(getRetrosheetValue(row, "opponentTeamId", resolved)),
    isHome: toBoolean(getRetrosheetValue(row, "isHome", resolved)) ?? false,
    sourceKey: SOURCE_KEY,
    gameDate,
    season: toRequiredInteger(getRetrosheetValue(row, "season", resolved), "season"),
    runs: toRequiredInteger(getRetrosheetValue(row, "runs", resolved), "runs"),
    runsAllowed: toRequiredInteger(getRetrosheetValue(row, "runsAllowed", resolved), "runsAllowed"),
    rawJson: row
  };
}

function mapPitchingRow(row: Record<string, string>, resolved: Record<string, string>) {
  const strikeouts = toRequiredInteger(getRetrosheetValue(row, "strikeouts", resolved), "strikeouts");
  const outs = toRequiredInteger(getRetrosheetValue(row, "outs", resolved), "outs");
  const walks = toRequiredInteger(getRetrosheetValue(row, "walks", resolved), "walks");
  const hits = toRequiredInteger(getRetrosheetValue(row, "hits", resolved), "hits");
  const runs = toRequiredInteger(getRetrosheetValue(row, "runs", resolved), "runs");
  const homeRuns = toRequiredInteger(getRetrosheetValue(row, "homeRuns", resolved), "homeRuns");
  const gameDate = parseRetrosheetDate(getRetrosheetValue(row, "gameDate", resolved));

  return {
    retrosheetGameId: getRequiredString(row, resolved, "gameId"),
    pitcherId: getRequiredString(row, resolved, "pitcherId"),
    teamId: getRequiredString(row, resolved, "teamId"),
    sourceKey: SOURCE_KEY,
    gameDate,
    season: toRequiredInteger(getRetrosheetValue(row, "season", resolved), "season"),
    isStarter: toBoolean(getRetrosheetValue(row, "isStarter", resolved)) ?? false,
    isHome: toBoolean(getRetrosheetValue(row, "isHome", resolved)),
    outs,
    strikeouts,
    walks,
    hits,
    runs,
    homeRuns,
    gameScore: mlbPitcherGameScore({ strikeouts, outs, walks, hits, runs, homeRuns }),
    rawJson: row
  };
}

function getCsvDirectory() {
  const dirArg = process.argv.find((arg) => arg.startsWith("--dir="));
  const csvDir = dirArg ? dirArg.slice("--dir=".length) : process.argv[2];
  if (!csvDir) {
    throw new Error("Usage: tsx scripts/ingest-retrosheet-csv.ts --dir=path\\to\\retrosheet-csv");
  }
  return path.resolve(csvDir);
}

function getRequiredString(row: Record<string, string>, resolved: Record<string, string>, logicalName: string) {
  const value = getRetrosheetValue(row, logicalName, resolved).trim();
  if (!value) {
    throw new Error(`Retrosheet CSV requires ${logicalName}`);
  }
  return value;
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function inferPostseason(value: string) {
  const bool = toBoolean(value);
  if (bool !== null) return bool;
  return ["post", "postseason", "playoff", "world series", "wild card", "division", "championship"]
    .some((token) => value.trim().toLowerCase().includes(token));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
