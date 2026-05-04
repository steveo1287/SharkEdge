import { NextResponse } from "next/server";

import { ingestOddsApiIo } from "@/services/ingestion/odds-api-io-ingestion";

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
  const expected = process.env.CRON_SECRET ?? process.env.ODDS_API_IO_INGEST_SECRET ?? process.env.INGEST_SECRET;
  if (!expected) return false;
  return tokenFromRequest(request) === expected;
}

function parseIntParam(value: string | null, fallback: number, min: number, max: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized cron ingestion. Set CRON_SECRET or ODDS_API_IO_INGEST_SECRET." }, { status: 401 });
  }

  const url = new URL(request.url);
  const eventLimit = parseIntParam(url.searchParams.get("eventLimit"), 15, 1, 40);
  const status = url.searchParams.get("status") ?? "upcoming";
  const bookmakers = url.searchParams.get("bookmakers") ?? undefined;

  try {
    const result = await ingestOddsApiIo({
      sport: "baseball",
      league: "MLB",
      status,
      eventLimit,
      bookmakers,
      dryRun: false
    });
    return NextResponse.json({ ok: true, mode: "cron", league: "MLB", ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, mode: "cron", league: "MLB", error: error instanceof Error ? error.message : "MLB odds cron failed." }, { status: 500 });
  }
}
