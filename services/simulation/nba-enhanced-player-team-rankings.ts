import { buildNbaLeaguePlayerRankingUniverse, nbaLeaguePlayerRankKey, type NbaLeaguePlayerRank } from "@/services/simulation/nba-league-player-rankings";
import { buildNbaPlayerTeamRankingSnapshot, type NbaPlayerTeamRankingSnapshot } from "@/services/simulation/nba-player-team-rankings";
import type { NbaPlayerStatProjection } from "@/services/simulation/nba-player-stat-sim";

export type NbaEnhancedRankedPlayer = NbaPlayerTeamRankingSnapshot["players"][number] & {
  leagueRank: NbaLeaguePlayerRank | null;
  leagueOverallRank: number | null;
  leaguePercentile: number | null;
  roleAdjustedLeaguePercentile: number | null;
  confidenceAdjustedLeaguePercentile: number | null;
  leagueSource: string | null;
  leagueSourceConfidence: number | null;
};

export type NbaEnhancedPlayerTeamRankingSnapshot = Omit<NbaPlayerTeamRankingSnapshot, "players"> & {
  players: NbaEnhancedRankedPlayer[];
  leagueUniverseStatus: "GREEN" | "YELLOW" | "RED";
  leaguePlayerCount: number;
  leagueWarnings: string[];
  leagueBlockers: string[];
};

export async function buildNbaEnhancedPlayerTeamRankingSnapshot(args: {
  homeTeam: string;
  awayTeam: string;
  playerStatProjections: NbaPlayerStatProjection[];
}): Promise<NbaEnhancedPlayerTeamRankingSnapshot> {
  const [base, universe] = await Promise.all([
    Promise.resolve(buildNbaPlayerTeamRankingSnapshot(args)),
    buildNbaLeaguePlayerRankingUniverse({ projectedPlayers: args.playerStatProjections, bypassCache: true })
  ]);
  const byKey = new Map<string, NbaLeaguePlayerRank>();
  for (const player of universe.players) {
    byKey.set(nbaLeaguePlayerRankKey(player.playerName, player.teamName), player);
  }
  const players = base.players.map((player) => {
    const leagueRank = byKey.get(nbaLeaguePlayerRankKey(player.playerName, player.teamName)) ?? null;
    return {
      ...player,
      leagueRank,
      leagueOverallRank: leagueRank?.rawOverallRank ?? null,
      leaguePercentile: leagueRank?.leaguePercentile ?? null,
      roleAdjustedLeaguePercentile: leagueRank?.roleAdjustedPercentile ?? null,
      confidenceAdjustedLeaguePercentile: leagueRank?.confidenceAdjustedPercentile ?? null,
      leagueSource: leagueRank?.source ?? null,
      leagueSourceConfidence: leagueRank?.sourceConfidence ?? null
    };
  });
  return {
    ...base,
    players,
    leagueUniverseStatus: universe.status,
    leaguePlayerCount: universe.playerCount,
    leagueWarnings: universe.warnings,
    leagueBlockers: universe.blockers,
    warnings: [...new Set([...base.warnings, ...universe.warnings.map((warning) => `league rankings: ${warning}`), ...universe.blockers.map((blocker) => `league rankings blocker: ${blocker}`)])],
    drivers: [
      ...base.drivers,
      `league universe ${universe.status} with ${universe.playerCount} players`,
      `league real-source count ${universe.realSourceCount}`,
      `league low-confidence/synthetic count ${universe.syntheticSourceCount}`
    ]
  };
}
