import { NextResponse } from "next/server";

import { getUfcFighterProfileQaReport } from "@/services/ufc/fighter-profile-qa";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function numberParam(url: URL, name: string, fallback: number, min: number, max: number) {
  const parsed = Number(url.searchParams.get(name) ?? fallback);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const modelVersion = url.searchParams.get("modelVersion") ?? undefined;
  const horizonDays = numberParam(url, "horizonDays", 180, 1, 365);
  const limit = numberParam(url, "limit", 200, 1, 500);
  const report = await getUfcFighterProfileQaReport({ modelVersion, horizonDays, limit });
  return NextResponse.json(report, { status: report.ok ? 200 : 500 });
}
