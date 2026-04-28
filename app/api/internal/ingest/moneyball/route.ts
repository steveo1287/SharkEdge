import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import { refreshNbaMoneyballMetrics } from "@/services/stats/nba-moneyball-metrics";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const requestSchema = z.object({
  lookbackGames: z.number().int().min(5).max(30).optional().default(12)
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
    const result = await refreshNbaMoneyballMetrics(parsed.data);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "NBA Moneyball metrics refresh failed";
    console.error("[ingest/moneyball]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    status: "NBA Moneyball metrics endpoint is ready",
    endpoint: "POST /api/internal/ingest/moneyball",
    auth: process.env.INTERNAL_API_KEY ? "x-api-key required" : "open (no INTERNAL_API_KEY set)",
    body: {
      lookbackGames: "number — 5-30 recent games per player/team, default 12"
    }
  });
}
