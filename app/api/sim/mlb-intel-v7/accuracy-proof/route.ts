import { NextResponse } from "next/server";

import { getMlbIntelV7AccuracyProof } from "@/services/simulation/mlb-intel-v7-accuracy-adapter";
import {
  captureCurrentMlbIntelV7Ledgers,
  gradeMlbIntelV7Ledgers
} from "@/services/simulation/mlb-intel-v7-ledgers";
import { updateMlbIntelV7ClosingLines } from "@/services/simulation/mlb-intel-v7-closing-lines";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

type Action = "proof" | "capture" | "grade" | "run";

function parseWindowDays(value: string | null) {
  const numeric = Number(value ?? 90);
  return Number.isFinite(numeric) ? Math.max(1, Math.min(3650, Math.round(numeric))) : 90;
}

function parseLimit(value: string | null) {
  const numeric = Number(value ?? 60);
  return Number.isFinite(numeric) ? Math.max(1, Math.min(60, Math.round(numeric))) : 60;
}

function parseAction(value: unknown): Action {
  if (value === "capture" || value === "grade" || value === "run") return value;
  return "proof";
}

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

async function runAction(action: Action, windowDays: number, limit: number) {
  if (action === "capture") {
    const capture = await captureCurrentMlbIntelV7Ledgers();
    const proof = await getMlbIntelV7AccuracyProof(windowDays);
    return { ok: Boolean(capture.ok && proof.ok), action, capture, proof };
  }

  if (action === "grade") {
    const closingLines = await updateMlbIntelV7ClosingLines(limit);
    const grade = await gradeMlbIntelV7Ledgers();
    const proof = await getMlbIntelV7AccuracyProof(windowDays);
    return { ok: Boolean(closingLines.ok && grade.ok && proof.ok), action, closingLines, grade, proof };
  }

  if (action === "run") {
    const capture = await captureCurrentMlbIntelV7Ledgers();
    const closingLines = await updateMlbIntelV7ClosingLines(limit);
    const grade = await gradeMlbIntelV7Ledgers();
    const proof = await getMlbIntelV7AccuracyProof(windowDays);
    return { ok: Boolean(capture.ok && closingLines.ok && grade.ok && proof.ok), action, capture, closingLines, grade, proof };
  }

  return getMlbIntelV7AccuracyProof(windowDays);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = parseAction(searchParams.get("action"));
  const windowDays = parseWindowDays(searchParams.get("windowDays"));
  const limit = parseLimit(searchParams.get("limit"));

  if (action !== "proof" && !isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const result = await runAction(action, windowDays, limit);
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const action = parseAction(body.action ?? "run");
  const windowDays = typeof body.windowDays === "number" ? parseWindowDays(String(body.windowDays)) : 90;
  const limit = typeof body.limit === "number" ? parseLimit(String(body.limit)) : 60;
  const result = await runAction(action, windowDays, limit);

  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
