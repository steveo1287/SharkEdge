import { NextResponse } from "next/server";

import {
  ensureMlbRosterIntelligenceTables,
  getMlbRosterIntelligenceSummary
} from "@/services/simulation/mlb-roster-intelligence";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Action = "summary" | "ensure";

function parseAction(value: unknown): Action {
  return value === "ensure" ? "ensure" : "summary";
}

async function runAction(action: Action) {
  if (action === "ensure") {
    const databaseReady = await ensureMlbRosterIntelligenceTables();
    return { ok: databaseReady, databaseReady, action };
  }
  return { action, ...(await getMlbRosterIntelligenceSummary()) };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const result = await runAction(parseAction(searchParams.get("action")));
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const result = await runAction(parseAction(body.action));
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
