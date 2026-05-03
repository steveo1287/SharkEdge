import { NextResponse } from "next/server";

import {
  captureNbaPropPredictionSnapshot,
  getOpenNbaPropPredictionSnapshotCount,
  gradeNbaPropPredictionSnapshots
} from "@/services/simulation/nba-prop-prediction-ledger";
import { gradeOpenNbaPropPredictionSnapshots } from "@/services/simulation/nba-prop-ledger-grader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function parseBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function GET() {
  const openCount = await getOpenNbaPropPredictionSnapshotCount();
  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    openCount,
    actions: ["capture", "grade", "gradeOpen"],
    instructions: {
      capture: "POST { action: 'capture', snapshot: { eventId, playerId, playerName, statKey, marketLine, sim, ... } }",
      grade: "POST { action: 'grade', grade: { eventId, playerId, statKey, actualValue, closingLine } }",
      gradeOpen: "POST { action: 'gradeOpen', limit: 250 }"
    }
  });
}

export async function POST(request: Request) {
  const body = await parseBody(request);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : null;
  if (action === "capture") {
    const snapshot = body.snapshot;
    if (!snapshot || typeof snapshot !== "object") {
      return NextResponse.json({ ok: false, error: "Missing snapshot object." }, { status: 400 });
    }
    const result = await captureNbaPropPredictionSnapshot(snapshot);
    return NextResponse.json({
      ...result,
      generatedAt: new Date().toISOString(),
      action: "capture"
    }, { status: result.ok ? 200 : 422 });
  }

  if (action === "grade") {
    const grade = body.grade;
    if (!grade || typeof grade !== "object") {
      return NextResponse.json({ ok: false, error: "Missing grade object." }, { status: 400 });
    }
    const result = await gradeNbaPropPredictionSnapshots(grade);
    return NextResponse.json({
      ...result,
      generatedAt: new Date().toISOString(),
      action: "grade"
    }, { status: result.ok ? 200 : 422 });
  }

  if (action === "gradeOpen") {
    const limit = typeof body.limit === "number" && Number.isFinite(body.limit) ? body.limit : 250;
    const result = await gradeOpenNbaPropPredictionSnapshots({ limit });
    return NextResponse.json({
      ...result,
      action: "gradeOpen"
    });
  }

  return NextResponse.json({
    ok: false,
    error: "Unsupported action. Use 'capture', 'grade', or 'gradeOpen'."
  }, { status: 400 });
}
