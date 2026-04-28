import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import { buildMlbStarterLineupLock } from "@/services/simulation/mlb-starter-lineup-lock";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const requestSchema = z.object({
  eventId: z.string().min(1),
  homeTeamId: z.string().min(1),
  awayTeamId: z.string().min(1)
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
    const result = await buildMlbStarterLineupLock(parsed.data);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "MLB starter lineup lock failed";
    console.error("[mlb/starter-lineup-lock]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    status: "MLB starter/lineup lock endpoint is ready",
    endpoint: "POST /api/internal/mlb/starter-lineup-lock",
    body: {
      eventId: "event id",
      homeTeamId: "home team id",
      awayTeamId: "away team id"
    }
  });
}
