import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import { refreshMlbFeatureProfiles } from "@/services/stats/mlb-feature-profiles";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const requestSchema = z.object({
  lookbackGames: z.number().int().min(5).max(30).optional().default(12),
  qualityLookbackDays: z.number().int().min(1).max(60).optional().default(7)
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
    const result = await refreshMlbFeatureProfiles(parsed.data);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "MLB feature profile refresh failed";
    console.error("[mlb/feature-profiles]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    status: "MLB feature profile endpoint is ready",
    endpoint: "POST /api/internal/mlb/feature-profiles",
    body: {
      lookbackGames: "5-30 recent games per team/player, default 12",
      qualityLookbackDays: "1-60 days for data quality audit, default 7"
    }
  });
}
