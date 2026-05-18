import { NextResponse } from "next/server";

import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import { applyActiveNamedPriorBatch } from "@/services/ufc/active-named-fighter-prior-apply";
import { ACTIVE_UFC_NAMED_FIGHTER_PRIOR_BATCH_1F } from "@/services/ufc/active-named-fighter-prior-batch1f";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";
export const maxDuration = 180;

function parseBool(value: string | null, fallback = false) {
  if (value == null) return fallback;
  return value === "1" || value === "true" || value === "yes";
}

function parseIntParam(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
}

export async function GET(request: Request) {
  const authError = ensureInternalApiAccess(request);
  if (authError) return authError;
  const url = new URL(request.url);
  const result = await applyActiveNamedPriorBatch({
    batch: "1F",
    priors: ACTIVE_UFC_NAMED_FIGHTER_PRIOR_BATCH_1F,
    modelVersion: url.searchParams.get("modelVersion") ?? undefined,
    limit: parseIntParam(url.searchParams.get("limit"), 500, 1, 5000),
    dryRun: parseBool(url.searchParams.get("dryRun"), true),
    activeOnly: parseBool(url.searchParams.get("activeOnly"), true),
    only: url.searchParams.get("only")
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function POST(request: Request) {
  return GET(request);
}
