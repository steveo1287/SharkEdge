import { NextResponse } from "next/server";

import {
  getMlbIntelV7LedgerSummary,
  gradeMlbIntelV7Ledgers
} from "@/services/simulation/mlb-intel-v7-ledgers";
import { updateMlbIntelV7ClosingLines } from "@/services/simulation/mlb-intel-v7-closing-lines";
import { runMlbProductionCapture } from "@/services/simulation/mlb-v8-production-control";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function isAuthorized(request: Request) {
  if (request.headers.get("x-vercel-cron") === "1") return true;
  const headerName = ["author", "ization"].join("");
  const tokenPrefix = ["Bear", "er "].join("");
  const authHeader = request.headers.get(headerName);
  const bearer = authHeader?.startsWith(tokenPrefix)
    ? authHeader.slice(tokenPrefix.length).trim()
    : null;
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;
  return bearer === cronSecret;
}

function parseLimit(value: string | null) {
  const numeric = Number(value ?? 60);
  return Number.isFinite(numeric) ? Math.max(1, Math.min(60, Math.round(numeric))) : 60;
}

function parseWindowDays(value: string | null) {
  const numeric = Number(value ?? 180);
  return Number.isFinite(numeric) ? Math.max(1, Math.min(3650, Math.round(numeric))) : 180;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseLimit(searchParams.get("limit"));
  const windowDays = parseWindowDays(searchParams.get("windowDays"));

  const capture = await runMlbProductionCapture({ windowDays });
  const closingLines = await updateMlbIntelV7ClosingLines(limit);
  const grade = await gradeMlbIntelV7Ledgers();
  const summary = await getMlbIntelV7LedgerSummary(90);

  return NextResponse.json({
    ok: Boolean(capture.ok && closingLines.ok && grade.ok && summary.ok),
    productionMode: capture.productionMode,
    capturePath: capture.capturePath,
    capture,
    closingLines,
    grade,
    summary
  });
}
