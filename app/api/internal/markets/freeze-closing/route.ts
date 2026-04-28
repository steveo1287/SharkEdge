import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import { freezeClosingLines } from "@/services/market-data/closing-line-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const requestSchema = z.object({
  leagueKey: z.string().min(1).optional().nullable(),
  windowBeforeMinutes: z.number().int().min(0).max(360).optional().default(30),
  windowAfterMinutes: z.number().int().min(0).max(360).optional().default(90),
  force: z.boolean().optional().default(false)
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
    const result = await freezeClosingLines(parsed.data);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Closing-line freeze failed";
    console.error("[markets/freeze-closing]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    status: "Closing-line freeze endpoint is ready",
    endpoint: "POST /api/internal/markets/freeze-closing",
    auth: process.env.INTERNAL_API_KEY ? "x-api-key required" : "open (no INTERNAL_API_KEY set)",
    body: {
      leagueKey: "optional league key, e.g. NBA",
      windowBeforeMinutes: "freeze events starting within this many minutes, default 30",
      windowAfterMinutes: "also freeze recently started events, default 90",
      force: "overwrite existing closing lines, default false"
    }
  });
}
