import { NextResponse } from "next/server";

import { syncCompleteUfcProfilesToSimFeatures } from "@/services/ufc/complete-profile-feature-sync";
import { fillUfcFighterProfileGaps } from "@/services/ufc/fighter-profile-gap-fill";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function yes(value: string | null, fallback = false) {
  if (value == null) return fallback;
  return ["1", "true", "yes", "y"].includes(value.toLowerCase());
}

function intParam(value: string | null, fallback: number, min: number, max: number) {
  const parsed = value ? Number(value) : fallback;
  return Math.max(min, Math.min(max, Number.isFinite(parsed) ? Math.floor(parsed) : fallback));
}

function allowed(request: Request) {
  const url = new URL(request.url);
  const secret = process.env.UFC_ADMIN_RUN_TOKEN?.trim();
  if (secret) return url.searchParams.get("token") === secret || request.headers.get("x-ufc-admin-token") === secret;
  return url.searchParams.get("confirm") === "profile-gap-fill";
}

export async function GET(request: Request) {
  if (!allowed(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const dryRun = yes(url.searchParams.get("dryRun"));
  const upcomingOnly = yes(url.searchParams.get("upcomingOnly"), true);
  const writeFightFeatures = yes(url.searchParams.get("writeFightFeatures"), true);
  const skipSync = yes(url.searchParams.get("skipSync"));
  const horizonDays = intParam(url.searchParams.get("horizonDays"), 180, 1, 365);
  const limit = intParam(url.searchParams.get("limit"), 300, 1, 5000);
  const modelVersion = url.searchParams.get("modelVersion") || "ufc-fight-iq-v1";
  const startedAt = new Date().toISOString();

  try {
    const gapFill = await fillUfcFighterProfileGaps({ dryRun, upcomingOnly, writeFightFeatures, horizonDays, limit });
    const sync = skipSync ? null : await syncCompleteUfcProfilesToSimFeatures({ dryRun, horizonDays, limit: Math.min(limit, 500), modelVersion });
    const ok = Boolean(gapFill.ok) && (!sync || Boolean(sync.ok));
    return NextResponse.json({ ok, startedAt, finishedAt: new Date().toISOString(), config: { dryRun, upcomingOnly, writeFightFeatures, skipSync, horizonDays, limit, modelVersion }, gapFill, sync }, { status: ok ? 200 : 500 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error), startedAt, finishedAt: new Date().toISOString() }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
