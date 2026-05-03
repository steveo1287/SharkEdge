import { NextResponse } from "next/server";

import { getNbaLineupTruth } from "@/services/simulation/nba-lineup-truth";
import { getNbaPlayerImpactSnapshot } from "@/services/simulation/nba-player-impact";
import { normalizeNbaTeam } from "@/services/simulation/nba-team-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function configured(name: string) {
  return Boolean(process.env[name]?.trim());
}

function configuredName() {
  if (configured("NBA_PLAYER_IMPACT_URL")) return "NBA_PLAYER_IMPACT_URL";
  if (configured("NBA_INJURY_IMPACT_URL")) return "NBA_INJURY_IMPACT_URL";
  return null;
}

function minutesOld(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.round((Date.now() - date.getTime()) / 60000);
}

function getQuery(request: Request) {
  const url = new URL(request.url);
  const awayTeam = url.searchParams.get("away")?.trim() || url.searchParams.get("awayTeam")?.trim() || null;
  const homeTeam = url.searchParams.get("home")?.trim() || url.searchParams.get("homeTeam")?.trim() || null;
  const team = url.searchParams.get("team")?.trim() || null;
  const gameTime = url.searchParams.get("gameTime")?.trim() || null;
  return { awayTeam, homeTeam, team, gameTime };
}

function countPlayers(snapshot: Awaited<ReturnType<typeof getNbaPlayerImpactSnapshot>>) {
  if (!snapshot?.teams) return 0;
  return Object.values(snapshot.teams).reduce((total, rows) => total + rows.length, 0);
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

export async function GET(request: Request) {
  try {
    const { awayTeam, homeTeam, team, gameTime } = getQuery(request);
    const snapshot = await getNbaPlayerImpactSnapshot();
    const envName = configuredName();
    const hasFeedUrl = Boolean(envName);
    const playerCount = countPlayers(snapshot);
    const teamCount = Object.keys(snapshot?.teams ?? {}).length;
    const lastUpdatedAt = snapshot?.lastUpdatedAt ?? null;
    const ageMinutes = minutesOld(lastUpdatedAt);
    const feedFlowing = Boolean(snapshot && teamCount > 0 && playerCount > 0);
    const feedFresh = typeof ageMinutes === "number" && ageMinutes <= 90;
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
        hasFeedUrl,
        configuredEnv: envName,
        feedFlowing,
        feedFresh,
        lastUpdatedAt,
        ageMinutes,
        teamCount,
        playerCount,
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
      verdict: truth
        ? truth.status === "GREEN"
          ? "LINEUP_TRUTH_GREEN"
          : truth.status === "YELLOW"
            ? "LINEUP_TRUTH_WATCH_ONLY"
            : "LINEUP_TRUTH_PASS"
        : feedFlowing
          ? "FEED_FLOWING_ADD_TEAM_QUERY_TO_EVALUATE_LINEUP_TRUTH"
          : hasFeedUrl
            ? "FEED_CONFIGURED_BUT_NOT_FLOWING"
            : "NO_INJURY_FEED_URL_CONFIGURED",
      instructions: {
        envNeeded: "Set NBA_PLAYER_IMPACT_URL or NBA_INJURY_IMPACT_URL in Vercel Production/Preview and redeploy.",
        exampleTeamCheck: "/api/simulation/nba/lineup-truth?team=Boston%20Celtics",
        exampleGameCheck: "/api/simulation/nba/lineup-truth?away=Boston%20Celtics&home=Chicago%20Bulls&gameTime=2026-05-03T20:00:00.000Z"
      }
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      generatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "NBA lineup truth check failed."
    }, { status: 500 });
  }
}
