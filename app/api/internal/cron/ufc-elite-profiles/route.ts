import { NextResponse } from "next/server";

import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import { buildEliteUfcFighterProfiles } from "@/services/ufc/elite-fighter-profile-builder";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 180;

function parseBool(value: string | null) {
  return value === "1" || value === "true" || value === "yes";
}

function parseIntParam(value: string | null, fallback: number, min: number, max: number) {
  const numeric = Number(value ?? fallback);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, Math.round(numeric))) : fallback;
}

export async function GET(request: Request) {
  const authError = ensureInternalApiAccess(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const result = await buildEliteUfcFighterProfiles({
    modelVersion: url.searchParams.get("modelVersion") ?? undefined,
    limit: parseIntParam(url.searchParams.get("limit"), 2500, 1, 5000),
    horizonDays: parseIntParam(url.searchParams.get("horizonDays"), 180, 1, 365),
    dryRun: parseBool(url.searchParams.get("dryRun"))
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 207 });
}
