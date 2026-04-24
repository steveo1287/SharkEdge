import type { LeagueKey, TeamRecord } from "@/lib/types/domain";

const ESPN_LEAGUE_LOGOS: Partial<Record<LeagueKey, string | null>> = {
  NBA: "https://a.espncdn.com/i/teamlogos/leagues/500/nba.png",
  MLB: "https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png",
  NHL: "https://a.espncdn.com/i/teamlogos/leagues/500/nhl.png",
  NFL: "https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png",
  NCAAF: "https://a.espncdn.com/i/teamlogos/leagues/500/ncf.png",
  UFC: null,
  BOXING: null
};

function getEspnTeamId(team: TeamRecord) {
  const value = team.externalIds?.espn;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeAbbreviation(team: TeamRecord) {
  return team.abbreviation.trim().toLowerCase();
}

function inferLeagueKey(team: TeamRecord): LeagueKey | null {
  if (team.leagueId.includes("nba")) return "NBA";
  if (team.leagueId.includes("mlb")) return "MLB";
  if (team.leagueId.includes("nhl")) return "NHL";
  if (team.leagueId.includes("nfl")) return "NFL";
  if (team.leagueId.includes("ncaaf")) return "NCAAF";
  return null;
}

export function getLeagueLogoUrl(leagueKey: LeagueKey) {
  return ESPN_LEAGUE_LOGOS[leagueKey] ?? null;
}

export function getTeamLogoUrl(team: TeamRecord, leagueKey?: LeagueKey | null) {
  const resolvedLeague = leagueKey ?? inferLeagueKey(team);

  if (!resolvedLeague) {
    return null;
  }

  const abbreviation = normalizeAbbreviation(team);
  const espnId = getEspnTeamId(team);

  if (resolvedLeague === "NBA") {
    return `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nba/500/${abbreviation}.png&h=96&w=96`;
  }

  if (resolvedLeague === "MLB") {
    return `https://a.espncdn.com/combiner/i?img=/i/teamlogos/mlb/500/${abbreviation}.png&h=96&w=96`;
  }

  if (resolvedLeague === "NHL") {
    return `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nhl/500/${abbreviation}.png&h=96&w=96`;
  }

  if (resolvedLeague === "NFL") {
    return `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/${abbreviation}.png&h=96&w=96`;
  }

  if (resolvedLeague === "NCAAF" && espnId) {
    return `https://a.espncdn.com/combiner/i?img=/i/teamlogos/ncaa/500/${espnId}.png&h=96&w=96`;
  }

  return null;
}
