import { NextResponse } from "next/server";

import { ingestUpcomingUfcCards } from "@/services/ufc/upcoming-card-ingestion";
import { buildUfcModelFeaturesFromWarehouse } from "@/services/ufc/fighter-feature-auto-builder";
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

function boolParam(url: URL, name: string, fallback = false) {
  const value = url.searchParams.get(name);
  if (value == null) return fallback;
  return value === "1" || value === "true" || value === "yes";
}

export async function GET(request: Request) {
  return POST(request);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized", required: process.env.UFC_ADMIN_RUN_TOKEN ? "valid token" : "?confirm=load-upcoming" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = boolParam(url, "dryRun", false);
  const skipIngest = boolParam(url, "skipIngest", false);
  const hydrate = url.searchParams.get("hydrate") !== "0";
  const autoBuildFeatures = url.searchParams.get("autoBuildFeatures") !== "0";
  const simulate = boolParam(url, "simulate", false);
  const includeMvp = url.searchParams.get("includeMvp") !== "0";
  const includeEspn = boolParam(url, "includeEspn", false);
  const includeTapology = boolParam(url, "includeTapology", false);
  const includeUfcCom = boolParam(url, "includeUfcCom", false);
  const allowFallbackFeatures = boolParam(url, "allowFallbackFeatures", false);
  const forceRegenerate = boolParam(url, "forceRegenerate", autoBuildFeatures || hydrate);
  const horizonDays = numberParam(url, "horizonDays", 120);
  const limit = numberParam(url, "limit", 25);
  const simulations = numberParam(url, "simulations", 25000);
  const seed = numberParam(url, "seed", 1287);

  try {
    const ingestion = skipIngest ? null : await ingestUpcomingUfcCards({ dryRun, includeUfcStats: true, includeUfcCom, includeEspn, includeTapology, includeMvp });
    const autoBuild = autoBuildFeatures ? await buildUfcModelFeaturesFromWarehouse({ dryRun, horizonDays, limit }) : null;
    const hydration = hydrate ? await hydrateUpcomingUfcFeatureSnapshots({ dryRun, horizonDays, limit }) : null;
    const sim = simulate ? await runUfcUpcomingToSimPipeline({ dryRun, skipIngest: true, horizonDays, limit, simulations, seed, recordShadow: true, allowFallbackFeatures, forceRegenerate }) : null;

    return NextResponse.json({
      ok: (!ingestion || Boolean((ingestion as any).ok)) && (!autoBuild || autoBuild.ok) && (!hydration || hydration.ok) && (!sim || sim.ok),
      mode: dryRun ? "dry-run" : "load",
      skippedIngest: skipIngest,
      config: { autoBuildFeatures, hydrate, simulate, allowFallbackFeatures, forceRegenerate, horizonDays, limit, simulations, seed },
      ingestion,
      autoBuild,
      hydration,
      sim,
      next: simulate ? "/sim/ufc" : "Run again with &simulate=1 after feature hydration if you want immediate SharkSim output."
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
