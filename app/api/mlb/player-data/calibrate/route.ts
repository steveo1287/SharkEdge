import { NextResponse } from "next/server";

import { calibrateMlbPlayerRatings, type MlbRatingCalibrationMode } from "@/services/players/mlb-player-rating-calibrator";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function modeFrom(value: string | null): MlbRatingCalibrationMode {
  return value === "write" ? "write" : "preview";
}

function seasonFrom(value: string | null) {
  const n = Number(value);
  return Number.isInteger(n) && n > 1800 ? n : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const data = await calibrateMlbPlayerRatings({
    mode: "preview",
    season: seasonFrom(url.searchParams.get("season")),
    source: url.searchParams.get("source")
  });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  let body: { mode?: string; season?: number | string | null; source?: string | null } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const data = await calibrateMlbPlayerRatings({
    mode: modeFrom(body.mode ?? url.searchParams.get("mode")),
    season: seasonFrom(String(body.season ?? url.searchParams.get("season") ?? "")),
    source: body.source ?? url.searchParams.get("source")
  });
  return NextResponse.json(data);
}
