import { NextResponse } from "next/server";

import { buildSmartWatchlist } from "@/services/trends/smart-watchlist";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseIntParam(value: string | null, fallback: number, min: number, max: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const savedBy = url.searchParams.get("savedBy") ?? "default";
  const league = (url.searchParams.get("league") ?? "ALL").toUpperCase();
  const market = (url.searchParams.get("market") ?? "ALL").toLowerCase();
  const limit = parseIntParam(url.searchParams.get("limit"), 100, 1, 500);

  const payload = await buildSmartWatchlist({ savedBy, league, market, limit });
  return NextResponse.json({ ok: true, ...payload });
}
