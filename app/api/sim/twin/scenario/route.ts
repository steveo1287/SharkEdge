import { NextResponse } from "next/server";

import { getSimTwinScenario } from "@/services/sim/sim-twin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function readBody(request: Request) {
  return request.json().catch(() => ({} as Record<string, unknown>));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const league = url.searchParams.get("league") ?? "NBA";
  const gameId = url.searchParams.get("gameId") ?? "";
  const scenario = url.searchParams.get("scenario") ?? "MARKET_LINE_MOVE";

  const result = await getSimTwinScenario({ league, gameId, scenario });
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}

export async function POST(request: Request) {
  const body = await readBody(request);
  const result = await getSimTwinScenario({
    league: typeof body.league === "string" ? body.league : "NBA",
    gameId: typeof body.gameId === "string" ? body.gameId : "",
    scenario: typeof body.scenario === "string" ? body.scenario : "MARKET_LINE_MOVE"
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}
