import { NextResponse } from "next/server";
import { rebuildModelEvaluationReport } from "@/services/evaluation/model-evaluation-service";
import { rebuildModelTuningProfile } from "@/services/evaluation/model-tuning-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function isAuthorized(request: Request) {
  const apiKey = process.env.INTERNAL_API_KEY?.trim();
  const cronSecret = process.env.CRON_SECRET?.trim();
  const providedApiKey = request.headers.get("x-api-key")?.trim();
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;

  if (!apiKey && !cronSecret) return true;
  return Boolean((apiKey && providedApiKey === apiKey) || (cronSecret && bearer === cronSecret));
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const leagueKey = url.searchParams.get("leagueKey") ?? "NBA";
  const lookbackDaysRaw = Number(url.searchParams.get("lookbackDays") ?? 90);
  const lookbackDays = Number.isFinite(lookbackDaysRaw) ? Math.max(1, Math.min(365, lookbackDaysRaw)) : 90;

  try {
    const evaluation = await rebuildModelEvaluationReport({ leagueKey, lookbackDays });
    const tuning = await rebuildModelTuningProfile({ leagueKey, lookbackDays, rebuildEvaluation: false });

    return NextResponse.json({
      ok: true,
      job: "model-lab",
      leagueKey,
      lookbackDays,
      evaluation: {
        generatedAt: evaluation.generatedAt,
        playerPropSample: evaluation.playerProps.sample,
        playerPropHitRate: evaluation.playerProps.hitRate,
        playerPropBrier: evaluation.playerProps.brier,
        avgClvLine: evaluation.playerProps.avgClvLine,
        eventSample: evaluation.events.sample,
        winnerAccuracy: evaluation.events.winnerAccuracy,
        warnings: evaluation.guardrails.warnings
      },
      tuning: {
        generatedAt: tuning.generatedAt,
        profileKey: tuning.profileKey,
        ruleCount: Object.keys(tuning.rules).length,
        defaultAction: tuning.defaultRule.action,
        warnings: tuning.guardrails.warnings
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Model lab job failed";
    console.error("[cron/model-lab]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
