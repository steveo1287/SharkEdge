import { NextResponse } from "next/server";

import { getNbaFullStatHealthSummary } from "@/services/simulation/nba-full-stat-health-summary";

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
  const includeModelOnly = parseBoolean(url.searchParams.get("includeModelOnly"), true);
  const take = parseNumber(url.searchParams.get("take"), 1000);

  const summary = await getNbaFullStatHealthSummary({
    eventId,
    includeModelOnly,
    take
  });

  return NextResponse.json({
    ...summary,
    query: {
      eventId,
      includeModelOnly,
      take
    }
  });
}
