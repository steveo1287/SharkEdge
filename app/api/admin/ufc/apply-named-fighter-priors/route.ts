import { NextResponse } from "next/server";

import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import { applyNamedUfcFighterEraPriors } from "@/services/ufc/named-fighter-era-priors";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";
export const maxDuration = 180;

function parseBool(value: string | null, fallback = false) {
  if (value == null) return fallback;
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
  const result = await applyNamedUfcFighterEraPriors({
    modelVersion: url.searchParams.get("modelVersion") ?? undefined,
    limit: parseIntParam(url.searchParams.get("limit"), 500, 1, 5000),
    dryRun: parseBool(url.searchParams.get("dryRun"), true),
    only: url.searchParams.get("only")
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function POST(request: Request) {
  return GET(request);
}
