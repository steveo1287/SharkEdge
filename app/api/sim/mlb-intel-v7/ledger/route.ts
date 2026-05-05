import { NextResponse } from "next/server";

import {
  captureCurrentMlbIntelV7Ledgers,
  ensureMlbIntelV7Ledgers,
  getMlbIntelV7LedgerSummary,
  gradeMlbIntelV7Ledgers
} from "@/services/simulation/mlb-intel-v7-ledgers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Action = "summary" | "ensure" | "capture" | "grade" | "run";

function parseAction(value: unknown): Action {
  if (value === "ensure" || value === "capture" || value === "grade" || value === "run" || value === "summary") return value;
  return "summary";
}

function parseWindowDays(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value ?? 90);
  return Number.isFinite(numeric) ? Math.max(1, Math.min(3650, Math.round(numeric))) : 90;
}

async function runAction(action: Action, windowDays: number) {
  if (action === "ensure") {
    const databaseReady = await ensureMlbIntelV7Ledgers();
    return { ok: databaseReady, databaseReady, action };
  }

  if (action === "capture") {
    return { action, ...(await captureCurrentMlbIntelV7Ledgers()) };
  }

  if (action === "grade") {
    return { action, ...(await gradeMlbIntelV7Ledgers()) };
  }

  if (action === "run") {
    const capture = await captureCurrentMlbIntelV7Ledgers();
    const grade = await gradeMlbIntelV7Ledgers();
    const summary = await getMlbIntelV7LedgerSummary(windowDays);
    return {
      ok: Boolean(capture.ok && grade.ok && summary.ok),
      action,
      capture,
      grade,
      summary
    };
  }

  return { action, ...(await getMlbIntelV7LedgerSummary(windowDays)) };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = parseAction(searchParams.get("action"));
  const windowDays = parseWindowDays(searchParams.get("windowDays"));
  const result = await runAction(action, windowDays);
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const action = parseAction(body.action ?? "run");
  const windowDays = parseWindowDays(body.windowDays);
  const result = await runAction(action, windowDays);
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
