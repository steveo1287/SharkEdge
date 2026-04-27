import { NextResponse } from "next/server";

import { compareMlbProfiles, getMlbTeamProfile } from "@/services/simulation/mlb-team-analytics";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function configured(name: string) {
  return Boolean(process.env[name]?.trim());
}

function getParam(request: Request, key: string, fallback: string) {
  const url = new URL(request.url);
  return url.searchParams.get(key)?.trim() || fallback;
}

export async function GET(request: Request) {
  const away = getParam(request, "away", "Chicago Cubs");
  const home = getParam(request, "home", "St. Louis Cardinals");
  const [awayProfile, homeProfile, comparison] = await Promise.all([
    getMlbTeamProfile(away),
    getMlbTeamProfile(home),
    compareMlbProfiles(away, home)
  ]);

  const realFeedFlowing = awayProfile.source === "real" || homeProfile.source === "real";

  return NextResponse.json({
    ok: true,
    checkedMatchup: { away, home },
    environment: {
      MLB_TEAM_ANALYTICS_URL: configured("MLB_TEAM_ANALYTICS_URL")
    },
    realFeedFlowing,
    profiles: {
      away: awayProfile,
      home: homeProfile
    },
    matchupComparison: comparison,
    interpretation: realFeedFlowing
      ? "Real MLB team analytics feed is flowing into the simulation engine."
      : "MLB model is using synthetic fallback data. Configure MLB_TEAM_ANALYTICS_URL and redeploy for real analytics."
  });
}
