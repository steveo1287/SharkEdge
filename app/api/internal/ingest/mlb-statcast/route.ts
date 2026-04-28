import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import { ingestMlbStatcastQuality } from "@/services/stats/mlb-statcast-ingestion";
import { refreshTeamPowerRatings } from "@/services/stats/team-power-ratings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const requestSchema = z.object({
  lookbackDays: z.number().int().min(1).max(14).optional().default(7),
  refreshPowerRatings: z.boolean().optional().default(true),
  powerLookbackGames: z.number().int().min(5).max(30).optional().default(12)
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
    const result = await ingestMlbStatcastQuality({ lookbackDays: parsed.data.lookbackDays });
    const powerRatings = parsed.data.refreshPowerRatings
      ? await refreshTeamPowerRatings({ leagueKey: "MLB", lookbackGames: parsed.data.powerLookbackGames })
      : null;

    return NextResponse.json({ ok: true, result, powerRatings });
  } catch (err) {
    const message = err instanceof Error ? err.message : "MLB Statcast ingest failed";
    console.error("[ingest/mlb-statcast]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    status: "MLB Statcast quality endpoint is ready",
    endpoint: "POST /api/internal/ingest/mlb-statcast",
    auth: process.env.INTERNAL_API_KEY ? "x-api-key required" : "open (no INTERNAL_API_KEY set)",
    body: {
      lookbackDays: "number — 1-14 days of Statcast pitch-level CSV data (default: 7)",
      refreshPowerRatings: "boolean — refresh MLB power ratings after Statcast enrichment (default: true)",
      powerLookbackGames: "number — 5-30 recent games per team for power ratings (default: 12)"
    }
  });
}
