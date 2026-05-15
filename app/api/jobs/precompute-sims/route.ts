import { precomputeActivePropSims } from "@/services/simulation/sim-precompute";
import { runStatsPipelinePreflight } from "@/services/ops/stats-pipeline-preflight";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

function boolParam(value: string | null, fallback = false) {
  if (value == null) return fallback;
  return !["0", "false", "no", "off"].includes(value.toLowerCase());
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const statsPipeline = await runStatsPipelinePreflight({
    source: "jobs-precompute-sims",
    force: boolParam(url.searchParams.get("statsForce"), false),
    enabled: boolParam(url.searchParams.get("statsPreflight"), true),
    runMlb: boolParam(url.searchParams.get("runMlb"), true),
    runUfc: boolParam(url.searchParams.get("runUfc"), true),
    includeLineups: boolParam(url.searchParams.get("includeLineups"), true),
    mlbLookbackDays: Number(url.searchParams.get("mlbLookbackDays") ?? 45),
    mlbLimit: Number(url.searchParams.get("mlbLimit") ?? 1500),
    ufcLimit: Number(url.searchParams.get("ufcLimit") ?? 50),
    modelVersion: url.searchParams.get("modelVersion") ?? "ufc-fight-iq-v1"
  }).catch((error) => ({
    ok: false,
    attempted: false,
    skipped: false,
    reason: "preflight-error",
    error: error instanceof Error ? error.message : "unknown stats preflight error"
  }));

  const metrics = await precomputeActivePropSims();
  const ok = Boolean(statsPipeline.ok);

  return Response.json({
    status: ok ? "ok" : "partial",
    ok,
    statsPipeline,
    metrics
  }, { status: ok ? 200 : 207 });
}
