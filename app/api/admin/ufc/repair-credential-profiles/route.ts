import { NextResponse } from "next/server";

import { repairUfcCredentialProfiles } from "@/services/ufc/fighter-profile-credential-repair";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";
export const maxDuration = 180;

function authorized(request: Request) {
  const url = new URL(request.url);
  const token = process.env.UFC_ADMIN_RUN_TOKEN?.trim() || process.env.INTERNAL_API_KEY?.trim() || process.env.CRON_SECRET?.trim();
  if (!token) return url.searchParams.get("confirm") === "repair-credential-profiles";
  const bearer = request.headers.get("authorization")?.replace(/^bearer\s+/i, "").trim();
  return request.headers.get("x-api-key") === token || url.searchParams.get("token") === token || bearer === token;
}

function boolParam(url: URL, name: string, fallback: boolean) {
  const value = url.searchParams.get(name);
  if (value == null) return fallback;
  return value === "1" || value === "true" || value === "yes";
}

function numberParam(url: URL, name: string, fallback: number, min: number, max: number) {
  const parsed = Number(url.searchParams.get(name) ?? fallback);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const modelVersion = url.searchParams.get("modelVersion") ?? undefined;
  const horizonDays = numberParam(url, "horizonDays", 180, 1, 365);
  const limit = numberParam(url, "limit", 200, 1, 500);
  const dryRun = boolParam(url, "dryRun", true);
  const result = await repairUfcCredentialProfiles({ modelVersion, horizonDays, limit, dryRun });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function POST(request: Request) {
  return GET(request);
}
