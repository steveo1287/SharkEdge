import { NextResponse } from "next/server";

import { buildMlbPregameContextTrends } from "@/services/mlb/mlb-pregame-context-layer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

function readDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const payload = await buildMlbPregameContextTrends({ date: readDate(url.searchParams.get("date")) });
  return NextResponse.json(payload, { status: 200 });
}
