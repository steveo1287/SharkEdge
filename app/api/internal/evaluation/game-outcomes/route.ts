import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import { rebuildGameOutcomeCalibration } from "@/services/evaluation/game-outcome-calibration-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const requestSchema = z.object({
  leagueKey: z.string().min(1).default("MLB"),
  lookbackDays: z.number().int().min(14).max(730).optional().default(180)
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
    return NextResponse.json({ ok: false, error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const result = await rebuildGameOutcomeCalibration(parsed.data);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Game outcome calibration failed";
    console.error("[evaluation/game-outcomes]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    status: "Game outcome calibration endpoint is ready",
    endpoint: "POST /api/internal/evaluation/game-outcomes",
    body: {
      leagueKey: "MLB, NBA, etc. default MLB",
      lookbackDays: "14-730, default 180"
    }
  });
}
