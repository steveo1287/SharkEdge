import fs from "node:fs";
import path from "node:path";

type Row = Record<string, unknown>;

type FeedBody = {
  kind?: string;
  generatedAt?: string;
  rows?: Row[];
};

function argValue(name: string, fallback: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function readRows(filePath: string): Row[] {
  if (!fs.existsSync(filePath)) return [];
  const body = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (Array.isArray(body)) return body;
  if (Array.isArray(body.rows)) return body.rows;
  if (Array.isArray(body.data)) return body.data;
  return [];
}

function writeFeed(outDir: string, kind: "team" | "player" | "history" | "rating", rows: Row[]) {
  const filePath = path.join(outDir, `${kind}-feed.json`);
  const previous = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) as FeedBody : {};
  fs.writeFileSync(filePath, JSON.stringify({
    ...previous,
    kind,
    generatedAt: new Date().toISOString(),
    rows
  }, null, 2));
}

function num(row: Row, keys: string[], fallback = 0) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return fallback;
}

function text(row: Row, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return fallback;
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function teamDisplayName(row: Row) {
  return text(row, ["TEAM_NAME", "teamName", "TEAM_ABBREVIATION", "teamAbbreviation"]);
}

function normalizeTeamRows(rows: Row[], existingTeamRows: Row[]) {
  const existingByName = new Map(existingTeamRows.map((row) => [normalizeKey(text(row, ["teamName", "team"])), row]));
  return rows.map((row) => {
    const name = teamDisplayName(row);
    const existing = existingByName.get(normalizeKey(name));
    const offensiveRating = num(row, ["E_OFF_RATING", "OFF_RATING", "offensiveRating"], 113.2);
    const defensiveRating = num(row, ["E_DEF_RATING", "DEF_RATING", "defensiveRating"], 113.2);
    const netRating = num(row, ["E_NET_RATING", "NET_RATING", "netRating"], offensiveRating - defensiveRating);
    const trueShooting = num(row, ["TS_PCT", "trueShooting"], 0.57);
    const effectiveFg = num(row, ["EFG_PCT", "effectiveFg"], 0.54);
    const threePointAccuracy = num(row, ["FG3_PCT", "threePointAccuracy"], 0.36);
    const threePointRate = num(row, ["FG3A_RATE", "threePointRate"], 0.38);
    const freeThrowRate = num(row, ["FTA_RATE", "freeThrowRate"], 0.22);
    const turnoverRate = num(row, ["TM_TOV_PCT", "TOV_PCT", "turnoverRate"], 13);
    const offensiveReboundRate = num(row, ["OREB_PCT", "offensiveReboundRate"], 0.27);
    const defensiveReboundRate = num(row, ["DREB_PCT", "defensiveReboundRate"], 0.73);
    return {
      ...(existing ?? {}),
      teamName: name,
      teamId: text(row, ["TEAM_ID", "teamId"]),
      teamAbbreviation: text(row, ["TEAM_ABBREVIATION", "teamAbbreviation"]),
      games: num(row, ["GP", "games"], num(existing ?? {}, ["games"], 0)),
      wins: num(row, ["W", "wins"], num(existing ?? {}, ["wins"], 0)),
      losses: num(row, ["L", "losses"], num(existing ?? {}, ["losses"], 0)),
      offensiveRating: round(offensiveRating, 2),
      defensiveRating: round(defensiveRating, 2),
      netRating: round(netRating, 2),
      trueShooting: round(trueShooting <= 1 ? trueShooting * 100 : trueShooting, 2),
      effectiveFg: round(effectiveFg <= 1 ? effectiveFg * 100 : effectiveFg, 2),
      threePointRate: round(threePointRate <= 1 ? threePointRate * 100 : threePointRate, 2),
      threePointAccuracy: round(threePointAccuracy <= 1 ? threePointAccuracy * 100 : threePointAccuracy, 2),
      freeThrowRate: round(freeThrowRate <= 1 ? freeThrowRate * 100 : freeThrowRate, 2),
      turnoverRate: round(turnoverRate, 2),
      offensiveReboundRate: round(offensiveReboundRate <= 1 ? offensiveReboundRate * 100 : offensiveReboundRate, 2),
      defensiveReboundRate: round(defensiveReboundRate <= 1 ? defensiveReboundRate * 100 : defensiveReboundRate, 2),
      pace: round(num(row, ["PACE", "pace"], num(existing ?? {}, ["pace"], 99)), 2),
      recentForm: round(netRating * 0.35, 2),
      halfCourt: round((offensiveRating - 113.2) * 0.6, 2),
      transition: num(existing ?? {}, ["transition"], 0),
      clutch: round(netRating * 0.12, 2),
      rest: 0,
      travel: 0,
      homeAdvantage: num(existing ?? {}, ["homeAdvantage"], 2.1),
      injuryDrag: 0,
      __source: `${String(existing?.__source ?? "free-nba-warehouse")}+nba_api-current`,
      __sourceLabel: `${String(existing?.__sourceLabel ?? "Free NBA warehouse")} + nba_api current advanced team feed`,
      __sourceTier: "current",
      __sourcePriority: 1,
      __sourceWeight: 1.08,
      __license: "public-or-self-hosted"
    };
  }).filter((row) => row.teamName);
}

function normalizePlayerRows(rows: Row[], teamRows: Row[]) {
  const teamById = new Map(teamRows.map((team) => [String(team.teamId ?? ""), String(team.teamName ?? "")]));
  const teamByAbbr = new Map(teamRows.map((team) => [String(team.teamAbbreviation ?? ""), String(team.teamName ?? "")]));
  return rows.map((row) => {
    const teamId = text(row, ["TEAM_ID", "teamId"]);
    const teamAbbr = text(row, ["TEAM_ABBREVIATION", "teamAbbreviation"]);
    const teamName = teamById.get(teamId) || teamByAbbr.get(teamAbbr) || text(row, ["TEAM_NAME", "teamName", "TEAM_ABBREVIATION"]);
    const minutes = num(row, ["MIN", "minutes"], 0);
    const plusMinus = num(row, ["PLUS_MINUS", "plusMinus"], 0);
    const pie = num(row, ["PIE", "pie"], 0) * 100;
    const usage = num(row, ["USG_PCT", "usage"], 0) * 100;
    const assistPct = num(row, ["AST_PCT", "assistPct"], 0) * 100;
    const reboundPct = num(row, ["REB_PCT", "reboundPct"], 0) * 100;
    const offensiveRating = num(row, ["E_OFF_RATING", "OFF_RATING"], 113.2);
    const defensiveRating = num(row, ["E_DEF_RATING", "DEF_RATING"], 113.2);
    const netRating = num(row, ["E_NET_RATING", "NET_RATING"], offensiveRating - defensiveRating);
    return {
      teamName,
      teamId,
      teamAbbreviation: teamAbbr,
      playerId: text(row, ["PLAYER_ID", "playerId"]),
      playerName: text(row, ["PLAYER_NAME", "playerName"]),
      games: num(row, ["GP", "games"], 0),
      minutes: round(minutes, 2),
      impactRating: round(netRating * 0.35 + pie * 0.18 + plusMinus * 0.08, 2),
      usageCreation: round(usage * 0.12 + assistPct * 0.08, 2),
      onOffImpact: round(netRating * 0.28 + plusMinus * 0.08, 2),
      spacing: round(num(row, ["EFG_PCT"], 0) * 6, 2),
      playmaking: round(assistPct * 0.12, 2),
      rimPressure: round(num(row, ["FTA_RATE"], 0) * 12, 2),
      rebounding: round(reboundPct * 0.1, 2),
      perimeterDefense: round(Math.max(0, 113.2 - defensiveRating) * 0.18, 2),
      rimProtection: 0,
      depthPower: round(Math.min(4, minutes / 8), 2),
      injuryPenalty: 0,
      fatigue: 0,
      volatility: 1.1,
      __source: "nba_api-current-player-advanced",
      __sourceLabel: "nba_api current player advanced feed",
      __sourceTier: "current",
      __sourcePriority: 1,
      __sourceWeight: 1.08,
      __license: "public-or-self-hosted"
    };
  }).filter((row) => row.teamName && row.playerName);
}

function buildHistoryRows(teamRows: Row[]) {
  return teamRows.map((team) => {
    const net = num(team, ["netRating"], 0);
    return {
      teamName: team.teamName,
      headToHeadEdge: 0,
      recentOffense: round(net * 0.3, 2),
      recentDefense: round(net * 0.22, 2),
      recentShooting: round((num(team, ["trueShooting"], 57) - 57) * 0.2, 2),
      recentTurnovers: round((13 - num(team, ["turnoverRate"], 13)) * 0.12, 2),
      recentRebounding: round((num(team, ["offensiveReboundRate"], 27) - 27) * 0.08, 2),
      starMatchup: 0,
      benchTrend: 0,
      restHistory: 0,
      clutchRecent: round(net * 0.08, 2),
      sample: num(team, ["games"], 0),
      __source: "nba_api-current-derived-history",
      __sourceLabel: "nba_api current derived history feed",
      __sourceTier: "current",
      __sourcePriority: 2,
      __sourceWeight: 0.96,
      __license: "public-or-self-hosted"
    };
  });
}

function buildRatingRows(teamRows: Row[], playerRows: Row[]) {
  const playersByTeam = new Map<string, number>();
  for (const player of playerRows) {
    const key = String(player.teamName ?? "");
    playersByTeam.set(key, (playersByTeam.get(key) ?? 0) + 1);
  }
  return teamRows.map((team) => {
    const net = num(team, ["netRating"], 0);
    return {
      teamName: team.teamName,
      overall: round(78 + net * 1.25, 2),
      offense: round(75 + (num(team, ["offensiveRating"], 113) - 105) * 1.12, 2),
      defense: round(75 + (118 - num(team, ["defensiveRating"], 113)) * 1.12, 2),
      shooting: round(70 + (num(team, ["threePointAccuracy"], 35) - 32) * 1.9, 2),
      playmaking: round(74 + Math.max(-8, Math.min(8, net)), 2),
      rebounding: round(70 + (num(team, ["offensiveReboundRate"], 27) - 24) + (num(team, ["defensiveReboundRate"], 73) - 70), 2),
      depth: round(70 + Math.min(20, (playersByTeam.get(String(team.teamName ?? "")) ?? 0) * 1.2), 2),
      clutch: round(75 + num(team, ["clutch"], 0), 2),
      health: 92,
      __source: "nba_api-current-derived-rating",
      __sourceLabel: "nba_api current derived rating feed",
      __sourceTier: "current",
      __sourcePriority: 2,
      __sourceWeight: 0.9,
      __license: "public-or-self-hosted"
    };
  });
}

function main() {
  const rawDir = path.resolve(argValue("raw", path.join("data", "nba", "raw")));
  const outDir = path.resolve(argValue("out", path.join("data", "nba", "warehouse")));
  const teamApi = readRows(path.join(rawDir, "nba_api_team_advanced.json"));
  const playerApi = readRows(path.join(rawDir, "nba_api_player_advanced.json"));
  const existingTeams = readRows(path.join(outDir, "team-feed.json"));
  if (!teamApi.length) {
    console.log(JSON.stringify({ ok: false, skipped: true, reason: "Missing nba_api_team_advanced.json", rawDir }, null, 2));
    return;
  }
  const teamRows = normalizeTeamRows(teamApi, existingTeams);
  const playerRows = playerApi.length ? normalizePlayerRows(playerApi, teamRows) : readRows(path.join(outDir, "player-feed.json"));
  const historyRows = buildHistoryRows(teamRows);
  const ratingRows = buildRatingRows(teamRows, playerRows);
  fs.mkdirSync(outDir, { recursive: true });
  writeFeed(outDir, "team", teamRows);
  if (playerRows.length) writeFeed(outDir, "player", playerRows);
  writeFeed(outDir, "history", historyRows);
  writeFeed(outDir, "rating", ratingRows);
  console.log(JSON.stringify({
    ok: true,
    rawDir,
    outDir,
    inputRows: { teamApi: teamApi.length, playerApi: playerApi.length, existingTeams: existingTeams.length },
    outputRows: { team: teamRows.length, player: playerRows.length, history: historyRows.length, rating: ratingRows.length }
  }, null, 2));
}

main();
