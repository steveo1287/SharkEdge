import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import { runMlbRetrainPipeline, getRetrainHistory, shouldRetrain } from "@/services/simulation/mlb-retrain-pipeline";
import { getCachedMlbMlModel } from "@/services/simulation/mlb-ml-training-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const retrainSchema = z.object({
  force: z.boolean().optional().default(false),
  reason: z.string().optional(),
});

export async function POST(request: Request) {
  const unauthorized = ensureInternalApiAccess(request);
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = retrainSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const result = await runMlbRetrainPipeline({
      force: parsed.data.force,
      reason: parsed.data.reason ?? "manual-api",
    });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[mlb/retrain]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const unauthorized = ensureInternalApiAccess(request);
  if (unauthorized) return unauthorized;

  try {
    const [history, currentModel, retrainNeeded] = await Promise.all([
      getRetrainHistory(10),
      getCachedMlbMlModel(),
      shouldRetrain(),
    ]);

    return NextResponse.json({
      ok: true,
      retrainNeeded,
      currentModel: currentModel
        ? {
            ok: currentModel.ok,
            trainedAt: currentModel.trainedAt,
            rows: currentModel.rows,
            sideAccuracy: currentModel.sideModel.accuracy,
            totalMae: currentModel.totalModel.mae,
            warning: currentModel.warning,
          }
        : null,
      recentRuns: history,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
