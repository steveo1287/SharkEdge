import { NextResponse } from "next/server";

import { getUfcPipelineStatus } from "@/services/ufc/pipeline-status";
import { hydrateUpcomingUfcFeatureSnapshots } from "@/services/ufc/upcoming-feature-hydration";
import { runUfcUpcomingToSimPipeline } from "@/services/ufc/upcoming-to-sim-pipeline";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function isAuthorized(request: Request) {
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;
  const cronSecret = process.env.CRON_SECRET?.trim();
  return Boolean(cronSecret && bearer === cronSecret);
}

function numberParam(url: URL, name: string, fallback: number) {
  const value = url.searchParams.get(name);
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolParam(url: URL, name: string, fallback = false) {
  const value = url.searchParams.get(name);
  if (value == null) return fallback;
  return value === "1" || value === "true" || value === "yes";
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  const url = new URL(request.url);
  const dryRun = boolParam(url, "dryRun", false);
  const hydrate = boolParam(url, "hydrate", true);
  const simulate = boolParam(url, "simulate", true);
  const allowFallbackFeatures = boolParam(url, "allowFallbackFeatures", false);
  const horizonDays = numberParam(url, "horizonDays", 120);
  const limit = numberParam(url, "limit", 25);
  const simulations = numberParam(url, "simulations", 25000);
  const seed = numberParam(url, "seed", 1287);

  try {
    const before = await getUfcPipelineStatus();
    const hydration = hydrate ? await hydrateUpcomingUfcFeatureSnapshots({ dryRun, horizonDays, limit }) : null;
    const pipeline = simulate
      ? await runUfcUpcomingToSimPipeline({
          dryRun,
          skipIngest: false,
          horizonDays,
          limit,
          simulations,
          seed,
          recordShadow: true,
          allowFallbackFeatures
        })
      : null;
    const after = await getUfcPipelineStatus();

    return NextResponse.json({
      ok: before.ok && (!hydration || hydration.ok) && (!pipeline || pipeline.ok) && after.ok,
      mode: dryRun ? "dry-run" : "autopilot",
      startedAt,
      finishedAt: new Date().toISOString(),
      config: { hydrate, simulate, allowFallbackFeatures, horizonDays, limit, simulations, seed },
      before,
      hydration,
      pipeline,
      after
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UFC autopilot failed";
    console.error("[cron/ufc-autopilot]", message);
    return NextResponse.json({ ok: false, error: message, startedAt, finishedAt: new Date().toISOString() }, { status: 500 });
  }
}
