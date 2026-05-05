import { NextResponse } from "next/server";

import { getMlbV8PromotionReport } from "@/services/simulation/mlb-v8-promotion-comparator";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseWindowDays(value: string | null) {
  const numeric = Number(value ?? 180);
  return Number.isFinite(numeric) ? Math.max(1, Math.min(3650, Math.round(numeric))) : 180;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const report = await getMlbV8PromotionReport(parseWindowDays(searchParams.get("windowDays")));
  return NextResponse.json(report, { status: report.ok ? 200 : 503 });
}
