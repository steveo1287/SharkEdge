import { NextResponse } from "next/server";

import {
  captureNbaWinnerLedgerSnapshotForEvent,
  getNbaWinnerCalibrationReport,
  gradeNbaWinnerLedgerForEvent
} from "@/services/simulation/nba-winner-ledger";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? "5000");
  const report = await getNbaWinnerCalibrationReport({ limit: Number.isFinite(limit) ? limit : 5000 });
  return NextResponse.json(report);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const eventId = typeof body.eventId === "string" ? body.eventId : null;
  const action = typeof body.action === "string" ? body.action : "capture";
  if (!eventId) {
    return NextResponse.json({ ok: false, error: "eventId is required" }, { status: 400 });
  }
  if (action === "grade") {
    const result = await gradeNbaWinnerLedgerForEvent(eventId);
    return NextResponse.json({ ok: true, action, result });
  }
  const result = await captureNbaWinnerLedgerSnapshotForEvent(eventId);
  return NextResponse.json({ ok: true, action: "capture", result });
}
