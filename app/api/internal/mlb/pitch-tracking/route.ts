import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import { ingestMlbPitchTracking, getRecentPitchLogs } from "@/services/stats/mlb-pitch-tracking-feed";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ingestSchema = z.object({
  gamePks: z.array(z.number().int().positive()).optional(),
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

  const parsed = ingestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const result = await ingestMlbPitchTracking(parsed.data);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[mlb/pitch-tracking]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const unauthorized = ensureInternalApiAccess(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const gamePkStr = url.searchParams.get("gamePk");

  if (gamePkStr) {
    const gamePk = parseInt(gamePkStr, 10);
    if (!Number.isFinite(gamePk)) {
      return NextResponse.json({ ok: false, error: "Invalid gamePk" }, { status: 400 });
    }
    try {
      const logs = await getRecentPitchLogs(gamePk);
      return NextResponse.json({ ok: true, gamePk, count: logs.length, logs });
    } catch (err) {
      return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    status: "MLB pitch tracking endpoint ready",
    endpoints: {
      "POST /api/internal/mlb/pitch-tracking": "Ingest pitch data for today's/recent games",
      "GET /api/internal/mlb/pitch-tracking?gamePk=<pk>": "Read pitch log for a specific game",
    },
    body: {
      gamePks: "optional array of game PKs — omit to auto-detect today's games",
    },
  });
}
