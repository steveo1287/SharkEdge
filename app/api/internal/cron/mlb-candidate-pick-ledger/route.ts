import { NextResponse } from "next/server";

import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import { backfillMlbCandidatePickLedger } from "@/services/simulation/mlb-candidate-pick-ledger";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function boolParam(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["1", "true", "yes"].includes(value.toLowerCase());
  return false;
}

function intParam(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value ?? fallback);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, Math.round(numeric))) : fallback;
}

async function parseBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function run(request: Request) {
  const unauthorized = ensureInternalApiAccess(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const body = request.method === "POST" ? await parseBody(request) : {};
  const limit = intParam(url.searchParams.get("limit") ?? body.limit, 5000, 1, 10000);
  const dryRun = boolParam(url.searchParams.get("dryRun") ?? body.dryRun);

  try {
    const result = await backfillMlbCandidatePickLedger({ limit, dryRun });
    return NextResponse.json({ ok: result.ok, result }, { status: result.ok ? 200 : 500 });
  } catch (error) {
    console.error("MLB candidate pick ledger backfill failed:", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
