import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import { ingestNbaSynergyPlaytypes } from "@/services/stats/nba-synergy-playtype-ingestion";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const requestSchema = z.object({
  season: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  seasonType: z.string().min(1).optional().default("Regular Season"),
  entityTypes: z.array(z.enum(["player", "team"])).optional(),
  sides: z.array(z.enum(["offense", "defense"])).optional(),
  playTypes: z.array(z.string().min(1)).optional()
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
    const result = await ingestNbaSynergyPlaytypes(parsed.data);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "NBA Synergy playtype ingest failed";
    console.error("[ingest/synergy]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    status: "NBA Synergy-style playtype ingest endpoint is ready",
    endpoint: "POST /api/internal/ingest/synergy",
    auth: process.env.INTERNAL_API_KEY ? "x-api-key required" : "open (no INTERNAL_API_KEY set)",
    body: {
      season: "optional NBA season, e.g. 2025-26",
      seasonType: "Regular Season | Playoffs",
      entityTypes: "optional ['player', 'team']",
      sides: "optional ['offense', 'defense']",
      playTypes: "optional play type list such as Isolation, Transition, Spotup, PRBallHandler"
    }
  });
}
