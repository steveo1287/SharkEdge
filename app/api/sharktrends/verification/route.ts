import { NextResponse } from "next/server";

import { buildTrendVerificationPayload } from "@/services/trends/trend-verification";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseIntParam(value: string | null, fallback: number, min: number, max: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback;
}

function parseBool(value: string | null) {
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const league = (url.searchParams.get("league") ?? "ALL").toUpperCase();
  const market = (url.searchParams.get("market") ?? "ALL").toLowerCase();
  const limit = parseIntParam(url.searchParams.get("limit"), 250, 1, 1000);
  const requireCurrentAttachment = parseBool(url.searchParams.get("requireCurrentAttachment"));

  const payload = await buildTrendVerificationPayload({ league, market, limit, requireCurrentAttachment });
  return NextResponse.json({ ok: true, ...payload });
}
