import { NextResponse } from "next/server";

import { ingestUpcomingUfcCards } from "@/services/ufc/upcoming-card-ingestion";
import { hydrateUpcomingUfcFeatureSnapshots } from "@/services/ufc/upcoming-feature-hydration";
import { runUfcUpcomingToSimPipeline } from "@/services/ufc/upcoming-to-sim-pipeline";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request: Request) {
  const url = new URL(request.url);
  const envSecret = process.env.UFC_ADMIN_RUN_TOKEN;
  if (envSecret) return url.searchParams.get("token") === envSecret || request.headers.get("x-ufc-admin-token") === envSecret;
  return url.searchParams.get("confirm") === "load-upcoming";
}

function numberParam(url: URL, name: string, fallback: number) {
  const value = url.searchParams.get(name);
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: Request) {
  return POST(request);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized", required: process.env.UFC_ADMIN_RUN_TOKEN ? "valid token" : "?confirm=load-upcoming" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1" || url.searchParams.get("dryRun") === "true";
  const hydrate = url.searchParams.get("hydrate") !== "0";
  const simulate = url.searchParams.get("simulate") === "1" || url.searchParams.get("simulate") === "true";
  const allowFallbackFeatures = url.searchParams.get("allowFallbackFeatures") === "1" || url.searchParams.get("allowFallbackFeatures") === "true";
  const horizonDays = numberParam(url, "horizonDays", 120);
  const limit = numberParam(url, "limit", 25);

  try {
    const ingestion = await ingestUpcomingUfcCards({ dryRun, includeUfcStats: true });
    const hydration = hydrate ? await hydrateUpcomingUfcFeatureSnapshots({ dryRun, horizonDays, limit }) : null;
    const sim = simulate ? await runUfcUpcomingToSimPipeline({ dryRun, skipIngest: true, horizonDays, limit, recordShadow: true, allowFallbackFeatures }) : null;

    return NextResponse.json({
      ok: Boolean((ingestion as any).ok) && (!hydration || hydration.ok) && (!sim || sim.ok),
      mode: dryRun ? "dry-run" : "load",
      ingestion,
      hydration,
      sim,
      next: simulate ? "/sharkfights/ufc" : "Run again with &simulate=1 after feature hydration if you want immediate SharkSim output."
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
