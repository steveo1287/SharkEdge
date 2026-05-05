import { NextResponse } from "next/server";

import { getMlbIntelV7HealthReport } from "@/services/simulation/mlb-intel-v7-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseLimit(value: string | null) {
  const numeric = Number(value ?? 60);
  return Number.isFinite(numeric) ? Math.max(1, Math.min(60, Math.round(numeric))) : 60;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const result = await getMlbIntelV7HealthReport(parseLimit(searchParams.get("limit")));
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
