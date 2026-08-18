import { NextResponse } from "next/server";

import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import { reconcileUfcPickLedger } from "@/services/ufc/pick-ledger-reconcile";
import { runUfcResultSettlement } from "@/services/ufc/result-settlement";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

function boolParam(url: URL, name: string, fallback = false) {
  const value = url.searchParams.get(name);
  if (value == null) return fallback;
  return value === "1" || value === "true" || value === "yes";
}

function intParam(url: URL, name: string, fallback: number, min: number, max: number) {
  const value = Number(url.searchParams.get(name) ?? fallback);
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : fallback;
}

export async function GET(request: Request) {
  const authError = ensureInternalApiAccess(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const modelVersion = url.searchParams.get("modelVersion") ?? undefined;
  const settlement = await runUfcResultSettlement({
    modelVersion,
    discoverCompleted: boolParam(url, "discoverCompleted", true),
    eventLimit: intParam(url, "eventLimit", 3, 1, 10),
    learningLimit: intParam(url, "learningLimit", 100, 1, 500),
    rebuildProfiles: boolParam(url, "rebuildProfiles", false)
  });
  const ledger = await reconcileUfcPickLedger({
    modelVersion,
    horizonDays: intParam(url, "horizonDays", 365, 7, 730),
    lockGraceMinutes: intParam(url, "lockGraceMinutes", 2, 0, 15),
    targetCardDate: url.searchParams.get("targetCardDate") ?? undefined
  });

  const ok = settlement.ok && ledger.ok && ledger.recordMatchesExpectedSaturday;
  return NextResponse.json({ ok, settlement, ledger }, { status: ok ? 200 : 207 });
}
