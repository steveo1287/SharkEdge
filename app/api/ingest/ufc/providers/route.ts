import { NextResponse } from "next/server";

import { buildUfcCompositeProviderSnapshot, ingestUfcCompositeProviderPayload } from "@/services/ufc/provider-ingestion";

function isAuthorized(request: Request) {
  const configured = process.env.INTERNAL_API_KEY?.trim();
  if (!configured) return true;
  const key = request.headers.get("x-api-key")?.trim() ?? request.headers.get("authorization")?.replace(/^bearer\s+/i, "").trim();
  return key === configured;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "POST /api/ingest/ufc/providers",
    validateOnlyHeader: "x-validate-only: 1",
    flow: "odds/api card + stat snapshots + opponent strength + manual scouting -> composite UFC real-data snapshot -> warehouse"
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
    const snapshot = buildUfcCompositeProviderSnapshot(body as any);
    if (request.headers.get("x-validate-only") === "1") {
      return NextResponse.json({ ok: true, validateOnly: true, summary: { sourceKey: snapshot.sourceKey, fights: snapshot.fights.length, fighters: snapshot.fights.length * 2 } });
    }
    return NextResponse.json(await ingestUfcCompositeProviderPayload(body as any));
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "UFC provider ingest failed" }, { status: 400 });
  }
}
