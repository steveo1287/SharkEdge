import fs from "node:fs";
import path from "node:path";

type Row = Record<string, unknown>;
type Kind = "team" | "player" | "history" | "rating";
type CsvRow = Record<string, string>;

type TeamAccumulator = {
  teamName: string;
  games: number;
  pointsFor: number;
  pointsAgainst: number;
  possessions: number;
  fga: number;
  fgm: number;
  fg3a: number;
  fg3m: number;
  fta: number;
  ftm: number;
  oreb: number;
  dreb: number;
  tov: number;
  plusMinus: number;
  recent: number[];
};

type PlayerAccumulator = {
  teamName: string;
  playerName: string;
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

const TEAM_BOX_CANDIDATES = ["TeamStatistics.csv", "teamstatistics.csv", "TeamStatistics.json", "teamstatistics.json", "team_box.json", "team_box.csv", "nba_team_box.json", "nba_team_box.csv", "hoopr_team_box.json", "hoopr_team_box.csv", "nba_api_team_advanced.json"];
const PLAYER_BOX_CANDIDATES = ["PlayerStatistics.csv", "playerstatistics.csv", "PlayerStatistics.json", "playerstatistics.json", "player_box.json", "player_box.csv", "nba_player_box.json", "nba_player_box.csv", "hoopr_player_box.json", "hoopr_player_box.csv", "nba_api_player_advanced.json"];
const SCHEDULE_CANDIDATES = ["Games.csv", "games.csv", "Games.json", "games.json", "LeagueSchedule25_26.csv", "LeagueSchedule24_25.csv", "LeagueSchedule23_24.csv", "schedule.json", "schedule.csv", "nba_schedule.json", "nba_schedule.csv", "hoopr_schedule.json", "hoopr_schedule.csv", "nba_api_games.json"];
const PBP_CANDIDATES = ["PlayByPlay.csv", "playbyplay.csv", "PlayByPlay.json", "playbyplay.json", "pbp.json", "pbp.csv", "play_by_play.json", "play_by_play.csv", "nba_pbp.json", "nba_pbp.csv", "pbpstats_possessions.json", "pbpstats_possessions.csv"];
const PBPSTATS_TEAM_CANDIDATES = ["pbpstats_team_enrichment.json", "pbpstats_team_enrichment.csv", "pbp_team_enrichment.json", "pbp_team_enrichment.csv"];

function argValue(name: string, fallback: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}
function argBool(name: string, fallback: boolean) {
  const value = argValue(name, fallback ? "true" : "false").toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

function exists(filePath: string) { return fs.existsSync(filePath); }
function normalizeKey(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, ""); }
function normalizeTeam(value: string) { return normalizeKey(value); }

function rowValue(row: Row, keys: string[]) {
  const lookup = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) lookup.set(normalizeKey(key), value);
  for (const key of keys) {
    const exact = row[key];
    if (exact !== undefined && exact !== null && exact !== "") return exact;
    const normalized = lookup.get(normalizeKey(key));
    if (normalized !== undefined && normalized !== null && normalized !== "") return normalized;
  }
  return undefined;
}

function text(row: Row, keys: string[], fallback = "") {
  const value = rowValue(row, keys);
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function num(row: Row, keys: string[], fallback = 0) {
  const value = rowValue(row, keys);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function safeDiv(numerator: number, denominator: number, fallback = 0) { return denominator ? numerator / denominator : fallback; }
function round(value: number, digits = 3) { return Number(value.toFixed(digits)); }

function readJsonRows(filePath: string): Row[] {
  const body = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (Array.isArray(body)) return body;
  if (Array.isArray(body.rows)) return body.rows;
  if (Array.isArray(body.data)) return body.data;
  if (Array.isArray(body.teams)) return body.teams;
  if (Array.isArray(body.players)) return body.players;
  if (Array.isArray(body.history)) return body.history;
  if (Array.isArray(body.ratings)) return body.ratings;
  return [];
}

function splitCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') { current += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { values.push(current); current = ""; }
    else current += char;
  }
  values.push(current);
  return values;
}

function parseCsv(text: string): CsvRow[] {
  const rows: CsvRow[] = [];
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return rows;
  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  for (const line of lines.slice(1)) {
    const values = splitCsvLine(line);
    const row: CsvRow = {};
    headers.forEach((header, index) => { row[header] = values[index] ?? ""; });
    rows.push(row);
  }
  return rows;
}

function readCsvRows(filePath: string): Row[] { return parseCsv(fs.readFileSync(filePath, "utf8")); }

function loadRows(inputDir: string, candidates: string[]) {
  for (const candidate of candidates) {
    const filePath = path.join(inputDir, candidate);
    if (!exists(filePath)) continue;
    const rows = candidate.toLowerCase().endsWith(".json") ? readJsonRows(filePath) : readCsvRows(filePath);
    return { filePath, rows };
  }
  return { filePath: null, rows: [] as Row[] };
}

function resolveTeamName(row: Row, fallback = "") {
  const full = text(row, ["teamNameFull", "fullTeamName", "teamFullName", "TEAM_FULL_NAME", "team_name_full", "team_name"]);
  if (full) return full;
  const city = text(row, ["teamCity", "TEAM_CITY", "team_city", "city"]);
  const nickname = text(row, ["teamName", "TEAM_NAME", "teamNickname", "nickname"]);
  if (city && nickname && normalizeTeam(city) !== normalizeTeam(nickname) && !normalizeTeam(nickname).includes(normalizeTeam(city))) return `${city} ${nickname}`;
  return text(row, ["teamName", "team", "TEAM", "name", "TEAM_NAME", "teamAbbreviation", "team_abbreviation", "TEAM_ABBREVIATION", "teamTricode", "TEAM_TRICODE", "teamId", "TEAM_ID"], fallback);
}

function resolvePlayerName(row: Row) {
  return text(row, ["playerName", "PLAYER_NAME", "player_name", "player", "athlete_display_name", "name", "personName", "PERSON_NAME"]);
}

function resolveGameId(row: Row) { return text(row, ["gameId", "GAME_ID", "game_id", "idGame", "Game_ID", "game"]); }
function teamPoints(row: Row) { return num(row, ["points", "pts", "PTS", "teamScore", "TEAM_SCORE", "score", "Score"]); }

function estimatePossessions(row: Row) {
  const fga = num(row, ["fga", "fieldGoalsAttempted", "FGA", "field_goals_attempted", "fieldGoalAttempts"]);
  const fta = num(row, ["fta", "freeThrowsAttempted", "FTA", "free_throws_attempted", "freeThrowAttempts"]);
  const oreb = num(row, ["oreb", "offensiveRebounds", "OREB", "offensive_rebounds", "reboundsOffensive"]);
  const tov = num(row, ["tov", "turnovers", "TOV"]);
  return fga + 0.44 * fta - oreb + tov;
}

function attachOpponentPoints(teamBoxRows: Row[]) {
  const byGame = new Map<string, Row[]>();
  for (const row of teamBoxRows) {
    const gameId = resolveGameId(row);
    if (!gameId) continue;
    byGame.set(gameId, [...(byGame.get(gameId) ?? []), row]);
  }
  for (const rows of byGame.values()) {
    if (rows.length !== 2) continue;
    const [first, second] = rows;
    first.__derivedOpponentPoints = teamPoints(second);
    second.__derivedOpponentPoints = teamPoints(first);
  }
  return teamBoxRows;
}

function pbpStatsByTeam(rows: Row[]) {
  const map = new Map<string, Row>();
  for (const row of rows) {
    const teamName = resolveTeamName(row);
    if (teamName) map.set(normalizeTeam(teamName), row);
  }
  return map;
}

function blendPbpStatsTeam(team: Row, pbp: Row | undefined) {
  if (!pbp) return team;
  const possessions = num(pbp, ["pbpPossessions", "possessions"]);
  const pbpPointsPer100 = num(pbp, ["pbpPointsPer100", "pointsPer100"]);
  const avgMargin = num(pbp, ["pbpAvgScoreMargin", "avgScoreMargin"]);
  const secondChance = num(pbp, ["pbpSecondChanceTimePerPossession", "secondChanceTimePerPossession"]);
  const orebPerPoss = num(pbp, ["pbpOffensiveReboundsPerPossession", "offensiveReboundsPerPossession"]);
  const eventsPerPoss = num(pbp, ["pbpEventsPerPossession", "eventsPerPossession"]);
  if (!possessions) return team;
  const offensiveRating = num(team, ["offensiveRating"], 113);
  const netRating = num(team, ["netRating"], 0);
  const pace = num(team, ["pace"], 99);
  return {
    ...team,
    offensiveRating: round(offensiveRating * 0.84 + pbpPointsPer100 * 0.16, 2),
    netRating: round(netRating * 0.78 + avgMargin * 0.22, 2),
    pace: round(pace * 0.92 + Math.max(92, Math.min(106, eventsPerPoss * 52)) * 0.08, 2),
    offensiveReboundRate: round(num(team, ["offensiveReboundRate"], 27) * 0.9 + orebPerPoss * 100 * 0.1, 2),
    halfCourt: round(num(team, ["halfCourt"], 0) + (pbpPointsPer100 - 113.2) * 0.08, 2),
    transition: round(num(team, ["transition"], 0) + secondChance * 0.5, 2),
    pbpPossessions: possessions,
    pbpPointsPer100,
    pbpAvgScoreMargin: avgMargin,
    pbpSecondChanceTimePerPossession: secondChance,
    pbpOffensiveReboundsPerPossession: orebPerPoss,
    __source: `${String(team.__source ?? "free-nba-warehouse")}+pbpstats`,
    __sourceLabel: `${String(team.__sourceLabel ?? "Free NBA warehouse team feed")} + PBP Stats enrichment`,
    __sourceTier: "advanced",
    __sourcePriority: 4,
    __sourceWeight: 1.06
  };
}

function buildTeamFeed(teamBoxRowsRaw: Row[], scheduleRows: Row[], pbpRows: Row[], pbpTeamRows: Row[]) {
  const teamBoxRows = attachOpponentPoints(teamBoxRowsRaw);
  const teams = new Map<string, TeamAccumulator>();
  const ensure = (teamName: string) => {
    const key = normalizeTeam(teamName);
    const current = teams.get(key) ?? { teamName, games: 0, pointsFor: 0, pointsAgainst: 0, possessions: 0, fga: 0, fgm: 0, fg3a: 0, fg3m: 0, fta: 0, ftm: 0, oreb: 0, dreb: 0, tov: 0, plusMinus: 0, recent: [] };
    teams.set(key, current);
    return current;
  };
  for (const row of teamBoxRows) {
    const teamName = resolveTeamName(row);
    if (!teamName) continue;
    const points = teamPoints(row);
    const opponentPoints = num(row, ["opponentPoints", "opp_pts", "pointsAllowed", "pts_allowed", "opponentScore", "OPP_PTS"], num(row, ["__derivedOpponentPoints"]));
    const item = ensure(teamName);
    item.games += 1;
    item.pointsFor += points;
    item.pointsAgainst += opponentPoints;
    item.possessions += num(row, ["possessions", "poss", "POSS"], estimatePossessions(row));
    item.fga += num(row, ["fga", "fieldGoalsAttempted", "FGA", "fieldGoalAttempts"]);
    item.fgm += num(row, ["fgm", "fieldGoalsMade", "FGM", "fieldGoals"]);
    item.fg3a += num(row, ["fg3a", "threePointersAttempted", "FG3A", "threePointAttempts"]);
    item.fg3m += num(row, ["fg3m", "threePointersMade", "FG3M", "threePointers"]);
    item.fta += num(row, ["fta", "freeThrowsAttempted", "FTA", "freeThrowAttempts"]);
    item.ftm += num(row, ["ftm", "freeThrowsMade", "FTM", "freeThrows"]);
    item.oreb += num(row, ["oreb", "offensiveRebounds", "OREB", "reboundsOffensive"]);
    item.dreb += num(row, ["dreb", "defensiveRebounds", "DREB", "reboundsDefensive"]);
    item.tov += num(row, ["tov", "turnovers", "TOV"]);
    item.plusMinus += num(row, ["plusMinus", "plus_minus", "PLUS_MINUS"], points - opponentPoints);
    item.recent.push(points - opponentPoints);
    item.recent = item.recent.slice(-10);
  }
  if (!teams.size && scheduleRows.length) {
    for (const row of scheduleRows) {
      const home = text(row, ["homeTeam", "home_team", "home_team_name", "HOME_TEAM_NAME", "homeTeamName", "HOME_TEAM", "home"]);
      const away = text(row, ["awayTeam", "away_team", "away_team_name", "AWAY_TEAM_NAME", "awayTeamName", "AWAY_TEAM", "away"]);
      if (home) ensure(home);
      if (away) ensure(away);
    }
  }
  const pbpByTeam = pbpStatsByTeam(pbpTeamRows);
  const rows = Array.from(teams.values()).map((team) => {
    const possessions = team.possessions || team.games * 100;
    const offensiveRating = safeDiv(team.pointsFor * 100, possessions, safeDiv(team.pointsFor, team.games, 112));
    const defensiveRating = safeDiv(team.pointsAgainst * 100, possessions, safeDiv(team.pointsAgainst, team.games, 112));
    const recentForm = team.recent.length ? team.recent.reduce((sum, value) => sum + value, 0) / team.recent.length : 0;
    return blendPbpStatsTeam({
      teamName: team.teamName,
      games: team.games,
      offensiveRating: round(offensiveRating, 2),
      defensiveRating: round(defensiveRating, 2),
      netRating: round(offensiveRating - defensiveRating, 2),
      trueShooting: round(safeDiv(team.pointsFor, 2 * (team.fga + 0.44 * team.fta), 0.56) * 100, 2),
      effectiveFg: round(safeDiv(team.fgm + 0.5 * team.fg3m, team.fga, 0.52) * 100, 2),
      threePointRate: round(safeDiv(team.fg3a, team.fga, 0.37) * 100, 2),
      threePointAccuracy: round(safeDiv(team.fg3m, team.fg3a, 0.35) * 100, 2),
      freeThrowRate: round(safeDiv(team.fta, team.fga, 0.22) * 100, 2),
      turnoverRate: round(safeDiv(team.tov, possessions, 0.13) * 100, 2),
      offensiveReboundRate: round(safeDiv(team.oreb, team.oreb + team.dreb, 0.27) * 100, 2),
      defensiveReboundRate: round(safeDiv(team.dreb, team.oreb + team.dreb, 0.73) * 100, 2),
      pace: round(safeDiv(possessions, team.games, 99), 2),
      recentForm: round(recentForm, 2),
      halfCourt: round((offensiveRating - 113.2) * 0.6, 2),
      transition: round((safeDiv(team.pointsFor, team.games, 112) - 112) * 0.18, 2),
      clutch: round(safeDiv(team.plusMinus, Math.max(1, team.games)) * 0.12, 2),
      rest: 0,
      travel: 0,
      homeAdvantage: 2.1,
      injuryDrag: 0,
      __source: "kaggle-eoinamoore+free-nba-warehouse",
      __sourceLabel: "Kaggle NBA Database / free NBA warehouse team feed",
      __sourceTier: "historical",
      __sourcePriority: 5,
      __sourceWeight: 1,
      __license: "public-or-self-hosted"
    }, pbpByTeam.get(normalizeTeam(team.teamName)));
  });
  if (!rows.length && pbpRows.length) return buildTeamFeedFromPbp(pbpRows);
  return rows;
}

function buildTeamFeedFromPbp(pbpRows: Row[]) {
  const teams = new Map<string, { teamName: string; events: number; scoreDelta: number }>();
  for (const row of pbpRows) {
    const teamName = resolveTeamName(row);
    if (!teamName) continue;
    const item = teams.get(normalizeTeam(teamName)) ?? { teamName, events: 0, scoreDelta: 0 };
    item.events += 1;
    item.scoreDelta += num(row, ["scoreValue", "points", "pts"], 0);
    teams.set(normalizeTeam(teamName), item);
  }
  return Array.from(teams.values()).map((team) => ({ teamName: team.teamName, offensiveRating: round(112 + team.scoreDelta / Math.max(1, team.events) * 100, 2), defensiveRating: 112, netRating: round(team.scoreDelta / Math.max(1, team.events) * 100, 2), pace: 99, recentForm: 0, __source: "pbpstats-free-warehouse", __sourceLabel: "Free NBA warehouse PBP fallback team feed", __sourceTier: "historical", __sourcePriority: 8, __sourceWeight: 0.82, __license: "public-or-self-hosted" }));
}

function buildPlayerFeed(playerBoxRows: Row[]) {
  const players = new Map<string, PlayerAccumulator>();
  const ensure = (teamName: string, playerName: string) => {
    const key = `${normalizeTeam(teamName)}:${normalizeTeam(playerName)}`;
    const current = players.get(key) ?? { teamName, playerName, games: 0, minutes: 0, points: 0, assists: 0, rebounds: 0, steals: 0, blocks: 0, turnovers: 0, fga: 0, fg3a: 0, fta: 0, plusMinus: 0 };
    players.set(key, current);
    return current;
  };
  for (const row of playerBoxRows) {
    const teamName = resolveTeamName(row);
    const playerName = resolvePlayerName(row);
    if (!teamName || !playerName) continue;
    const item = ensure(teamName, playerName);
    item.games += 1; item.minutes += num(row, ["minutes", "min", "MIN", "minutesCalculated", "minutes_played"]); item.points += num(row, ["points", "pts", "PTS"]); item.assists += num(row, ["assists", "ast", "AST"]); item.rebounds += num(row, ["rebounds", "reb", "REB"]); item.steals += num(row, ["steals", "stl", "STL"]); item.blocks += num(row, ["blocks", "blk", "BLK"]); item.turnovers += num(row, ["turnovers", "tov", "TOV"]); item.fga += num(row, ["fga", "fieldGoalsAttempted", "FGA", "fieldGoalAttempts"]); item.fg3a += num(row, ["fg3a", "threePointersAttempted", "FG3A", "threePointAttempts"]); item.fta += num(row, ["fta", "freeThrowsAttempted", "FTA", "freeThrowAttempts"]); item.plusMinus += num(row, ["plusMinus", "plus_minus", "PLUS_MINUS"]);
  }
  return Array.from(players.values()).map((player) => {
    const minutes = Math.max(1, player.minutes);
    const per36 = 36 / minutes;
    const usage = safeDiv(player.fga + 0.44 * player.fta + player.turnovers, minutes, 0.2) * 36;
    const impactRating = player.plusMinus / Math.max(1, player.games);
    return { teamName: player.teamName, playerName: player.playerName, games: player.games, minutes: round(player.minutes / Math.max(1, player.games), 2), impactRating: round(impactRating, 2), usageCreation: round(usage * 0.18 + player.assists * per36 * 0.25, 2), onOffImpact: round(impactRating, 2), spacing: round(player.fg3a * per36 * 0.18, 2), playmaking: round(player.assists * per36 * 0.22, 2), rimPressure: round((player.fta * per36) * 0.18, 2), rebounding: round(player.rebounds * per36 * 0.14, 2), perimeterDefense: round(player.steals * per36 * 0.65, 2), rimProtection: round(player.blocks * per36 * 0.7, 2), depthPower: round(Math.min(4, player.minutes / Math.max(1, player.games) / 8), 2), injuryPenalty: 0, fatigue: 0, volatility: 1.1, __source: "kaggle-eoinamoore+free-nba-warehouse", __sourceLabel: "Kaggle NBA Database / free NBA warehouse player feed", __sourceTier: "historical", __sourcePriority: 5, __sourceWeight: 1, __license: "public-or-self-hosted" };
  });
}

function buildHistoryFeed(scheduleRows: Row[], teamRows: Row[], pbpTeamRows: Row[]) {
  const teamForm = new Map<string, number[]>();
  for (const row of scheduleRows) {
    const home = text(row, ["homeTeam", "home_team", "home_team_name", "HOME_TEAM_NAME", "homeTeamName", "home", "HOME"]);
    const away = text(row, ["awayTeam", "away_team", "away_team_name", "AWAY_TEAM_NAME", "awayTeamName", "away", "AWAY"]);
    const homeScore = num(row, ["homeScore", "home_score", "home_pts", "HOME_PTS", "homeTeamScore", "HOME_TEAM_SCORE", "homePoints"]);
    const awayScore = num(row, ["awayScore", "away_score", "away_pts", "AWAY_PTS", "awayTeamScore", "AWAY_TEAM_SCORE", "awayPoints"]);
    if (home && away && (homeScore || awayScore)) {
      teamForm.set(normalizeTeam(home), [...(teamForm.get(normalizeTeam(home)) ?? []), homeScore - awayScore].slice(-20));
      teamForm.set(normalizeTeam(away), [...(teamForm.get(normalizeTeam(away)) ?? []), awayScore - homeScore].slice(-20));
    }
  }
  const pbpByTeam = pbpStatsByTeam(pbpTeamRows);
  const teams = new Set<string>();
  for (const row of teamRows) { const name = text(row, ["teamName", "team"]); if (name) teams.add(name); }
  for (const row of scheduleRows) { const home = text(row, ["homeTeam", "home_team", "home_team_name", "HOME_TEAM_NAME", "homeTeamName", "home", "HOME"]); const away = text(row, ["awayTeam", "away_team", "away_team_name", "AWAY_TEAM_NAME", "awayTeamName", "away", "AWAY"]); if (home) teams.add(home); if (away) teams.add(away); }
  return Array.from(teams).map((teamName) => {
    const form = teamForm.get(normalizeTeam(teamName)) ?? [];
    const teamRow = teamRows.find((row) => normalizeTeam(text(row, ["teamName", "team"])) === normalizeTeam(teamName)) ?? {};
    const pbp = pbpByTeam.get(normalizeTeam(teamName));
    const recent = form.length ? form.reduce((sum, value) => sum + value, 0) / form.length : num(teamRow, ["recentForm"], 0);
    const pbpMargin = pbp ? num(pbp, ["pbpAvgScoreMargin", "avgScoreMargin"], 0) : 0;
    const pbpPpp = pbp ? num(pbp, ["pbpPointsPerPossession", "pointsPerPossession"], 0) : 0;
    return { teamName, headToHeadEdge: 0, recentOffense: round(recent * 0.35 + (pbpPpp - 1.13) * 14, 2), recentDefense: round(recent * 0.25 + pbpMargin * 0.08, 2), recentShooting: 0, recentTurnovers: 0, recentRebounding: round(pbp ? num(pbp, ["pbpOffensiveReboundsPerPossession"], 0) * 10 : 0, 2), starMatchup: 0, benchTrend: 0, restHistory: 0, clutchRecent: round(recent * 0.1 + pbpMargin * 0.04, 2), sample: form.length || num(teamRow, ["games"], 0), pbpPossessions: pbp ? num(pbp, ["pbpPossessions"], 0) : 0, __source: pbp ? "kaggle-eoinamoore+pbpstats+free-nba-warehouse" : "kaggle-eoinamoore+free-nba-warehouse", __sourceLabel: pbp ? "Kaggle NBA Database + PBP Stats history feed" : "Kaggle NBA Database / free NBA warehouse history feed", __sourceTier: pbp ? "advanced" : "historical", __sourcePriority: pbp ? 4 : 5, __sourceWeight: pbp ? 1.04 : 0.95, __license: "public-or-self-hosted" };
  });
}

function buildRatingFeed(teamFeed: Row[], playerFeed: Row[]) {
  const playerByTeam = new Map<string, Row[]>();
  for (const row of playerFeed) { const teamName = text(row, ["teamName", "team"]); if (!teamName) continue; const key = normalizeTeam(teamName); playerByTeam.set(key, [...(playerByTeam.get(key) ?? []), row]); }
  return teamFeed.map((team) => {
    const teamName = text(team, ["teamName", "team"]);
    const players = playerByTeam.get(normalizeTeam(teamName)) ?? [];
    const net = num(team, ["netRating"], 0);
    const offense = 75 + (num(team, ["offensiveRating"], 113) - 105) * 1.2;
    const defense = 75 + (118 - num(team, ["defensiveRating"], 113)) * 1.2;
    const depth = 70 + Math.min(20, players.length * 1.2);
    return { teamName, overall: round(78 + net * 1.4, 2), offense: round(offense, 2), defense: round(defense, 2), shooting: round(70 + (num(team, ["threePointAccuracy"], 35) - 32) * 2, 2), playmaking: round(74 + Math.max(-8, Math.min(8, net)), 2), athleticism: 78, rebounding: round(70 + (num(team, ["offensiveReboundRate"], 27) - 24) + (num(team, ["defensiveReboundRate"], 73) - 70), 2), depth: round(depth, 2), clutch: round(75 + num(team, ["clutch"], 0), 2), health: 92, __source: "kaggle-eoinamoore+free-nba-warehouse-derived-ratings", __sourceLabel: "Kaggle NBA Database / derived rating feed", __sourceTier: "fallback", __sourcePriority: 50, __sourceWeight: 0.82, __license: "public-or-self-hosted" };
  });
}

function writeFeed(outDir: string, kind: Kind, rows: Row[]) {
  const file = path.join(outDir, `${kind}-feed.json`);
  fs.writeFileSync(file, JSON.stringify({ kind, generatedAt: new Date().toISOString(), rows }, null, 2));
  return file;
}

function main() {
  const inputDir = path.resolve(argValue("input", path.join("data", "nba", "raw")));
  const outDir = path.resolve(argValue("out", path.join("data", "nba", "warehouse")));
  const includePbp = argBool("include-pbp", false);
  fs.mkdirSync(outDir, { recursive: true });
  const schedule = loadRows(inputDir, SCHEDULE_CANDIDATES);
  const teamBox = loadRows(inputDir, TEAM_BOX_CANDIDATES);
  const playerBox = loadRows(inputDir, PLAYER_BOX_CANDIDATES);
  const pbp = includePbp ? loadRows(inputDir, PBP_CANDIDATES) : { filePath: null, rows: [] as Row[] };
  const pbpTeam = includePbp ? loadRows(inputDir, PBPSTATS_TEAM_CANDIDATES) : { filePath: null, rows: [] as Row[] };
  const teamFeed = buildTeamFeed(teamBox.rows, schedule.rows, pbp.rows, pbpTeam.rows);
  const playerFeed = buildPlayerFeed(playerBox.rows);
  const historyFeed = buildHistoryFeed(schedule.rows, teamFeed, pbpTeam.rows);
  const ratingFeed = buildRatingFeed(teamFeed, playerFeed);
  const written = { team: writeFeed(outDir, "team", teamFeed), player: writeFeed(outDir, "player", playerFeed), history: writeFeed(outDir, "history", historyFeed), rating: writeFeed(outDir, "rating", ratingFeed) };
  console.log(JSON.stringify({ ok: true, inputDir, outDir, includePbp, sources: { schedule: { file: schedule.filePath, rows: schedule.rows.length }, teamBox: { file: teamBox.filePath, rows: teamBox.rows.length }, playerBox: { file: playerBox.filePath, rows: playerBox.rows.length }, pbp: { file: pbp.filePath, rows: pbp.rows.length }, pbpTeam: { file: pbpTeam.filePath, rows: pbpTeam.rows.length } }, outputRows: { team: teamFeed.length, player: playerFeed.length, history: historyFeed.length, rating: ratingFeed.length }, written }, null, 2));
}

main();
