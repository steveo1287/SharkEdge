import { NextResponse } from "next/server";

import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import { lockUpcomingUfcPicks } from "@/services/ufc/pick-lock";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

function intParam(url: URL, name: string, fallback: number, min: number, max: number) {
  const value = Number(url.searchParams.get(name) ?? fallback);
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback;
}

export async function GET(request: Request) {
  const authError = ensureInternalApiAccess(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const result = await lockUpcomingUfcPicks({
    modelVersion: url.searchParams.get("modelVersion") ?? undefined,
    windowMinutes: intParam(url, "windowMinutes", 15, 3, 60),
    limit: intParam(url, "limit", 40, 1, 100),
    simulations: intParam(url, "simulations", 10_000, 1_000, 50_000),
    seed: intParam(url, "seed", 1287, 1, 2_147_483_647)
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 207 });
}
