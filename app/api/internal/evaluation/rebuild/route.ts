import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import {
  getCachedModelEvaluationReports,
  rebuildModelEvaluationReport
} from "@/services/evaluation/model-evaluation-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const requestSchema = z.object({
  leagueKey: z.string().min(1).optional().nullable(),
  lookbackDays: z.number().int().min(1).max(365).optional().default(90)
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

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const report = await rebuildModelEvaluationReport(parsed.data);
    return NextResponse.json({ ok: true, report });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Model evaluation rebuild failed";
    console.error("[evaluation/rebuild]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  const reports = await getCachedModelEvaluationReports();
  return NextResponse.json({
    ok: true,
    reports,
    endpoint: "POST /api/internal/evaluation/rebuild",
    body: {
      leagueKey: "optional league key, e.g. NBA",
      lookbackDays: "1-365, default 90"
    }
  });
}
