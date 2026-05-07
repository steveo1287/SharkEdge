import { NextResponse } from "next/server";
import { ingestMlbStatcastQuality } from "@/services/stats/mlb-statcast-ingestion";
import { ingestMlbPitchTracking } from "@/services/stats/mlb-pitch-tracking-feed";
import { refreshUmpireAssignments, seedMlbUmpireDb } from "@/services/simulation/mlb-umpire-db";
import { captureMlbClosingLines } from "@/services/mlb/mlb-closing-line-capture";
import { runMlbFeatureMonitor } from "@/services/simulation/mlb-feature-monitor";
import { runMlbRetrainPipeline } from "@/services/simulation/mlb-retrain-pipeline";
import { runMlbGameSpineIngestion } from "@/services/mlb/mlb-game-spine";
import { runMlbBettingWarehouseRefresh } from "@/services/mlb/mlb-betting-warehouse";
import { buildSpineEloSnapshots } from "@/services/mlb/mlb-spine-elo-builder";
import { getMlbLineupLock } from "@/services/simulation/mlb-lineup-locks";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function isAuthorized(request: Request) {
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  const cronSecret = process.env.CRON_SECRET?.trim();
  const apiKey = process.env.INTERNAL_API_KEY?.trim();
  const xApiKey = request.headers.get("x-api-key")?.trim();
  if (!cronSecret && !apiKey) return true;
  return Boolean(
    (cronSecret && bearer === cronSecret) ||
    (apiKey && xApiKey === apiKey)
  );
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const step = url.searchParams.get("step");

  // Allow running individual steps via ?step=<name>
  if (step) {
    return runSingleStep(step);
  }

  // Full pipeline run
  const started = Date.now();
  const results: Record<string, unknown> = {};
  const warnings: string[] = [];

  // 1. Game spine (schedule + results)
  try {
    results.gameSpine = await runMlbGameSpineIngestion();
  } catch (err) {
    warnings.push(`gameSpine: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2. Umpire assignments (daily refresh)
  try {
    await seedMlbUmpireDb();
    results.umpireAssignments = await refreshUmpireAssignments();
  } catch (err) {
    warnings.push(`umpireAssignments: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3. Statcast ingestion + pitch tracking (parallel)
  try {
    const [statcast, pitchTracking] = await Promise.all([
      ingestMlbStatcastQuality({ lookbackDays: 2 }),
      ingestMlbPitchTracking(),
    ]);
    results.statcast = statcast;
    results.pitchTracking = pitchTracking;
  } catch (err) {
    warnings.push(`statcastAndPitching: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 4. Closing line capture
  try {
    results.closingLines = await captureMlbClosingLines({ windowBeforeMinutes: 90, windowAfterMinutes: 180 });
  } catch (err) {
    warnings.push(`closingLines: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 5. Feature monitoring
  try {
    results.featureMonitor = await runMlbFeatureMonitor();
  } catch (err) {
    warnings.push(`featureMonitor: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 6. Auto-retrain check (non-blocking, fails silently on low row count)
  try {
    results.retrain = await runMlbRetrainPipeline({ reason: "mlb-pipeline-cron" });
  } catch (err) {
    warnings.push(`retrain: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 7. Betting warehouse refresh — rebuilds mlb_trend_rows for the trends browser
  try {
    results.bettingWarehouse = await runMlbBettingWarehouseRefresh();
  } catch (err) {
    warnings.push(`bettingWarehouse: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 8. Spine Elo builder — populates retrosheet tables + mlb_team_elo_snapshots from spine game results
  try {
    results.spineElo = await buildSpineEloSnapshots();
  } catch (err) {
    warnings.push(`spineElo: ${err instanceof Error ? err.message : String(err)}`);
  }

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - started,
    results,
    warnings,
  });
}

async function runSingleStep(step: string) {
  try {
    switch (step) {
      case "game-spine":
        return NextResponse.json({ ok: true, result: await runMlbGameSpineIngestion() });
      case "umpire":
        return NextResponse.json({ ok: true, result: { seed: await seedMlbUmpireDb(), assignments: await refreshUmpireAssignments() } });
      case "statcast":
        return NextResponse.json({ ok: true, result: await ingestMlbStatcastQuality({ lookbackDays: 3 }) });
      case "pitch-tracking":
        return NextResponse.json({ ok: true, result: await ingestMlbPitchTracking() });
      case "closing-lines":
        return NextResponse.json({ ok: true, result: await captureMlbClosingLines({ force: true }) });
      case "feature-monitor":
        return NextResponse.json({ ok: true, result: await runMlbFeatureMonitor() });
      case "retrain":
        return NextResponse.json({ ok: true, result: await runMlbRetrainPipeline({ force: true, reason: "manual" }) });
      case "warehouse":
        return NextResponse.json({ ok: true, result: await runMlbBettingWarehouseRefresh() });
      case "spine-elo":
        return NextResponse.json({ ok: true, result: await buildSpineEloSnapshots() });
      case "lineup-test": {
        const lock = await getMlbLineupLock("New York Yankees", "Boston Red Sox");
        return NextResponse.json({ ok: true, result: lock });
      }
      default:
        return NextResponse.json({ ok: false, error: `Unknown step: ${step}`, validSteps: ["game-spine", "umpire", "statcast", "pitch-tracking", "closing-lines", "feature-monitor", "retrain", "warehouse", "spine-elo", "lineup-test"] }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
