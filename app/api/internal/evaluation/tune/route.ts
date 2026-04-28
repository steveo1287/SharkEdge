import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import {
  getCachedModelTuningProfile,
  rebuildModelTuningProfile
} from "@/services/evaluation/model-tuning-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const requestSchema = z.object({
  leagueKey: z.string().min(1).optional().nullable(),
  lookbackDays: z.number().int().min(1).max(365).optional().default(90),
  rebuildEvaluation: z.boolean().optional().default(false)
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
    const profile = await rebuildModelTuningProfile(parsed.data);
    return NextResponse.json({ ok: true, profile });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Model tuning rebuild failed";
    console.error("[evaluation/tune]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const leagueKey = url.searchParams.get("leagueKey");
  const lookbackDaysRaw = Number(url.searchParams.get("lookbackDays") ?? 90);
  const lookbackDays = Number.isFinite(lookbackDaysRaw) ? lookbackDaysRaw : 90;
  const profile = await getCachedModelTuningProfile({ leagueKey, lookbackDays });

  return NextResponse.json({
    ok: true,
    profile,
    endpoint: "POST /api/internal/evaluation/tune",
    body: {
      leagueKey: "optional league key, e.g. NBA",
      lookbackDays: "1-365, default 90",
      rebuildEvaluation: "boolean, default false"
    }
  });
}
