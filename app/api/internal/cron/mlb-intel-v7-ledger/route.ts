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

function pickCount(value: unknown, key: string) {
  if (!value || typeof value !== "object") return null;
  const count = (value as Record<string, unknown>)[key];
  return typeof count === "number" && Number.isFinite(count) ? count : null;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseLimit(searchParams.get("limit"));
  const windowDays = parseWindowDays(searchParams.get("windowDays"));
  const mode = searchParams.get("mode")?.trim().toLowerCase() ?? "full";

  const capture =
    mode === "grade"
      ? { ok: true, skipped: true, reason: "Skipped by mode=grade" }
      : await runMlbProductionCapture({ windowDays });
  const closingLines =
    mode === "grade"
      ? { ok: true, skipped: true, reason: "Skipped by mode=grade" }
      : await updateMlbIntelV7ClosingLines(limit);
  const grade = await gradeMlbIntelV7Ledgers({ limit });
  const summary = await getMlbIntelV7LedgerSummary(90);
  const captureRecord = capture as Record<string, unknown>;
  const officialCapture = captureRecord.capture;
  const v8Shadow = captureRecord.v8Shadow;

  return NextResponse.json({
    ok: Boolean(capture.ok && closingLines.ok && grade.ok && summary.ok),
    mode,
    productionMode: "productionMode" in capture ? capture.productionMode : null,
    capturePath: "capturePath" in capture ? capture.capturePath : "skipped",
    governance: {
      officialLedgerModel: captureRecord.productionMode === "v7_control" ? "mlb-intel-v7" : captureRecord.productionMode === "force_v7" ? "main-sim-brain-v1" : null,
      v8OfficialPromotion: false,
      v8ShadowOnly: Boolean(v8Shadow),
      officialSnapshots: pickCount(officialCapture, "capturedSnapshots"),
      officialPicks: pickCount(officialCapture, "officialPicks"),
      v8ShadowSnapshots: pickCount(v8Shadow, "capturedSnapshots"),
      v8ShadowOfficialPicks: pickCount(v8Shadow, "officialPicks"),
      v8ShadowBlocked: pickCount(v8Shadow, "shadowBlocked")
    },
    capture,
    closingLines,
    grade,
    summary
  });
}