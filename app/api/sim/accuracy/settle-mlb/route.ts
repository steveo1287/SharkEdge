import { NextResponse } from "next/server";

import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import { settleMlbSimPredictionSnapshots } from "@/services/simulation/mlb-snapshot-settlement";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function limitFrom(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") ?? 1000);
  return Number.isFinite(limit) ? Math.max(1, Math.min(1000, Math.round(limit))) : 1000;
}

function olderThanHoursFrom(req: Request) {
  const { searchParams } = new URL(req.url);
  const hours = Number(searchParams.get("olderThanHours") ?? 1);
  return Number.isFinite(hours) ? Math.max(1, Math.min(168, Math.round(hours))) : 1;
}

export async function GET(req: Request) {
  const unauthorized = ensureInternalApiAccess(req);
  if (unauthorized) return unauthorized;

  const result = await settleMlbSimPredictionSnapshots({
    limit: limitFrom(req),
    olderThanHours: olderThanHoursFrom(req)
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}

export async function POST(req: Request) {
  return GET(req);
}
