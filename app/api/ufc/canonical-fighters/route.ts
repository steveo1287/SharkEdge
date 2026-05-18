import { NextResponse } from "next/server";

import { getCanonicalUfcFighterProfiles } from "@/services/ufc/canonical-fighter-profile-query";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function intParam(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const report = await getCanonicalUfcFighterProfiles({
    limit: intParam(url.searchParams.get("limit"), 250, 1, 1000),
    status: url.searchParams.get("status"),
    q: url.searchParams.get("q")
  });
  return NextResponse.json(report, { status: report.ok ? 200 : 500 });
}
