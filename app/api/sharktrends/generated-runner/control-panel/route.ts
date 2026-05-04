import { NextResponse } from "next/server";

import { buildGeneratedTrendControlPanel } from "@/services/trends/generated-trend-control-panel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseIntParam(value: string | null, fallback: number, min: number, max: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = parseIntParam(url.searchParams.get("limit"), 25, 1, 100);
  const payload = await buildGeneratedTrendControlPanel(limit);
  return NextResponse.json({ ok: true, ...payload });
}
