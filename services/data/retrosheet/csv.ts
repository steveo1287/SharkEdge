export type RetrosheetCsvKind = "gameinfo" | "teamstats" | "pitching";

export type RetrosheetCsvValidation = {
  ok: boolean;
  missing: string[];
  resolved: Record<string, string>;
};

const REQUIRED_COLUMNS: Record<RetrosheetCsvKind, Record<string, string[]>> = {
  gameinfo: {
    gameId: ["game_id", "gameid", "retrosheet_game_id", "id"],
    gameDate: ["date", "game_date", "gamedate"],
    season: ["season", "year"],
    homeTeamId: ["home_team", "home_team_id", "hometeam", "home"],
    awayTeamId: ["away_team", "away_team_id", "awayteam", "away"],
    homeScore: ["home_score", "homescore", "home_runs"],
    awayScore: ["away_score", "awayscore", "away_runs"]
  },
  teamstats: {
    gameId: ["game_id", "gameid", "retrosheet_game_id", "id"],
    gameDate: ["date", "game_date", "gamedate"],
    season: ["season", "year"],
    teamId: ["team_id", "teamid", "team"],
    isHome: ["is_home", "ishome", "home_away", "side"],
    runs: ["runs", "r", "score"],
    runsAllowed: ["runs_allowed", "ra", "opp_runs", "opponent_runs", "opp_score"]
  },
  pitching: {
    gameId: ["game_id", "gameid", "retrosheet_game_id", "id"],
    gameDate: ["date", "game_date", "gamedate"],
    season: ["season", "year"],
    pitcherId: ["pitcher_id", "pitcherid", "player_id", "playerid"],
    teamId: ["team_id", "teamid", "team"],
    outs: ["outs", "ipouts", "outs_pitched"],
    strikeouts: ["strikeouts", "so", "k"],
    walks: ["walks", "bb"],
    hits: ["hits", "h"],
    runs: ["runs", "r", "runs_allowed"],
    homeRuns: ["home_runs", "hr", "homeruns"]
  }
};

const OPTIONAL_ALIASES: Record<string, string[]> = {
  gameNumber: ["game_number", "gamenumber", "number"],
  parkId: ["park_id", "parkid", "ballpark"],
  isPostseason: ["is_postseason", "postseason", "game_type", "gametype"],
  opponentTeamId: ["opponent_team_id", "opponent", "opp_team", "opp"],
  isStarter: ["is_starter", "starter", "started"],
  isHome: ["is_home", "ishome", "home_away", "side"]
};

export function parseCsvText(text: string): Record<string, string>[] {
  const rows = splitCsvRows(text).filter((row) => row.some((cell) => cell.trim() !== ""));
  if (!rows.length) return [];

  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = row[index]?.trim() ?? "";
    });
    return record;
  });
}

export function validateRetrosheetColumns(kind: RetrosheetCsvKind, headers: string[]): RetrosheetCsvValidation {
  const normalized = new Map(headers.map((header) => [normalizeHeader(header), header]));
  const missing: string[] = [];
  const resolved: Record<string, string> = {};

  Object.entries(REQUIRED_COLUMNS[kind]).forEach(([logicalName, aliases]) => {
    const match = aliases.map(normalizeHeader).find((alias) => normalized.has(alias));
    if (!match) {
      missing.push(logicalName);
      return;
    }
    resolved[logicalName] = normalized.get(match) ?? "";
  });

  return {
    ok: missing.length === 0,
    missing,
    resolved
  };
}

export function getRetrosheetValue(
  row: Record<string, string>,
  logicalName: string,
  resolved: Record<string, string>
) {
  const requiredHeader = resolved[logicalName];
  if (requiredHeader) return row[requiredHeader] ?? "";

  const optionalAlias = OPTIONAL_ALIASES[logicalName]
    ?.map(normalizeHeader)
    .find((alias) => Object.keys(row).some((header) => normalizeHeader(header) === alias));
  if (!optionalAlias) return "";

  const actualHeader = Object.keys(row).find((header) => normalizeHeader(header) === optionalAlias);
  return actualHeader ? row[actualHeader] ?? "" : "";
}

export function toRequiredInteger(value: string, field: string) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Retrosheet CSV requires numeric ${field}`);
  }
  return parsed;
}

export function toOptionalInteger(value: string) {
  if (!value.trim()) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toBoolean(value: string) {
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "t", "yes", "y", "home", "h"].includes(normalized)) return true;
  if (["0", "false", "f", "no", "n", "away", "a"].includes(normalized)) return false;
  return null;
}

export function parseRetrosheetDate(value: string) {
  const token = value.trim();
  if (/^\d{8}$/.test(token)) {
    return new Date(`${token.slice(0, 4)}-${token.slice(4, 6)}-${token.slice(6, 8)}T00:00:00.000Z`);
  }
  const parsed = new Date(token);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Retrosheet CSV requires a valid game date, received "${value}"`);
  }
  return parsed;
}

export function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function splitCsvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"") {
      if (quoted && next === "\"") {
        cell += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);
  return rows;
}
