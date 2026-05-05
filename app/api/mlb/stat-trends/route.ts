import { NextResponse } from "next/server";

import { buildMlbStatBackedTrends } from "@/services/mlb/mlb-stat-trends";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

function readDate(value: string | null) {
  if (!value) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const payload = await buildMlbStatBackedTrends({ date: readDate(url.searchParams.get("date")) });
  return NextResponse.json(payload, { status: 200 });
}
