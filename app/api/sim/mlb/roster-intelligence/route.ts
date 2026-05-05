import { NextResponse } from "next/server";

import {
  ensureMlbRosterIntelligenceTables,
  getMlbRosterIntelligenceSummary
} from "@/services/simulation/mlb-roster-intelligence";
import {
  ingestMlbRosterIntelligence,
  mlbRosterIntelligenceSamplePayload,
  type MlbRosterIntelligenceIngestPayload
} from "@/services/simulation/mlb-roster-intelligence-ingest";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Action = "summary" | "ensure" | "sample" | "ingest";

function parseAction(value: unknown): Action {
  if (value === "ensure" || value === "sample" || value === "ingest") return value;
  return "summary";
}

async function runAction(action: Action, payload?: MlbRosterIntelligenceIngestPayload) {
  if (action === "ensure") {
    const databaseReady = await ensureMlbRosterIntelligenceTables();
    return { ok: databaseReady, databaseReady, action };
  }
  if (action === "sample") {
    return { ok: true, databaseReady: true, action, samplePayload: mlbRosterIntelligenceSamplePayload() };
  }
  if (action === "ingest") {
    return { action, ...(await ingestMlbRosterIntelligence(payload ?? {})) };
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
  const action = parseAction(body.action ?? "ingest");
  const payload = (body.payload ?? body) as MlbRosterIntelligenceIngestPayload;
  const result = await runAction(action, payload);
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
