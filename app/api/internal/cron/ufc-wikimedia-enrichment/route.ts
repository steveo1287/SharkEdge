import { NextResponse } from "next/server";

import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import { runWikimediaFighterEnrichment } from "@/services/ufc/wikimedia-fighter-enrichment";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

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
  const result = await runWikimediaFighterEnrichment({
    limit: parseIntParam(url.searchParams.get("limit"), 50, 1, 200),
    offset: parseIntParam(url.searchParams.get("offset"), 0, 0, 100_000),
    dryRun: parseBool(url.searchParams.get("dryRun")),
    rebuildProfiles: parseBool(url.searchParams.get("rebuildProfiles")),
    modelVersion: url.searchParams.get("modelVersion") ?? undefined,
    horizonDays: parseIntParam(url.searchParams.get("horizonDays"), 180, 1, 365)
  });

  return NextResponse.json(result);
}
