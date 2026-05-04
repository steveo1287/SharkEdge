import { NextResponse } from "next/server";

import { buildMarketIntelligencePayload } from "@/services/trends/market-intelligence";

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
  const date = url.searchParams.get("date") ?? undefined;
  const limitEvents = parseIntParam(url.searchParams.get("limitEvents"), 100, 1, 300);

  const payload = await buildMarketIntelligencePayload({ league, date, limitEvents });
  return NextResponse.json({ ok: true, ...payload });
}
