import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import { rebuildEloRatings } from "@/services/ratings/elo-rating-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const requestSchema = z.object({
  leagueKey: z.string().min(1).default("MLB"),
  lookbackDays: z.number().int().min(7).max(3650).optional().default(365),
  baseRating: z.number().min(1000).max(2000).optional().default(1500),
  homeFieldElo: z.number().min(0).max(150).optional(),
  kFactor: z.number().min(4).max(60).optional()
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
    const result = await rebuildEloRatings(parsed.data);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Elo rebuild failed";
    console.error("[ratings/elo]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    status: "Elo rating endpoint is ready",
    endpoint: "POST /api/internal/ratings/elo",
    body: {
      leagueKey: "MLB, NBA, etc. default MLB",
      lookbackDays: "7-3650, default 365",
      baseRating: "1000-2000, default 1500",
      homeFieldElo: "optional override; MLB default 24, NBA default 55",
      kFactor: "optional override; MLB default 18, NBA default 20"
    }
  });
}
