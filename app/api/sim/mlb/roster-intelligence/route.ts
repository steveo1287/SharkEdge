import { NextResponse } from "next/server";

import {
  ensureMlbRosterIntelligenceTables,
  getMlbRosterIntelligenceSummary
} from "@/services/simulation/mlb-roster-intelligence";
import { buildMlbRosterIntelligenceFromStats } from "@/services/simulation/mlb-roster-intelligence-auto-builder";
import {
  ingestMlbRosterIntelligence,
  mlbRosterIntelligenceSamplePayload,
  type MlbRosterIntelligenceIngestPayload
} from "@/services/simulation/mlb-roster-intelligence-ingest";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Action = "summary" | "ensure" | "sample" | "ingest" | "auto-build";

function parseAction(value: unknown): Action {
  if (value === "ensure" || value === "sample" || value === "ingest" || value === "auto-build") return value;
  return "summary";
}

function parsePositiveInt(value: unknown, fallback: number, min: number, max: number) {
  const numeric = typeof value === "number" ? value : Number(value ?? fallback);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, Math.round(numeric))) : fallback;
}

async function runAction(action: Action, payload?: MlbRosterIntelligenceIngestPayload & { lookbackDays?: number; limit?: number; includeLineups?: boolean }) {
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
  if (action === "auto-build") {
    return {
      action,
      ...(await buildMlbRosterIntelligenceFromStats({
        lookbackDays: parsePositiveInt(payload?.lookbackDays, 45, 1, 365),
        limit: parsePositiveInt(payload?.limit, 1500, 50, 5000),
        includeLineups: payload?.includeLineups !== false
      }))
    };
  }
  return { action, ...(await getMlbRosterIntelligenceSummary()) };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = parseAction(searchParams.get("action"));
  const result = await runAction(action, {
    lookbackDays: parsePositiveInt(searchParams.get("lookbackDays"), 45, 1, 365),
    limit: parsePositiveInt(searchParams.get("limit"), 1500, 50, 5000),
    includeLineups: searchParams.get("includeLineups") !== "false"
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const action = parseAction(body.action ?? "ingest");
  const payload = (body.payload ?? body) as MlbRosterIntelligenceIngestPayload & { lookbackDays?: number; limit?: number; includeLineups?: boolean };
  const result = await runAction(action, payload);
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
