import { NextResponse } from "next/server";

import { getMlbDataApiDebugPayload } from "@/services/mlb/mlb-data-api-feed";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const team = searchParams.get("team") || "Chicago Cubs";
  const payload = await getMlbDataApiDebugPayload(team);

  return NextResponse.json({
    ...payload,
    interpretation: payload.ok
      ? "MLB Data API roster/projection data is flowing into SharkEdge player profiles."
      : "MLB Data API did not return usable player profiles for this team. Check team name mapping, endpoint availability, or MLB_DATA_API_BASE_URL."
  });
}
