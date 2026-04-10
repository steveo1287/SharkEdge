import { NextResponse } from "next/server";

import { listDiscoveredTrendSystems } from "@/services/trends/discovered-systems";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const league = searchParams.get("league") ?? undefined;
  const tier = searchParams.get("tier") ?? undefined;
  const limit = Number(searchParams.get("limit") ?? "24");
  const activeOnly = searchParams.get("activeOnly") === "true";

  const payload = await listDiscoveredTrendSystems({
    league,
    tier,
    limit: Number.isFinite(limit) ? Math.max(1, Math.min(60, limit)) : 24,
    activeOnly
  });

  return NextResponse.json({
    systems: payload
  });
}
