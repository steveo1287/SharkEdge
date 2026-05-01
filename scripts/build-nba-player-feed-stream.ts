import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

type Row = Record<string, string>;

type PlayerAccumulator = {
  teamName: string;
  teamAbbreviation: string;
  playerName: string;
  playerId: string;
  games: number;
  minutes: number;
  points: number;
  assists: number;
  rebounds: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fga: number;
  fg3a: number;
  fta: number;
  plusMinus: number;
};

const NBA_ABBR_TO_NAME: Record<string, string> = {
  ATL: "Atlanta Hawks",
  BOS: "Boston Celtics",
  BKN: "Brooklyn Nets",
  BRK: "Brooklyn Nets",
  CHA: "Charlotte Hornets",
  CHH: "Charlotte Hornets",
  CHO: "Charlotte Hornets",
  CHI: "Chicago Bulls",
  CLE: "Cleveland Cavaliers",
  DAL: "Dallas Mavericks",
  DEN: "Denver Nuggets",
  DET: "Detroit Pistons",
  GSW: "Golden State Warriors",
  HOU: "Houston Rockets",
  IND: "Indiana Pacers",
  LAC: "LA Clippers",
  LAL: "Los Angeles Lakers",
  MEM: "Memphis Grizzlies",
  MIA: "Miami Heat",
  MIL: "Milwaukee Bucks",
  MIN: "Minnesota Timberwolves",
  NOP: "New Orleans Pelicans",
  NOH: "New Orleans Pelicans",
  NOK: "New Orleans Pelicans",
  NYK: "New York Knicks",
  OKC: "Oklahoma City Thunder",
  ORL: "Orlando Magic",
  PHI: "Philadelphia 76ers",
  PHX: "Phoenix Suns",
  PHO: "Phoenix Suns",
  POR: "Portland Trail Blazers",
  SAC: "Sacramento Kings",
  SAS: "San Antonio Spurs",
  SEA: "Seattle SuperSonics",
  TOR: "Toronto Raptors",
  UTA: "Utah Jazz",
  WAS: "Washington Wizards",
  WSB: "Washington Wizards"
};

function argValue(name: string, fallback: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function splitCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function rowFromValues(headers: string[], values: string[]) {
  const row: Row = {};
  headers.forEach((header, index) => { row[header] = values[index] ?? ""; });
  return row;
}

function value(row: Row, keys: string[]) {
  const lookup = new Map<string, string>();
  for (const [key, item] of Object.entries(row)) lookup.set(normalizeKey(key), item);
  for (const key of keys) {
    const exact = row[key];
    if (exact !== undefined && exact !== null && String(exact).trim()) return String(exact).trim();
    const normalized = lookup.get(normalizeKey(key));
    if (normalized !== undefined && normalized !== null && String(normalized).trim()) return String(normalized).trim();
  }
  return "";
}

function num(row: Row, keys: string[], fallback = 0) {
  const raw = value(row, keys);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(item: number, digits = 3) {
  return Number(item.toFixed(digits));
}

function safeDiv(numerator: number, denominator: number, fallback = 0) {
  return denominator ? numerator / denominator : fallback;
}

function teamNameFromRaw(rawTeam: string, abbreviation: string) {
  const raw = rawTeam.trim();
  const abbr = abbreviation.trim().toUpperCase();
  if (raw && raw.length > 3 && !NBA_ABBR_TO_NAME[raw.toUpperCase()]) return raw;
  if (NBA_ABBR_TO_NAME[abbr]) return NBA_ABBR_TO_NAME[abbr];
  if (NBA_ABBR_TO_NAME[raw.toUpperCase()]) return NBA_ABBR_TO_NAME[raw.toUpperCase()];
  return raw || abbr;
}

function resolveTeam(row: Row) {
  const abbreviation = value(row, ["teamAbbreviation", "team_abbreviation", "TEAM_ABBREVIATION", "teamTricode", "TEAM_TRICODE", "team", "TEAM", "teamSlug", "team_slug"]);
  const full = value(row, ["teamNameFull", "fullTeamName", "teamFullName", "TEAM_FULL_NAME", "team_name_full"]);
  const city = value(row, ["teamCity", "TEAM_CITY", "team_city", "city"]);
  const nickname = value(row, ["teamName", "TEAM_NAME", "teamNickname", "nickname"]);
  if (full) return { teamName: teamNameFromRaw(full, abbreviation), teamAbbreviation: abbreviation.toUpperCase() };
  if (city && nickname && normalizeKey(city) !== normalizeKey(nickname) && !normalizeKey(nickname).includes(normalizeKey(city))) {
    return { teamName: `${city} ${nickname}`, teamAbbreviation: abbreviation.toUpperCase() };
  }
  const raw = value(row, ["teamName", "team", "TEAM", "nameTeam", "TEAM_NAME", "teamId", "TEAM_ID"]);
  return { teamName: teamNameFromRaw(raw, abbreviation), teamAbbreviation: abbreviation.toUpperCase() };
}

function resolvePlayerName(row: Row) {
  return value(row, ["playerName", "PLAYER_NAME", "player_name", "player", "namePlayer", "athlete_display_name", "name", "personName", "PERSON_NAME"]);
}

function resolvePlayerId(row: Row) {
  return value(row, ["playerId", "PLAYER_ID", "personId", "PERSON_ID", "athlete_id"]);
}

function minutes(row: Row) {
  const minuteValue = num(row, ["minutes", "min", "MIN", "minutesCalculated", "minutes_played", "numMinutes"], NaN);
  if (Number.isFinite(minuteValue)) return minuteValue;
  const seconds = num(row, ["seconds", "secondsPlayed", "SECONDS", "timePlayedSeconds"], 0);
  return seconds ? seconds / 60 : 0;
}

function points(row: Row) { return num(row, ["points", "pts", "PTS", "numPoints"]); }
function assists(row: Row) { return num(row, ["assists", "ast", "AST", "numAssists"]); }
function rebounds(row: Row) {
  const total = num(row, ["rebounds", "reb", "REB", "reboundsTotal", "totalRebounds", "numRebounds"], NaN);
  if (Number.isFinite(total)) return total;
  return num(row, ["reboundsDefensive", "defensiveRebounds", "DREB", "numDefensiveRebounds"]) + num(row, ["reboundsOffensive", "offensiveRebounds", "OREB", "numOffensiveRebounds"]);
}

async function buildPlayerFeed(inputFile: string, outDir: string) {
  if (!fs.existsSync(inputFile)) throw new Error(`Missing player source file: ${inputFile}`);

  const stream = fs.createReadStream(inputFile, { encoding: "utf8" });
  const reader = readline.createInterface({ input: stream, crlfDelay: Infinity });
  const players = new Map<string, PlayerAccumulator>();
  let headers: string[] | null = null;
  let scannedRows = 0;
  let usedRows = 0;
  let missingTeamRows = 0;
  let missingPlayerRows = 0;

  for await (const line of reader) {
    if (!line.trim()) continue;
    if (!headers) {
      headers = splitCsvLine(line).map((header) => header.trim().replace(/^\uFEFF/, ""));
      console.log(JSON.stringify({ stage: "player-feed-stream:headers", inputFile, headerCount: headers.length, headers }, null, 2));
      continue;
    }
    scannedRows += 1;
    const row = rowFromValues(headers, splitCsvLine(line));
    const { teamName, teamAbbreviation } = resolveTeam(row);
    const playerName = resolvePlayerName(row);
    if (!teamName) {
      missingTeamRows += 1;
      continue;
    }
    if (!playerName) {
      missingPlayerRows += 1;
      continue;
    }
    usedRows += 1;
    const playerId = resolvePlayerId(row);
    const key = `${normalizeKey(teamName)}:${playerId || normalizeKey(playerName)}`;
    const acc = players.get(key) ?? {
      teamName,
      teamAbbreviation,
      playerName,
      playerId,
      games: 0,
      minutes: 0,
      points: 0,
      assists: 0,
      rebounds: 0,
      steals: 0,
      blocks: 0,
      turnovers: 0,
      fga: 0,
      fg3a: 0,
      fta: 0,
      plusMinus: 0
    };
    acc.games += 1;
    acc.minutes += minutes(row);
    acc.points += points(row);
    acc.assists += assists(row);
    acc.rebounds += rebounds(row);
    acc.steals += num(row, ["steals", "stl", "STL", "numSteals"]);
    acc.blocks += num(row, ["blocks", "blk", "BLK", "numBlocks"]);
    acc.turnovers += num(row, ["turnovers", "tov", "TOV", "numTurnovers"]);
    acc.fga += num(row, ["fga", "fieldGoalsAttempted", "FGA", "fieldGoalAttempts", "numFieldGoalsAttempted"]);
    acc.fg3a += num(row, ["fg3a", "threePointersAttempted", "FG3A", "threePointAttempts", "numThreePointersAttempted"]);
    acc.fta += num(row, ["fta", "freeThrowsAttempted", "FTA", "freeThrowAttempts", "numFreeThrowsAttempted"]);
    acc.plusMinus += num(row, ["plusMinus", "plus_minus", "PLUS_MINUS", "plusMinusPoints"]);
    players.set(key, acc);
  }

  const rows = Array.from(players.values()).map((player) => {
    const totalMinutes = Math.max(1, player.minutes);
    const games = Math.max(1, player.games);
    const per36 = 36 / totalMinutes;
    const impactRating = player.plusMinus / games;
    const usage = safeDiv(player.fga + 0.44 * player.fta + player.turnovers, totalMinutes, 0.18) * 36;
    return {
      teamName: player.teamName,
      teamAbbreviation: player.teamAbbreviation,
      playerId: player.playerId,
      playerName: player.playerName,
      games: player.games,
      minutes: round(player.minutes / games, 2),
      impactRating: round(impactRating, 2),
      usageCreation: round(usage * 0.18 + player.assists * per36 * 0.25, 2),
      onOffImpact: round(impactRating, 2),
      spacing: round(player.fg3a * per36 * 0.18, 2),
      playmaking: round(player.assists * per36 * 0.22, 2),
      rimPressure: round(player.fta * per36 * 0.18, 2),
      rebounding: round(player.rebounds * per36 * 0.14, 2),
      perimeterDefense: round(player.steals * per36 * 0.65, 2),
      rimProtection: round(player.blocks * per36 * 0.7, 2),
      depthPower: round(Math.min(4, player.minutes / games / 8), 2),
      injuryPenalty: 0,
      fatigue: 0,
      volatility: 1.1,
      __source: "kaggle-eoinamoore-playerstatistics-stream",
      __sourceLabel: "Kaggle NBA PlayerStatistics streaming player feed",
      __sourceTier: "historical",
      __sourcePriority: 5,
      __sourceWeight: 1,
      __license: "CC0-1.0"
    };
  }).filter((row) => row.teamName && row.playerName);

  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "player-feed.json");
  fs.writeFileSync(outFile, JSON.stringify({ kind: "player", generatedAt: new Date().toISOString(), rows }, null, 2));
  return { scannedRows, usedRows, missingTeamRows, missingPlayerRows, outputRows: rows.length, outFile };
}

async function main() {
  const input = path.resolve(argValue("input", path.join("data", "nba", "raw", "PlayerStatistics.csv")));
  const outDir = path.resolve(argValue("out", path.join("data", "nba", "warehouse")));
  const result = await buildPlayerFeed(input, outDir);
  console.log(JSON.stringify({ ok: result.outputRows > 0, source: input, ...result }, null, 2));
  if (!result.outputRows) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
