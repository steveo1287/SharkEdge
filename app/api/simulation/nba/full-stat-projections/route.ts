import { NextResponse } from "next/server";

import { getNbaFullStatProjectionView } from "@/services/simulation/nba-full-stat-projection-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseBoolean(value: string | null, fallback: boolean) {
  if (value === null) return fallback;
  if (["false", "0", "no"].includes(value.toLowerCase())) return false;
  if (["true", "1", "yes"].includes(value.toLowerCase())) return true;
  return fallback;
}

function parseNumber(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const eventId = url.searchParams.get("eventId") ?? null;
  const playerId = url.searchParams.get("playerId") ?? null;
  const includeModelOnly = parseBoolean(url.searchParams.get("includeModelOnly"), true);
  const take = parseNumber(url.searchParams.get("take"), 750);

  const view = await getNbaFullStatProjectionView({
    eventId,
    playerId,
    includeModelOnly,
    take
  });

  return NextResponse.json({
    ...view,
    query: {
      eventId,
      playerId,
      includeModelOnly,
      take
    },
    statOrder: ["PTS", "REB", "AST", "3PM", "STL", "BLK", "TOV", "PRA", "PR", "PA", "RA"],
    displayRule: "Render modelOnly=true rows as model forecast tiles. Only show market edge/probability when marketLine exists."
  });
}
