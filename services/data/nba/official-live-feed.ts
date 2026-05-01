import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";

export type OfficialNbaKind = "team" | "player" | "history" | "rating";

type NbaStatsResponse = {
  resultSets?: Array<{ name?: string; headers?: string[]; rowSet?: unknown[][] }>;
  resultSet?: { name?: string; headers?: string[]; rowSet?: unknown[][] };
};

type Row = Record<string, unknown>;

const CACHE_TTL_SECONDS = 60 * 60 * 3;
const TEAM_CACHE_KEY = "nba:official-live:team:v1";
const PLAYER_CACHE_KEY = "nba:official-live:player:v1";
const TEAM_STATS_URL = "https://stats.nba.com/stats/leaguedashteamstats";
const PLAYER_STATS_URL = "https://stats.nba.com/stats/leaguedashplayerstats";
const DEFAULT_NBA_STATS_TIMEOUT_MS = 3500;

function nbaStatsTimeoutMs() {
  const parsed = Number(process.env.NBA_STATS_TIMEOUT_MS ?? DEFAULT_NBA_STATS_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(750, Math.floor(parsed)) : DEFAULT_NBA_STATS_TIMEOUT_MS;
}

async function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), nbaStatsTimeoutMs());
  try {
    return await work(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

function seasonLabel(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const start = month >= 10 ? year : year - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
}

function params(values: Record<string, string>) {
  return new URLSearchParams(values).toString();
}

function nbaHeaders(): HeadersInit {
  return {
    accept: "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9",
    origin: "https://www.nba.com",
    referer: "https://www.nba.com/",
    "user-agent": "Mozilla/5.0 (compatible; SharkEdge/1.0; +https://sharkedge.vercel.app)",
    "x-nba-stats-origin": "stats",
    "x-nba-stats-token": "true"
  };
}

async function fetchNbaStats(url: string, query: Record<string, string>) {
  return withTimeout(async (signal) => {
    const response = await fetch(`${url}?${params(query)}`, {
      cache: "no-store",
      headers: nbaHeaders(),
      signal
    });
    if (!response.ok) throw new Error(`NBA Stats request failed: ${response.status}`);
    return response.json() as Promise<NbaStatsResponse>;
  });
}

function firstResultSet(body: NbaStatsResponse) {
  return body.resultSets?.[0] ?? body.resultSet ?? null;
}

function rowsFromStats(body: NbaStatsResponse): Row[] {
  const set = firstResultSet(body);
  const headers = set?.headers ?? [];
  const rows = set?.rowSet ?? [];
  return rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])) as Row);
}

function num(row: Row, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return 0;
}

function text(row: Row, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function teamName(row: Row) {
  const name = text(row, "TEAM_NAME", "teamName");
  const city = text(row, "TEAM_CITY", "teamCity");
  if (city && name && !name.toLowerCase().includes(city.toLowerCase())) return `${city} ${name}`;
  return name || text(row, "TEAM_ABBREVIATION", "TEAM_ID");
}

function normalizeTeamRows(rows: Row[]) {
  return rows.map((row) => {
    const offensiveRating = num(row, "E_OFF_RATING", "OFF_RATING");
    const defensiveRating = num(row, "E_DEF_RATING", "DEF_RATING");
    const netRating = num(row, "E_NET_RATING", "NET_RATING") || offensiveRating - defensiveRating;
    const pace = num(row, "PACE", "POSS") || 99;
    const trueShooting = num(row, "TS_PCT") * 100 || 57;
    const effectiveFg = num(row, "EFG_PCT") * 100 || 54;
    const freeThrowRate = num(row, "FTA_RATE") * 100 || 22;
    const turnoverRate = num(row, "TM_TOV_PCT", "TOV_PCT") || 13;
    const offensiveReboundRate = num(row, "OREB_PCT") * 100 || 27;
    const defensiveReboundRate = num(row, "DREB_PCT") * 100 || 73;
    const threePointAccuracy = num(row, "FG3_PCT") * 100 || 36;
    const threePointRate = num(row, "FG3A_RATE") * 100 || 38;
    return {
      teamName: teamName(row),
      teamId: text(row, "TEAM_ID"),
      teamAbbreviation: text(row, "TEAM_ABBREVIATION"),
      games: num(row, "GP"),
      wins: num(row, "W"),
      losses: num(row, "L"),
      offensiveRating: round(offensiveRating || 113.2, 2),
      defensiveRating: round(defensiveRating || 113.2, 2),
      netRating: round(netRating, 2),
      trueShooting: round(trueShooting, 2),
      effectiveFg: round(effectiveFg, 2),
      threePointRate: round(threePointRate, 2),
      threePointAccuracy: round(threePointAccuracy, 2),
      freeThrowRate: round(freeThrowRate, 2),
      turnoverRate: round(turnoverRate, 2),
      offensiveReboundRate: round(offensiveReboundRate, 2),
      defensiveReboundRate: round(defensiveReboundRate, 2),
      pace: round(pace, 2),
      transition: 0,
      halfCourt: round((offensiveRating - 113.2) * 0.6, 2),
      clutch: round(netRating * 0.12, 2),
      rest: 0,
      travel: 0,
      recentForm: round(netRating * 0.35, 2),
      homeAdvantage: 2.1,
      injuryDrag: 0,
      __source: "official-nba-stats-live",
      __sourceLabel: "Official NBA Stats live team advanced feed",
      __sourceTier: "core",
      __sourcePriority: 1,
      __sourceWeight: 1,
      __license: "public-or-self-hosted"
    };
  }).filter((row) => row.teamName);
}

function normalizePlayerRows(rows: Row[], teamRows: Row[]) {
  const teamById = new Map(teamRows.map((team) => [String(team.teamId ?? ""), String(team.teamName ?? "")]));
  const teamByAbbr = new Map(teamRows.map((team) => [String(team.teamAbbreviation ?? ""), String(team.teamName ?? "")]));
  return rows.map((row) => {
    const teamId = text(row, "TEAM_ID");
    const teamAbbreviation = text(row, "TEAM_ABBREVIATION");
    const teamName = teamById.get(teamId) || teamByAbbr.get(teamAbbreviation) || text(row, "TEAM_NAME", "TEAM_ABBREVIATION");
    const minutes = num(row, "MIN");
    const plusMinus = num(row, "PLUS_MINUS");
    const pie = num(row, "PIE") * 100;
    const usage = num(row, "USG_PCT") * 100;
    const assistPct = num(row, "AST_PCT") * 100;
    const reboundPct = num(row, "REB_PCT") * 100;
    const offensiveRating = num(row, "E_OFF_RATING", "OFF_RATING");
    const defensiveRating = num(row, "E_DEF_RATING", "DEF_RATING");
    const netRating = num(row, "E_NET_RATING", "NET_RATING") || offensiveRating - defensiveRating;
    return {
      teamName,
      teamId,
      teamAbbreviation,
      playerId: text(row, "PLAYER_ID"),
      playerName: text(row, "PLAYER_NAME"),
      games: num(row, "GP"),
      minutes: round(minutes, 2),
      impactRating: round(netRating * 0.35 + pie * 0.18 + plusMinus * 0.08, 2),
      usageCreation: round(usage * 0.12 + assistPct * 0.08, 2),
      onOffImpact: round(netRating * 0.28 + plusMinus * 0.08, 2),
      spacing: round(num(row, "EFG_PCT") * 6 || 0, 2),
      playmaking: round(assistPct * 0.12, 2),
      rimPressure: round(num(row, "FTA_RATE") * 12 || 0, 2),
      rebounding: round(reboundPct * 0.1, 2),
      perimeterDefense: round(Math.max(0, 113.2 - defensiveRating) * 0.18, 2),
      rimProtection: 0,
      depthPower: round(Math.min(4, minutes / 8), 2),
      injuryPenalty: 0,
      fatigue: 0,
      volatility: 1.1,
      __source: "official-nba-stats-live",
      __sourceLabel: "Official NBA Stats live player advanced feed",
      __sourceTier: "core",
      __sourcePriority: 1,
      __sourceWeight: 1,
      __license: "public-or-self-hosted"
    };
  }).filter((row) => row.teamName && row.playerName);
}

async function loadOfficialTeamRows() {
  const cached = await readHotCache<Row[]>(TEAM_CACHE_KEY);
  if (cached?.length) return cached;
  const season = process.env.NBA_STATS_SEASON?.trim() || seasonLabel();
  const body = await fetchNbaStats(TEAM_STATS_URL, {
    College: "",
    Conference: "",
    Country: "",
    DateFrom: "",
    DateTo: "",
    Division: "",
    DraftPick: "",
    DraftYear: "",
    GameScope: "",
    GameSegment: "",
    Height: "",
    LastNGames: "0",
    LeagueID: "00",
    Location: "",
    MeasureType: "Advanced",
    Month: "0",
    OpponentTeamID: "0",
    Outcome: "",
    PORound: "0",
    PaceAdjust: "N",
    PerMode: "Per100Possessions",
    Period: "0",
    PlayerExperience: "",
    PlayerPosition: "",
    PlusMinus: "N",
    Rank: "N",
    Season: season,
    SeasonSegment: "",
    SeasonType: "Regular Season",
    ShotClockRange: "",
    StarterBench: "",
    TeamID: "0",
    TwoWay: "0",
    VsConference: "",
    VsDivision: "",
    Weight: ""
  });
  const rows = normalizeTeamRows(rowsFromStats(body));
  if (rows.length) await writeHotCache(TEAM_CACHE_KEY, rows, CACHE_TTL_SECONDS);
  return rows;
}

async function loadOfficialPlayerRows(teamRows: Row[]) {
  const cached = await readHotCache<Row[]>(PLAYER_CACHE_KEY);
  if (cached?.length) return cached;
  const season = process.env.NBA_STATS_SEASON?.trim() || seasonLabel();
  const body = await fetchNbaStats(PLAYER_STATS_URL, {
    College: "",
    Conference: "",
    Country: "",
    DateFrom: "",
    DateTo: "",
    Division: "",
    DraftPick: "",
    DraftYear: "",
    GameScope: "",
    GameSegment: "",
    Height: "",
    LastNGames: "0",
    LeagueID: "00",
    Location: "",
    MeasureType: "Advanced",
    Month: "0",
    OpponentTeamID: "0",
    Outcome: "",
    PORound: "0",
    PaceAdjust: "N",
    PerMode: "PerGame",
    Period: "0",
    PlayerExperience: "",
    PlayerPosition: "",
    PlusMinus: "N",
    Rank: "N",
    Season: season,
    SeasonSegment: "",
    SeasonType: "Regular Season",
    ShotClockRange: "",
    StarterBench: "",
    TeamID: "0",
    TwoWay: "0",
    VsConference: "",
    VsDivision: "",
    Weight: ""
  });
  const rows = normalizePlayerRows(rowsFromStats(body), teamRows);
  if (rows.length) await writeHotCache(PLAYER_CACHE_KEY, rows, CACHE_TTL_SECONDS);
  return rows;
}

function buildHistoryRows(teamRows: Row[]) {
  return teamRows.map((team) => {
    const netRating = num(team, "netRating");
    return {
      teamName: team.teamName,
      headToHeadEdge: 0,
      recentOffense: round(netRating * 0.3, 2),
      recentDefense: round(netRating * 0.22, 2),
      recentShooting: round((num(team, "trueShooting") - 57) * 0.2, 2),
      recentTurnovers: round((13 - num(team, "turnoverRate")) * 0.12, 2),
      recentRebounding: round((num(team, "offensiveReboundRate") - 27) * 0.08, 2),
      starMatchup: 0,
      benchTrend: 0,
      restHistory: 0,
      clutchRecent: round(netRating * 0.08, 2),
      sample: team.games ?? 0,
      __source: "official-nba-stats-live-derived-history",
      __sourceLabel: "Official NBA Stats live derived history feed",
      __sourceTier: "core",
      __sourcePriority: 2,
      __sourceWeight: 0.92,
      __license: "public-or-self-hosted"
    };
  });
}

function buildRatingRows(teamRows: Row[], playerRows: Row[]) {
  const playerCountByTeam = new Map<string, number>();
  for (const player of playerRows) playerCountByTeam.set(String(player.teamName), (playerCountByTeam.get(String(player.teamName)) ?? 0) + 1);
  return teamRows.map((team) => {
    const netRating = num(team, "netRating");
    return {
      teamName: team.teamName,
      overall: round(78 + netRating * 1.2, 2),
      offense: round(75 + (num(team, "offensiveRating") - 105) * 1.1, 2),
      defense: round(75 + (118 - num(team, "defensiveRating")) * 1.1, 2),
      shooting: round(70 + (num(team, "threePointAccuracy") - 32) * 1.8, 2),
      playmaking: round(74 + Math.max(-8, Math.min(8, netRating)), 2),
      rebounding: round(70 + (num(team, "offensiveReboundRate") - 24) + (num(team, "defensiveReboundRate") - 70), 2),
      depth: round(70 + Math.min(20, (playerCountByTeam.get(String(team.teamName)) ?? 0) * 1.2), 2),
      clutch: round(75 + num(team, "clutch"), 2),
      health: 92,
      __source: "official-nba-stats-live-derived-ratings",
      __sourceLabel: "Official NBA Stats live derived rating feed",
      __sourceTier: "core",
      __sourcePriority: 2,
      __sourceWeight: 0.84,
      __license: "public-or-self-hosted"
    };
  });
}

export async function buildOfficialNbaLiveFeed(kind: OfficialNbaKind) {
  if (process.env.NBA_DISABLE_OFFICIAL_LIVE_FALLBACK === "1") return [] as Row[];
  const teamRows = await loadOfficialTeamRows();
  if (kind === "team") return teamRows;
  const playerRows = await loadOfficialPlayerRows(teamRows);
  if (kind === "player") return playerRows;
  if (kind === "history") return buildHistoryRows(teamRows);
  if (kind === "rating") return buildRatingRows(teamRows, playerRows);
  return [] as Row[];
}
