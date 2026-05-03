import { NextResponse } from "next/server";

import {
  ingestUfcRealDataSnapshot,
  normalizeUfcRealDataSnapshot
} from "@/services/ufc/real-data-ingestion";

function isAuthorized(request: Request) {
  const configured = process.env.INTERNAL_API_KEY?.trim();
  if (!configured) return true;
  const key = request.headers.get("x-api-key")?.trim() ?? request.headers.get("authorization")?.replace(/^bearer\s+/i, "").trim();
  return key === configured;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "POST /api/ingest/ufc/real-data",
    validateOnlyHeader: "x-validate-only: 1",
    flow: "structured source snapshot -> normalized UFC warehouse payload -> warehouse ingest"
  });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const normalized = normalizeUfcRealDataSnapshot(body as any);
    if (request.headers.get("x-validate-only") === "1") {
      return NextResponse.json({
        ok: true,
        validateOnly: true,
        summary: {
          fighters: normalized.fighters.length,
          fights: normalized.fights.length,
          modelFeatures: normalized.modelFeatures.length
        }
      });
    }
    return NextResponse.json(await ingestUfcRealDataSnapshot(body as any));
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "UFC real-data ingest failed" }, { status: 400 });
  }
}
