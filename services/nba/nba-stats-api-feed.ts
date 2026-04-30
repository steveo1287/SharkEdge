import { fetchDataBallrPlayerFeed } from "@/services/nba/databallr-player-feed";
import type { NbaTeamAnalyticsProfile } from "@/services/simulation/nba-team-analytics";

type NbaStatsResultSet = {
  headers?: string[];
  rowSet?: unknown[][];
};

type NbaStatsResponse = {
  resultSets?: NbaStatsResultSet[];
  resultSet?: NbaStatsResultSet;
};

type TeamRow = Partial<NbaTeamAnalyticsProfile> & {
  teamId?: string | number | null;
  teamAbbreviation?: string | null;
  gamesPlayed?: number | null;
  wins?: number | null;
  losses?: number | null;
};

const NBA_STATS_BASE_URL = "https://stats.nba.com/stats/leaguedashteamstats";
const CACHE_TTL_SECONDS = 60 * 60 * 6;
const NBA_TEAM_ABBREVIATIONS: Record<string, string> = {
  ATL: "Atlanta Hawks",
  BOS: "Boston Celtics",
  BKN: "Brooklyn Nets",
  CHA: "Charlotte Hornets",
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
  NYK: "New York Knicks",
  OKC: "Oklahoma City Thunder",
  ORL: "Orlando Magic",
  PHI: "Philadelphia 76ers",
  PHX: "Phoenix Suns",
  POR: "Portland Trail Blazers",
  SAC: "Sacramento Kings",
  SAS: "San Antonio Spurs",
  TOR: "Toronto Raptors",
  UTA: "Utah Jazz",
  WAS: "Washington Wizards"
};

function currentNbaSeason(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const startYear = month >= 9 ? year : year - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

function season() {
  return process.env.NBA_STATS_SEASON?.trim() || currentNbaSeason();
}

function num(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRange(seedKey: string, min: number, max: number) {
  const seed = hashString(seedKey);
  return Number((min + ((seed % 1000) / 1000) * (max - min)).toFixed(2));
}

function canonicalTeamName(value: string) {
  const trimmed = value.trim();
  return NBA_TEAM_ABBREVIATIONS[trimmed.toUpperCase()] ?? trimmed;
}

function avg(values: number[], fallback: number) {
  const usable = values.filter((value) => Number.isFinite(value));
  if (!usable.length) return fallback;
  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function weightedAvg<T>(rows: T[], weight: (row: T) => number, value: (row: T) => number, fallback: number) {
  const weighted = rows
    .map((row) => ({ weight: Math.max(0, weight(row)), value: value(row) }))
    .filter((row) => Number.isFinite(row.weight) && Number.isFinite(row.value) && row.weight > 0);
  const totalWeight = weighted.reduce((sum, row) => sum + row.weight, 0);
  if (!totalWeight) return fallback;
  return weighted.reduce((sum, row) => sum + row.value * row.weight, 0) / totalWeight;
}

function pct(value: unknown) {
  const parsed = num(value);
  if (parsed === null) return null;
  return parsed <= 1 ? Number((parsed * 100).toFixed(2)) : parsed;
}

function resultSet(response: NbaStatsResponse) {
  return response.resultSets?.[0] ?? response.resultSet ?? null;
}

function rowsFromStatsResponse(response: NbaStatsResponse) {
  const set = resultSet(response);
  if (!set?.headers?.length || !set.rowSet?.length) return [] as Record<string, unknown>[];
  return set.rowSet.map((row) => Object.fromEntries(set.headers!.map((header, index) => [header, row[index]])));
}

function statsHeaders(): HeadersInit {
  return {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Connection": "keep-alive",
    "Host": "stats.nba.com",
    "Origin": "https://www.nba.com",
    "Referer": "https://www.nba.com/stats/teams/advanced",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "x-nba-stats-origin": "stats",
    "x-nba-stats-token": "true"
  };
}

function baseParams(measureType: "Advanced" | "Base") {
  const params = new URLSearchParams({
    Conference: "",
    DateFrom: "",
    DateTo: "",
    Division: "",
    GameScope: "",
    GameSegment: "",
    LastNGames: "0",
    LeagueID: "00",
    Location: "",
    MeasureType: measureType,
    Month: "0",
    OpponentTeamID: "0",
    Outcome: "",
    PORound: "0",
    PaceAdjust: "N",
    PerMode: measureType === "Advanced" ? "Per100Possessions" : "Totals",
    Period: "0",
    PlayerExperience: "",
    PlayerPosition: "",
    PlusMinus: "N",
    Rank: "N",
    Season: season(),
    SeasonSegment: "",
    SeasonType: process.env.NBA_STATS_SEASON_TYPE?.trim() || "Regular Season",
    ShotClockRange: "",
    StarterBench: "",
    TeamID: "0",
    TwoWay: "0",
    VsConference: "",
    VsDivision: ""
  });
  return params;
}

async function fetchNbaStats(measureType: "Advanced" | "Base") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.NBA_STATS_TIMEOUT_MS ?? 15_000));
  try {
    const response = await fetch(`${NBA_STATS_BASE_URL}?${baseParams(measureType).toString()}`, {
      headers: statsHeaders(),
      signal: controller.signal,
      cache: "force-cache",
      next: { revalidate: Number(process.env.NBA_STATS_API_CACHE_TTL_SECONDS ?? CACHE_TTL_SECONDS) }
    });
    if (!response.ok) throw new Error(`NBA Stats ${measureType} failed: HTTP ${response.status}`);
    return rowsFromStatsResponse((await response.json()) as NbaStatsResponse);
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeNbaStatsApiAdvancedFixtureRow(row: Record<string, unknown>): TeamRow | null {
  const teamName = String(row.TEAM_NAME ?? "").trim();
  if (!teamName) return null;
  return {
    teamId: num(row.TEAM_ID),
    teamName,
    teamAbbreviation: typeof row.TEAM_ABBREVIATION === "string" ? row.TEAM_ABBREVIATION : null,
    gamesPlayed: num(row.GP),
    wins: num(row.W),
    losses: num(row.L),
    offensiveRating: num(row.OFF_RATING) ?? 114,
    defensiveRating: num(row.DEF_RATING) ?? 114,
    pace: num(row.PACE) ?? 98.5,
    efgPct: pct(row.EFG_PCT) ?? 54.5,
    turnoverPct: pct(row.TM_TOV_PCT) ?? 13,
    reboundPct: pct(row.REB_PCT) ?? 50,
    restTravel: 0,
    source: "nba-stats-api"
  };
}

function mergeBaseStats(profile: TeamRow, row: Record<string, unknown>): TeamRow {
  const fg3a = num(row.FG3A);
  const fga = num(row.FGA);
  const fta = num(row.FTA);
  return {
    ...profile,
    threePointAttemptRate: fg3a !== null && fga ? Number(((fg3a / fga) * 100).toFixed(2)) : profile.threePointAttemptRate ?? 38,
    freeThrowRate: fta !== null && fga ? Number(((fta / fga) * 100).toFixed(2)) : profile.freeThrowRate ?? 21
  };
}

export async function buildNbaStatsApiTeamAnalyticsFeed() {
  const [advancedRows, baseRows] = await Promise.all([
    fetchNbaStats("Advanced").catch(() => [] as Record<string, unknown>[]),
    fetchNbaStats("Base").catch(() => [] as Record<string, unknown>[])
  ]);

  const baseByTeamId = new Map<string, Record<string, unknown>>();
  for (const row of baseRows) {
    const teamId = String(row.TEAM_ID ?? "").trim();
    if (teamId) baseByTeamId.set(teamId, row);
  }

  const nbaStatsTeams = advancedRows
    .map(normalizeNbaStatsApiAdvancedFixtureRow)
    .filter((row): row is TeamRow => Boolean(row))
    .map((profile) => {
      const base = baseByTeamId.get(String(profile.teamId ?? ""));
      const merged = base ? mergeBaseStats(profile, base) : profile;
      return {
        ...merged,
        recentForm: Number((((merged.wins ?? 0) - (merged.losses ?? 0)) / Math.max(1, merged.gamesPlayed ?? 82) * 6).toFixed(2))
      };
    });

  if (nbaStatsTeams.length) return nbaStatsTeams;
  return buildDataBallrDerivedTeamAnalyticsFeed();
}

async function buildDataBallrDerivedTeamAnalyticsFeed() {
  const players = await fetchDataBallrPlayerFeed();
  const grouped = new Map<string, typeof players>();
  for (const player of players) {
    const teamName = canonicalTeamName(player.teamName);
    grouped.set(teamName, [...(grouped.get(teamName) ?? []), player]);
  }

  return Array.from(grouped.entries()).map(([teamName, rows]) => {
    const minutes = (row: typeof rows[number]) => row.projectedMinutes || 12;
    const usageWeightedOffense = weightedAvg(rows, minutes, (row) => row.offensiveEpm, 0);
    const usageWeightedDefense = weightedAvg(rows, minutes, (row) => row.defensiveEpm, 0);
    const usage = weightedAvg(rows, minutes, (row) => row.usageRate, 18);
    const trueShooting = weightedAvg(rows, minutes, (row) => row.trueShooting, 56);
    const rebound = weightedAvg(rows, minutes, (row) => row.reboundRate, 8);
    const turnover = weightedAvg(rows, minutes, (row) => row.turnoverRate, 10);
    const gravity = weightedAvg(rows, minutes, (row) => row.threePointGravity, 4);
    const rimPressure = weightedAvg(rows, minutes, (row) => row.rimPressure, 4);
    const net = avg(rows.map((row) => row.netImpact), 0);
    const teamSeed = `databallr:${teamName}`;

    return {
      teamName,
      source: "databallr" as const,
      offensiveRating: Number((114 + usageWeightedOffense * 1.15 + (usage - 18) * 0.08).toFixed(2)),
      defensiveRating: Number((114 - usageWeightedDefense * 1.05).toFixed(2)),
      pace: seededRange(`${teamSeed}:pace`, 96.4, 101.2),
      efgPct: Number(Math.max(49, Math.min(60, trueShooting - 1.8)).toFixed(2)),
      threePointAttemptRate: Number(Math.max(30, Math.min(49, 33 + gravity * 1.8)).toFixed(2)),
      turnoverPct: Number(Math.max(9.5, Math.min(16.5, turnover)).toFixed(2)),
      reboundPct: Number(Math.max(47, Math.min(54, 48 + rebound * 0.28)).toFixed(2)),
      freeThrowRate: Number(Math.max(17, Math.min(28, 18 + rimPressure * 1.1)).toFixed(2)),
      recentForm: Number(Math.max(-5, Math.min(5, net * 0.45)).toFixed(2)),
      restTravel: 0
    };
  });
}

export async function getNbaStatsApiDebugPayload() {
  const teams = await buildNbaStatsApiTeamAnalyticsFeed();
  return {
    ok: teams.length > 0,
    source: teams.some((team) => team.source === "nba-stats-api") ? "nba-stats-api" : "databallr-derived",
    season: season(),
    teamCount: teams.length,
    sampleTeams: teams.slice(0, 5)
  };
}
