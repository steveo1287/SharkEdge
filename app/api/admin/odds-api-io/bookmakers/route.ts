import { NextResponse } from "next/server";

import { defaultOddsApiIoBookmakers, OddsApiIoClient } from "@/services/data-providers/odds-api-io/client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function tokenFromRequest(request: Request, input?: URLSearchParams | Record<string, unknown>) {
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const header = request.headers.get("x-ingest-secret") ?? request.headers.get("x-cron-secret") ?? "";
  const query = input instanceof URLSearchParams ? input.get("secret") ?? "" : input?.secret ? String(input.secret) : "";
  return bearer || header || query;
}

function expectedSecret() {
  return process.env.ODDS_API_IO_INGEST_SECRET ?? process.env.CRON_SECRET ?? process.env.INGEST_SECRET ?? "";
}

function isAuthorized(request: Request, input?: URLSearchParams | Record<string, unknown>) {
  const expected = expectedSecret();
  return Boolean(expected) && tokenFromRequest(request, input) === expected;
}

function parseBookmakers(value: unknown) {
  const raw = String(value ?? defaultOddsApiIoBookmakers());
  return raw.split(",").map((book) => book.trim()).filter(Boolean).slice(0, 2).join(",");
}

export async function GET() {
  try {
    const client = new OddsApiIoClient();
    if (!client.isConfigured()) return NextResponse.json({ ok: false, configured: false, error: "ODDS_API_IO_KEY is not configured." }, { status: 500 });
    const selected = await client.getSelectedBookmakers();
    return NextResponse.json({ ok: true, configured: true, selected: selected.data, meta: selected.meta });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not read selected bookmakers." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const url = new URL(request.url);
  const input = { ...body, secret: body.secret ?? url.searchParams.get("secret") ?? undefined };
  if (!isAuthorized(request, input)) {
    return NextResponse.json({ ok: false, error: "Unauthorized Odds-API.io bookmaker selection update." }, { status: 401 });
  }

  const bookmakers = parseBookmakers(body.bookmakers ?? url.searchParams.get("bookmakers"));
  try {
    const client = new OddsApiIoClient();
    if (!client.isConfigured()) return NextResponse.json({ ok: false, configured: false, error: "ODDS_API_IO_KEY is not configured." }, { status: 500 });
    const before = await client.getSelectedBookmakers();
    const cleared = await client.clearSelectedBookmakers();
    const selected = await client.selectBookmakers(bookmakers);
    const after = await client.getSelectedBookmakers();
    return NextResponse.json({
      ok: true,
      configured: true,
      bookmakers,
      before: before.data,
      clearStatus: cleared.meta.status,
      selectStatus: selected.meta.status,
      after: after.data
    });
  } catch (error) {
    return NextResponse.json({ ok: false, bookmakers, error: error instanceof Error ? error.message : "Could not update selected bookmakers." }, { status: 500 });
  }
}
