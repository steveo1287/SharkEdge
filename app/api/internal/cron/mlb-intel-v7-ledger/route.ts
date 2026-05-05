import { NextResponse } from "next/server";

import {
  captureCurrentMlbIntelV7Ledgers,
  getMlbIntelV7LedgerSummary,
  gradeMlbIntelV7Ledgers
} from "@/services/simulation/mlb-intel-v7-ledgers";
import { updateMlbIntelV7ClosingLines } from "@/services/simulation/mlb-intel-v7-closing-lines";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function isAuthorized(request: Request) {
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;
  return bearer === cronSecret;
}

function parseLimit(value: string | null) {
  const numeric = Number(value ?? 60);
  return Number.isFinite(numeric) ? Math.max(1, Math.min(60, Math.round(numeric))) : 60;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseLimit(searchParams.get("limit"));

  const capture = await captureCurrentMlbIntelV7Ledgers();
  const closingLines = await updateMlbIntelV7ClosingLines(limit);
  const grade = await gradeMlbIntelV7Ledgers();
  const summary = await getMlbIntelV7LedgerSummary(90);

  return NextResponse.json({
    ok: Boolean(capture.ok && closingLines.ok && grade.ok && summary.ok),
    capture,
    closingLines,
    grade,
    summary
  });
}
