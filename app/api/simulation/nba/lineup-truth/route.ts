import { NextResponse } from "next/server";

import { getNbaLineupTruth } from "@/services/simulation/nba-lineup-truth";
import {
  getNbaPlayerImpactFeedHealth,
  getNbaPlayerImpactSnapshot
} from "@/services/simulation/nba-player-impact";
import { normalizeNbaTeam } from "@/services/simulation/nba-team-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function getQuery(request: Request) {
  const url = new URL(request.url);
  const awayTeam = url.searchParams.get("away")?.trim() || url.searchParams.get("awayTeam")?.trim() || null;
  const homeTeam = url.searchParams.get("home")?.trim() || url.searchParams.get("homeTeam")?.trim() || null;
  const team = url.searchParams.get("team")?.trim() || null;
  const gameTime = url.searchParams.get("gameTime")?.trim() || null;
  return { awayTeam, homeTeam, team, gameTime };
}

function sourceCounts(snapshot: Awaited<ReturnType<typeof getNbaPlayerImpactSnapshot>>) {
  const counts: Record<string, number> = {};
  for (const rows of Object.values(snapshot?.teams ?? {})) {
    for (const row of rows) {
      const key = row.source ?? "unknown";
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return counts;
}

function sampleTeams(snapshot: Awaited<ReturnType<typeof getNbaPlayerImpactSnapshot>>) {
  return Object.keys(snapshot?.teams ?? {}).sort().slice(0, 12);
}

function samplePlayersForTeam(snapshot: Awaited<ReturnType<typeof getNbaPlayerImpactSnapshot>>, team: string | null) {
  if (!snapshot?.teams || !team) return [];
  const rows = snapshot.teams[normalizeNbaTeam(team)] ?? [];
  return rows.slice(0, 10).map((row) => ({
    playerName: row.playerName,
    teamName: row.teamName,
    status: row.status,
    minutesImpact: row.minutesImpact,
    usageImpact: row.usageImpact,
    netRatingImpact: row.netRatingImpact,
    source: row.source ?? "unknown"
  }));
}

function routeVerdict(args: {
  truth: Awaited<ReturnType<typeof getNbaLineupTruth>> | null;
  feedHealthStatus: "GREEN" | "YELLOW" | "RED";
  canEvaluateGame: boolean;
}) {
  if (args.truth) {
    if (args.truth.status === "GREEN" && args.feedHealthStatus === "GREEN") return "LINEUP_TRUTH_GREEN";
    if (args.truth.status === "RED" || args.feedHealthStatus === "RED") return "LINEUP_TRUTH_PASS";
    return "LINEUP_TRUTH_WATCH_ONLY";
  }
  if (args.feedHealthStatus === "GREEN") return args.canEvaluateGame ? "FEED_READY" : "FEED_FLOWING_ADD_TEAM_QUERY_TO_EVALUATE_LINEUP_TRUTH";
  if (args.feedHealthStatus === "YELLOW") return "FEED_DEGRADED_WATCH_ONLY";
  return "FEED_NOT_ACTIONABLE";
}

export async function GET(request: Request) {
  try {
    const { awayTeam, homeTeam, team, gameTime } = getQuery(request);
    const [snapshot, feedHealth] = await Promise.all([
      getNbaPlayerImpactSnapshot(),
      getNbaPlayerImpactFeedHealth()
    ]);
    const canEvaluateGame = Boolean((awayTeam && homeTeam) || team);
    const truth = awayTeam && homeTeam
      ? await getNbaLineupTruth({ awayTeam, homeTeam, gameTime })
      : team
        ? await getNbaLineupTruth({ awayTeam: team, homeTeam: team, gameTime })
        : null;

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      feed: {
        ...feedHealth,
        sourceCounts: sourceCounts(snapshot),
        sampleTeams: sampleTeams(snapshot),
        samplePlayers: samplePlayersForTeam(snapshot, team ?? homeTeam ?? awayTeam)
      },
      query: {
        awayTeam,
        homeTeam,
        team,
        gameTime,
        canEvaluateGame
      },
      lineupTruth: truth,
      verdict: routeVerdict({ truth, feedHealthStatus: feedHealth.status, canEvaluateGame }),
      instructions: {
        envNeeded: "Set NBA_PLAYER_IMPACT_URL or NBA_INJURY_IMPACT_URL in Vercel Production/Preview and redeploy.",
        actionRule: "Only LINEUP_TRUTH_GREEN with feed.status GREEN should allow NBA action. RED must force PASS; YELLOW must force WATCH/noBet.",
        exampleTeamCheck: "/api/simulation/nba/lineup-truth?team=Boston%20Celtics",
        exampleGameCheck: "/api/simulation/nba/lineup-truth?away=Boston%20Celtics&home=Chicago%20Bulls&gameTime=2026-05-03T20:00:00.000Z"
      }
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      generatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "NBA lineup truth check failed.",
      verdict: "LINEUP_TRUTH_ROUTE_ERROR_PASS"
    }, { status: 500 });
  }
}
