import { BOARD_SPORTS } from "@/lib/config/board-sports";
import type { LeagueKey, LeagueRecord, PlayerRecord, SportsbookRecord, TeamRecord } from "@/lib/types/domain";

export const LIVE_SPORT_TO_LEAGUE: Record<string, LeagueKey | null> = {
  basketball_nba: "NBA",
  NBA: "NBA",
  nba: "NBA",
  basketball_ncaab: "NCAAB",
  NCAAB: "NCAAB",
  ncaab: "NCAAB",
  baseball_mlb: "MLB",
  MLB: "MLB",
  mlb: "MLB",
  icehockey_nhl: "NHL",
  ice_hockey_nhl: "NHL",
  NHL: "NHL",
  nhl: "NHL",
  americanfootball_nfl: "NFL",
  american_football_nfl: "NFL",
  NFL: "NFL",
  nfl: "NFL",
  americanfootball_ncaaf: "NCAAF",
  american_football_ncaaf: "NCAAF",
  NCAAF: "NCAAF",
  ncaaf: "NCAAF",
  mma_mixed_martial_arts: "UFC",
  mixed_martial_arts: "UFC",
  UFC: "UFC",
  ufc: "UFC",
  boxing: "BOXING",
  BOXING: "BOXING"
};

export const LIVE_PROP_SPORT_KEYS: Partial<Record<LeagueKey, string>> = {
  NBA: "basketball_nba",
  NCAAB: "basketball_ncaab"
};

export const PROP_COVERAGE_ORDER: LeagueKey[] = [
  "NBA",
  "NCAAB",
  "MLB",
  "NHL",
  "NFL",
  "NCAAF",
  "UFC",
  "BOXING"
];

const LEAGUE_RECORDS = new Map(
  BOARD_SPORTS.map((sport) => [
    sport.leagueKey,
    {
      id: `support_${sport.leagueKey.toLowerCase()}`,
      key: sport.leagueKey,
      name: sport.leagueLabel,
      sport: sport.sport
    } satisfies LeagueRecord
  ] as const)
);

const TEAM_CACHE = new Map<string, TeamRecord>();
const PLAYER_CACHE = new Map<string, PlayerRecord>();

export function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function buildNameTokens(value: string) {
  const normalized = normalizeName(value);
  const parts = value
    .split(/\s+/)
    .map((part) => normalizeName(part))
    .filter(Boolean);

  return Array.from(new Set([normalized, ...parts, parts.at(-1) ?? ""])).filter(Boolean);
}

export function deriveAbbreviation(teamName: string) {
  const parts = teamName
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean);

  if (parts.length >= 2) {
    return parts
      .slice(0, 3)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }

  return teamName.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase();
}

export function getLeagueForSportKey(sportKey: string): LeagueKey | null {
  const normalized = sportKey.trim();
  const compact = normalized.toLowerCase().replace(/[\s/-]+/g, "_");
  return (
    LIVE_SPORT_TO_LEAGUE[normalized] ??
    LIVE_SPORT_TO_LEAGUE[normalized.toUpperCase()] ??
    LIVE_SPORT_TO_LEAGUE[normalized.toLowerCase()] ??
    LIVE_SPORT_TO_LEAGUE[compact] ??
    null
  );
}

export function getLeagueRecord(leagueKey: LeagueKey): LeagueRecord {
  return (
    LEAGUE_RECORDS.get(leagueKey) ?? {
      id: `support_${leagueKey.toLowerCase()}`,
      key: leagueKey,
      name: leagueKey,
      sport: "BASKETBALL"
    }
  );
}

export function buildLiveSportsbookRecord(key: string, name: string): SportsbookRecord {
  return {
    id: `live_${key}`,
    key,
    name,
    region: "US"
  };
}

export function getLiveTeamRecord(leagueKey: LeagueKey, teamName: string): TeamRecord {
  const cacheKey = `${leagueKey}:${normalizeName(teamName)}`;
  const existing = TEAM_CACHE.get(cacheKey);
  if (existing) {
    return existing;
  }

  const league = getLeagueRecord(leagueKey);
  const team = {
    id: `live_${leagueKey.toLowerCase()}_${normalizeName(teamName)}`,
    leagueId: league.id,
    name: teamName,
    abbreviation: deriveAbbreviation(teamName),
    externalIds: {
      source: "live-backend"
    }
  } satisfies TeamRecord;

  TEAM_CACHE.set(cacheKey, team);
  return team;
}

export function buildUnknownTeamRecord(
  leagueKey: LeagueKey,
  label: string,
  suffix: string
): TeamRecord {
  const cacheKey = `${leagueKey}:${suffix}`;
  const existing = TEAM_CACHE.get(cacheKey);
  if (existing) {
    return existing;
  }

  const league = getLeagueRecord(leagueKey);
  const team = {
    id: `live_${leagueKey.toLowerCase()}_${suffix}`,
    leagueId: league.id,
    name: label,
    abbreviation: label
      .split(/\s+/)
      .map((part) => part[0] ?? "")
      .join("")
      .slice(0, 3)
      .toUpperCase()
      .padEnd(3, "D"),
    externalIds: {
      source: "live-backend"
    }
  } satisfies TeamRecord;

  TEAM_CACHE.set(cacheKey, team);
  return team;
}

export function buildLivePlayerRecord(args: {
  leagueKey: LeagueKey;
  playerName: string;
  playerExternalId?: string | null;
  playerPosition?: string | null;
  teamId: string;
}) {
  const cacheKey = `${args.leagueKey}:${args.playerExternalId ?? normalizeName(args.playerName)}`;
  const existing = PLAYER_CACHE.get(cacheKey);
  if (existing) {
    return existing;
  }

  const league = getLeagueRecord(args.leagueKey);
  const player = {
    id:
      args.playerExternalId && args.playerExternalId.trim().length
        ? `live_${args.leagueKey.toLowerCase()}_${args.playerExternalId}`
        : `live_${args.leagueKey.toLowerCase()}_${normalizeName(args.playerName)}`,
    leagueId: league.id,
    teamId: args.teamId,
    name: args.playerName,
    position: args.playerPosition?.trim() || "--",
    externalIds: {
      source: "live-backend",
      ...(args.playerExternalId ? { espn: args.playerExternalId } : {})
    },
    status: "ACTIVE"
  } satisfies PlayerRecord;

  PLAYER_CACHE.set(cacheKey, player);
  return player;
}
