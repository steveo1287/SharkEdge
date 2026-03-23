import type { LeagueKey, LeagueSnapshotView, TeamGameStatRecord, TeamRecord } from "@/lib/types/domain";
import { mockDatabase } from "@/prisma/seed-data";

const teamMap = new Map(mockDatabase.teams.map((team) => [team.id, team]));
const leagueMap = new Map(mockDatabase.leagues.map((league) => [league.id, league]));

function getTeam(teamId: string) {
  return teamMap.get(teamId) as TeamRecord;
}

export function getLeagueSnapshots(selectedLeague: "ALL" | LeagueKey) {
  const leagueKeys: LeagueKey[] = selectedLeague === "ALL" ? ["NBA", "NCAAB"] : [selectedLeague];

  return leagueKeys.map((leagueKey) => {
    const league = mockDatabase.leagues.find((entry) => entry.key === leagueKey);
    const standings = mockDatabase.standings[leagueKey].map((row) => ({
      rank: row.rank,
      team: getTeam(row.teamId),
      record: `${row.wins}-${row.losses}`,
      streak: row.streak,
      netRating: row.netRating
    }));
    const previousGames = mockDatabase.previousGames
      .filter((game) => game.leagueKey === leagueKey)
      .map((game) => ({
        id: game.id,
        playedAt: game.playedAt,
        awayTeam: getTeam(game.awayTeamId),
        homeTeam: getTeam(game.homeTeamId),
        awayScore: game.awayScore,
        homeScore: game.homeScore
      }));

    return {
      league: league!,
      standings,
      previousGames
    } satisfies LeagueSnapshotView;
  });
}

export function getTeamStatComparison(gameId: string) {
  const game = mockDatabase.games.find((entry) => entry.id === gameId);
  if (!game) {
    return null;
  }

  const away = mockDatabase.teamGameStats.find(
    (entry) => entry.gameId === gameId && entry.teamId === game.awayTeamId
  ) as TeamGameStatRecord | undefined;
  const home = mockDatabase.teamGameStats.find(
    (entry) => entry.gameId === gameId && entry.teamId === game.homeTeamId
  ) as TeamGameStatRecord | undefined;

  if (!away || !home) {
    return null;
  }

  return {
    away: {
      team: getTeam(game.awayTeamId),
      stats: away.statsJson as Record<string, number | string>
    },
    home: {
      team: getTeam(game.homeTeamId),
      stats: home.statsJson as Record<string, number | string>
    }
  };
}

export function getLeagueById(leagueId: string) {
  return leagueMap.get(leagueId) ?? null;
}
