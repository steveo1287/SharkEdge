import type { LeagueKey, LeagueMetaCard } from "@/lib/types/domain";

const SPORTSDB_LEAGUE_NAMES: Partial<Record<LeagueKey, string>> = {
  NBA: "NBA",
  NCAAB: "NCAA Men's Basketball",
  MLB: "MLB",
  NHL: "NHL",
  NFL: "NFL",
  NCAAF: "NCAA Football"
};

type SportsDbTeam = {
  idTeam?: string;
  strTeam?: string;
  strTeamShort?: string | null;
  strStadium?: string | null;
  strLocation?: string | null;
  strWebsite?: string | null;
  strBadge?: string | null;
  strFanart1?: string | null;
  strLogo?: string | null;
};

export async function getSportsDbLeagueCards(
  league: LeagueKey,
  limit = 3
): Promise<LeagueMetaCard[]> {
  const leagueName = SPORTSDB_LEAGUE_NAMES[league];
  if (!leagueName) {
    return [];
  }

  try {
    const response = await fetch(
      `https://www.thesportsdb.com/api/v1/json/3/search_all_teams.php?l=${encodeURIComponent(leagueName)}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 SharkEdge/1.5"
        },
        next: {
          revalidate: 43200
        }
      }
    );

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as { teams?: SportsDbTeam[] };
    const teams = Array.isArray(payload.teams) ? payload.teams : [];

    return teams
      .filter((team) => Boolean(team.strTeam))
      .slice(0, limit)
      .map((team) => ({
        id: String(team.idTeam ?? team.strTeam),
        title: team.strTeam ?? "Team",
        subtitle: team.strTeamShort?.trim() || league,
        badgeUrl: team.strBadge ?? team.strLogo ?? null,
        fanartUrl: team.strFanart1 ?? null,
        stadium: team.strStadium ?? null,
        location: team.strLocation ?? null,
        website: team.strWebsite
          ? `https://${String(team.strWebsite).replace(/^https?:\/\//, "")}`
          : null,
        source: "sportsdb"
      }));
  } catch {
    return [];
  }
}
