import { NextResponse } from "next/server";

import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import { enrichMlbMarketAuditSnapshots } from "@/services/sim/mlb-market-audit-snapshot-enrichment";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseLimit(req: Request) {
  const { searchParams } = new URL(req.url);
  const value = Number(searchParams.get("limit") ?? 150);
  return Number.isFinite(value) ? Math.max(1, Math.min(500, Math.round(value))) : 150;
}

export async function GET(req: Request) {
  const unauthorized = ensureInternalApiAccess(req);
  if (unauthorized) return unauthorized;

  const result = await enrichMlbMarketAuditSnapshots(parseLimit(req));
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}

export async function POST(req: Request) {
  return GET(req);
}
