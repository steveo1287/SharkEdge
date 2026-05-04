import { NextResponse } from "next/server";

import { buildHistoricalTrendAudit } from "@/services/trends/historical-trend-audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseIntParam(value: string | null, fallback: number, min: number, max: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const league = (url.searchParams.get("league") ?? "ALL").toUpperCase();
  const startDate = url.searchParams.get("startDate") ?? undefined;
  const endDate = url.searchParams.get("endDate") ?? undefined;
  const limit = parseIntParam(url.searchParams.get("limit"), 5000, 1, 50000);
  const sampleLimit = parseIntParam(url.searchParams.get("sampleLimit"), 100, 1, 1000);

  const payload = await buildHistoricalTrendAudit({ league, startDate, endDate, limit, sampleLimit });
  return NextResponse.json({ ok: true, ...payload });
}
