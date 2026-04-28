import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import { ingestTeamStats } from "@/services/stats/team-stats-ingestion";
import { ingestNbaAvailability } from "@/services/stats/nba-availability-ingestion";
import { refreshTeamPowerRatings } from "@/services/stats/team-power-ratings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const requestSchema = z.object({
  leagues: z.array(z.enum(["MLB", "NBA"])).optional(),
  lookbackDays: z.number().int().min(1).max(60).optional(),
  includeAvailability: z.boolean().optional().default(true),
  lookaheadDays: z.number().int().min(1).max(7).optional().default(3),
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

  const {
    leagues = ["MLB", "NBA"],
    lookbackDays = 14,
    includeAvailability,
    lookaheadDays,
    refreshPowerRatings,
    powerLookbackGames
  } = parsed.data;

  try {
    const results = await ingestTeamStats({ leagues, lookbackDays });
    const availability = includeAvailability && leagues.includes("NBA")
      ? await ingestNbaAvailability({ lookaheadDays })
      : null;
    const powerRatings = refreshPowerRatings
      ? await Promise.all(leagues.map((leagueKey) => refreshTeamPowerRatings({ leagueKey, lookbackGames: powerLookbackGames })))
      : [];

    let totalOk = 0;
    for (const r of Object.values(results)) {
      totalOk += (r as { ok?: number })?.ok ?? 0;
    }

    return NextResponse.json({
      ok: true,
      leagues,
      lookbackDays,
      includeAvailability,
      lookaheadDays,
      refreshPowerRatings,
      powerLookbackGames,
      totalRecordsWritten: totalOk,
      results,
      availability,
      powerRatings
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stats ingest failed";
    console.error("[ingest/stats]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    status: "Stats ingest endpoint is ready",
    endpoint: "POST /api/internal/ingest/stats",
    auth: process.env.INTERNAL_API_KEY ? "x-api-key required" : "open (no INTERNAL_API_KEY set)",
    body: {
      leagues: "string[] — 'MLB' | 'NBA' (default: both)",
      lookbackDays: "number — 1-60 (default: 14)",
      includeAvailability: "boolean — also ingest NBA availability/injuries (default: true)",
      lookaheadDays: "number — 1-7 for upcoming availability scan (default: 3)",
      refreshPowerRatings: "boolean — refresh NBA/MLB team power ratings after stat ingest (default: true)",
      powerLookbackGames: "number — 5-30 recent games per team for power ratings (default: 12)"
    }
  });
}
