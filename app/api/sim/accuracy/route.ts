import { NextResponse } from "next/server";

import {
  captureCurrentSimPredictionSnapshots,
  getSimAccuracySummary,
  gradeFinalSimPredictionSnapshots,
  runSimAccuracyLedgerJob
} from "@/services/simulation/sim-accuracy-ledger";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Action = "summary" | "capture" | "grade" | "run";

function parseAction(value: string | null): Action {
  if (value === "capture" || value === "grade" || value === "run") return value;
  return "summary";
}

function parseLimit(value: string | null) {
  const numeric = Number(value ?? 20);
  return Number.isFinite(numeric) ? Math.max(1, Math.min(100, numeric)) : 20;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = parseAction(searchParams.get("action"));
  const limit = parseLimit(searchParams.get("limit"));

  if (action === "capture") {
    const result = await captureCurrentSimPredictionSnapshots();
    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  }

  if (action === "grade") {
    const result = await gradeFinalSimPredictionSnapshots();
    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  }

  if (action === "run") {
    const result = await runSimAccuracyLedgerJob();
    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  }

  const summary = await getSimAccuracySummary(limit);
  return NextResponse.json(summary, { status: summary.ok ? 200 : 503 });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const action = parseAction(typeof body.action === "string" ? body.action : "run");

  if (action === "capture") {
    const result = await captureCurrentSimPredictionSnapshots();
    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  }

  if (action === "grade") {
    const result = await gradeFinalSimPredictionSnapshots();
    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  }

  const result = await runSimAccuracyLedgerJob();
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
