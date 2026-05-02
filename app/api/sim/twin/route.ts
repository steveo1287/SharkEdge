import { NextResponse } from "next/server";

import { getSimTwin, listSimTwins } from "@/services/sim/sim-twin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function readNumber(value: string | null) {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const league = url.searchParams.get("league") ?? "ALL";
  const gameId = url.searchParams.get("gameId");

  if (gameId) {
    const result = await getSimTwin({ league, gameId });
    return NextResponse.json(result, { status: result.ok ? 200 : 404 });
  }

  const result = await listSimTwins({
    league,
    limit: readNumber(url.searchParams.get("limit"))
  });
  return NextResponse.json(result);
}
