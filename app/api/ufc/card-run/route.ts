import { NextResponse } from "next/server";

import { buildUfcOperationalCardRunPlan, runUfcOperationalCard } from "@/services/ufc/card-runner";

function isAuthorized(request: Request) {
  const configured = process.env.INTERNAL_API_KEY?.trim();
  if (!configured) return true;
  const key = request.headers.get("x-api-key")?.trim() ?? request.headers.get("authorization")?.replace(/^bearer\s+/i, "").trim();
  return key === configured;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "POST /api/ufc/card-run",
    modes: ["plan", "run"],
    flow: "real-data card snapshot -> warehouse ingest -> skill Markov sim per fight -> cached prediction feed"
  });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    if (body.mode === "plan") {
      return NextResponse.json({ ok: true, plannedFights: buildUfcOperationalCardRunPlan(body.snapshot) });
    }
    const result = await runUfcOperationalCard(body.snapshot, {
      simulations: asNumber(body.simulations),
      seed: asNumber(body.seed),
      recordShadow: Boolean(body.recordShadow)
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "UFC card run failed" }, { status: 500 });
  }
}
