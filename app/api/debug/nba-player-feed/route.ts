import { NextResponse } from "next/server";

import { getMergedRealPlayerFeed } from "@/services/simulation/nba-real-player-feed";
import { getNbaTeamPlayerProfileSummary } from "@/services/simulation/nba-player-profiles";
import { normalizeNbaTeam } from "@/services/simulation/nba-team-analytics";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SourceCounts = Record<string, number>;

function configured(name: string) {
  return Boolean(process.env[name]?.trim());
}

function countBySource(records: Array<{ source?: string }>) {
  return records.reduce<SourceCounts>((acc, record) => {
    const key = record.source ?? "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function getTeamParam(request: Request) {
  const url = new URL(request.url);
  return url.searchParams.get("team")?.trim() || "Boston Celtics";
}

export async function GET(request: Request) {
  const team = getTeamParam(request);
  const [feed, profile] = await Promise.all([
    getMergedRealPlayerFeed(),
    getNbaTeamPlayerProfileSummary(team)
  ]);

  const groupedTeams = Array.from(new Set(feed.map((record) => record.teamName))).sort();
  const matchingFeedRecords = feed.filter((record) => normalizeNbaTeam(record.teamName) === normalizeNbaTeam(team));

  return NextResponse.json({
    ok: true,
    checkedTeam: team,
    environment: {
      NBA_STATS_API_PLAYER_PROFILE_URL: configured("NBA_STATS_API_PLAYER_PROFILE_URL"),
      NBA_PLAYER_STATS_URL: configured("NBA_PLAYER_STATS_URL"),
      NBA_LINEUP_PLAYER_PROFILE_URL: configured("NBA_LINEUP_PLAYER_PROFILE_URL"),
      NBA_LINEUP_DATA_URL: configured("NBA_LINEUP_DATA_URL"),
      NBA_INJURY_PLAYER_PROFILE_URL: configured("NBA_INJURY_PLAYER_PROFILE_URL"),
      NBA_PLAYER_IMPACT_URL: configured("NBA_PLAYER_IMPACT_URL"),
      NBA_INJURY_IMPACT_URL: configured("NBA_INJURY_IMPACT_URL")
    },
    mergedFeed: {
      realFeedFlowing: feed.length > 0,
      totalRecords: feed.length,
      sourceCounts: countBySource(feed),
      teamCount: groupedTeams.length,
      sampleTeams: groupedTeams.slice(0, 12),
      matchingRecordsForTeam: matchingFeedRecords.length,
      samplePlayersForTeam: matchingFeedRecords.slice(0, 8).map((record) => ({
        playerName: record.playerName,
        teamName: record.teamName,
        status: record.status,
        projectedMinutes: record.projectedMinutes,
        usageRate: record.usageRate,
        netImpact: record.netImpact,
        source: record.source
      }))
    },
    profileSummary: {
      source: profile.source,
      isSynthetic: profile.source === "synthetic",
      playerCount: profile.players.length,
      starPower: profile.starPower,
      creationIndex: profile.creationIndex,
      spacingIndex: profile.spacingIndex,
      playmakingIndex: profile.playmakingIndex,
      defenseIndex: profile.defenseIndex,
      rimProtectionIndex: profile.rimProtectionIndex,
      fatigueRisk: profile.fatigueRisk,
      availabilityDrag: profile.availabilityDrag,
      rotationReliability: profile.rotationReliability,
      offensiveProfileBoost: profile.offensiveProfileBoost,
      defensiveProfileBoost: profile.defensiveProfileBoost,
      volatilityBoost: profile.volatilityBoost,
      notes: profile.notes,
      samplePlayers: profile.players.slice(0, 8).map((player) => ({
        playerName: player.playerName,
        role: player.role,
        status: player.status,
        projectedMinutes: player.projectedMinutes,
        usageRate: player.usageRate,
        netImpact: player.netImpact,
        source: player.source
      }))
    },
    interpretation: profile.source === "real"
      ? "Real merged player feed is flowing into the player profile engine."
      : "Player profile engine is falling back to synthetic profiles. Configure one or more player feed environment variables and redeploy."
  });
}
