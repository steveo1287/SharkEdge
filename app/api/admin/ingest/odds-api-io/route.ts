import { NextResponse } from "next/server";

import { ingestOddsApiIo } from "@/services/ingestion/odds-api-io-ingestion";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseBool(value: unknown, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  return value === true || value === "1" || value === "true" || value === "yes" || value === "on";
}

function parseIntValue(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback;
}

function parseOptions(input: URLSearchParams | Record<string, unknown>) {
  const get = (key: string) => input instanceof URLSearchParams ? input.get(key) : input[key];
  return {
    sport: String(get("sport") ?? "baseball"),
    league: get("league") ? String(get("league")).toUpperCase() : undefined,
    status: get("status") ? String(get("status")) : undefined,
    from: get("from") ? String(get("from")) : undefined,
    to: get("to") ? String(get("to")) : undefined,
    bookmaker: get("bookmaker") ? String(get("bookmaker")) : undefined,
    bookmakers: get("bookmakers") ? String(get("bookmakers")) : undefined,
    eventLimit: parseIntValue(get("eventLimit"), 10, 1, 50),
    dryRun: parseBool(get("dryRun"), true)
  };
}

function tokenFromRequest(request: Request, input: URLSearchParams | Record<string, unknown>) {
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const header = request.headers.get("x-ingest-secret") ?? request.headers.get("x-cron-secret") ?? "";
  const query = input instanceof URLSearchParams ? input.get("secret") ?? "" : input.secret ? String(input.secret) : "";
  return bearer || header || query;
}

function expectedSecret() {
  return process.env.ODDS_API_IO_INGEST_SECRET ?? process.env.CRON_SECRET ?? process.env.INGEST_SECRET ?? "";
}

function authorizedForWrite(request: Request, input: URLSearchParams | Record<string, unknown>, dryRun: boolean) {
  if (dryRun) return true;
  const expected = expectedSecret();
  if (!expected) return false;
  return tokenFromRequest(request, input) === expected;
}

async function execute(request: Request, input: URLSearchParams | Record<string, unknown>) {
  const options = parseOptions(input);
  if (!authorizedForWrite(request, input, options.dryRun)) {
    return NextResponse.json({ ok: false, error: "Unauthorized Odds-API.io write ingestion. Use dryRun=true or provide ODDS_API_IO_INGEST_SECRET, CRON_SECRET, or INGEST_SECRET." }, { status: 401 });
  }

  try {
    const result = await ingestOddsApiIo(options);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Odds-API.io ingestion failed." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  return execute(request, url.searchParams);
}

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  return execute(request, body);
}
