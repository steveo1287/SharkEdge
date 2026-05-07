import { NextResponse } from "next/server";
import { buildSpineEloSnapshots } from "@/services/mlb/mlb-spine-elo-builder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(request: Request) {
  const apiKey = process.env.INTERNAL_API_KEY?.trim();
  const xKey = request.headers.get("x-api-key")?.trim();
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!apiKey && !cronSecret) return true;
  return Boolean((apiKey && xKey === apiKey) || (cronSecret && bearer === cronSecret));
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, description: "POST to this endpoint to build spine Elo snapshots from final spine game results." });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  try {
    const result = await buildSpineEloSnapshots();
    return NextResponse.json({ ok: true, durationMs: Date.now() - started, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message, durationMs: Date.now() - started }, { status: 500 });
  }
}
