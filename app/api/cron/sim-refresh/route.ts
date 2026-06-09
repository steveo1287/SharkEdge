import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

function isAuthorized(request: Request) {
  if (request.headers.get("x-vercel-cron") === "1") return true;
  const acceptedSecrets = [
    process.env.CRON_SECRET?.trim(),
    process.env.INTERNAL_API_KEY?.trim(),
    process.env.INTERNAL_API_KEY2?.trim()
  ].filter((value): value is string => Boolean(value));
  if (!acceptedSecrets.length) return false;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const apiKey = request.headers.get("x-api-key")?.trim();
  return Boolean((bearer && acceptedSecrets.includes(bearer)) || (apiKey && acceptedSecrets.includes(apiKey)));
}

function boolParam(value: string | null, fallback = false) {
  if (value == null) return fallback;
  return !["0", "false", "no", "off"].includes(value.toLowerCase());
}

function numberParam(value: string | null, fallback: number) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const url = new URL(request.url);
  console.info("[sim-refresh] started");

  const { runStatsPipelinePreflight } = await import("@/services/ops/stats-pipeline-preflight");
  const { refreshFullSimSnapshots } = await import("@/services/simulation/sim-snapshot-service");

  const statsPipeline = await runStatsPipelinePreflight({
    source: "cron-sim-refresh",
    force: boolParam(url.searchParams.get("statsForce"), false),
    enabled: boolParam(url.searchParams.get("statsPreflight"), true),
    minAgeMinutes: numberParam(url.searchParams.get("statsGuardMinutes"), Number(process.env.STATS_PIPELINE_GUARD_MINUTES ?? 360)),
    runMlb: boolParam(url.searchParams.get("runMlb"), true),
    runUfc: boolParam(url.searchParams.get("runUfc"), false),
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

  const result = await refreshFullSimSnapshots().catch((error) => ({
    ok: false,
    skippedSnapshotWrites: false,
    warnings: [error instanceof Error ? error.message : "unknown full sim refresh error"]
  }));

  const mainMlb = {
    ok: true,
    skipped: true,
    reason: "covered-by-full-sim-refresh",
    rowCount: "summary" in result ? result.summary?.mlbCount ?? 0 : 0
  };

  const elapsedMs = Date.now() - startedAt;
  const ok = Boolean(statsPipeline.ok && result.ok && mainMlb.ok);
  console.info(`[sim-refresh] completed ${elapsedMs}ms ok=${ok} statsPreflight=${statsPipeline.ok} mainMlb=${mainMlb.ok} rows=${mainMlb.rowCount}`);

  return NextResponse.json({
    ok,
    queued: false,
    mainBrain: "mlb-intel-v8-player-impact+mlb-intel-v7-calibration",
    startedAt: new Date(startedAt).toISOString(),
    elapsedMs,
    statsPipeline,
    result,
    mainMlb
  }, { status: ok ? 200 : 207 });
}
