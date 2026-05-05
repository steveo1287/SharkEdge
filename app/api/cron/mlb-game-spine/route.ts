import { NextResponse } from "next/server";

import { runMlbGameSpineIngestion } from "@/services/mlb/mlb-game-spine";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function tokenFromRequest(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const header = request.headers.get("x-cron-secret") ?? request.headers.get("x-ingest-secret") ?? "";
  const url = new URL(request.url);
  const query = url.searchParams.get("secret") ?? "";
  return bearer || header || query;
}

function isAuthorized(request: Request) {
  const expected = process.env.CRON_SECRET ?? process.env.INGEST_SECRET ?? process.env.ODDS_API_IO_INGEST_SECRET;
  if (!expected) return false;
  return tokenFromRequest(request) === expected;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized MLB game spine refresh." }, { status: 401 });
  }
  const result = await runMlbGameSpineIngestion();
  return NextResponse.json(result.ok ? { ok: true, ...result } : { ok: false, ...result }, { status: result.ok ? 200 : 500 });
}
