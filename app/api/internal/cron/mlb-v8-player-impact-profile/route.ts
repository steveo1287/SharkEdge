import { NextResponse } from "next/server";

import {
  fitAndPersistMlbV8PlayerImpactProfile,
  getActiveMlbV8PlayerImpactProfile
} from "@/services/simulation/mlb-v8-player-impact-profile";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function isAuthorized(request: Request) {
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;
  return bearer === cronSecret;
}

function parseLimit(value: string | null) {
  const numeric = Number(value ?? 2000);
  return Number.isFinite(numeric) ? Math.max(50, Math.min(10000, Math.round(numeric))) : 2000;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseLimit(searchParams.get("limit"));
  const fit = await fitAndPersistMlbV8PlayerImpactProfile(limit);
  const active = await getActiveMlbV8PlayerImpactProfile();

  return NextResponse.json({
    ok: Boolean(fit.ok),
    fit,
    active
  });
}
