import { NextResponse } from "next/server";

import {
  ensureMlbV8PlayerImpactProfileTable,
  fitAndPersistMlbV8PlayerImpactProfile,
  getActiveMlbV8PlayerImpactProfile
} from "@/services/simulation/mlb-v8-player-impact-profile";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Action = "active" | "ensure" | "fit";

function parseAction(value: unknown): Action {
  if (value === "ensure" || value === "fit") return value;
  return "active";
}

function parseLimit(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value ?? 2000);
  return Number.isFinite(numeric) ? Math.max(50, Math.min(10000, Math.round(numeric))) : 2000;
}

async function runAction(action: Action, limit: number) {
  if (action === "ensure") {
    const databaseReady = await ensureMlbV8PlayerImpactProfileTable();
    return { ok: databaseReady, databaseReady, action };
  }

  if (action === "fit") {
    return { action, ...(await fitAndPersistMlbV8PlayerImpactProfile(limit)) };
  }

  const profile = await getActiveMlbV8PlayerImpactProfile();
  return { ok: true, action, profile };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = parseAction(searchParams.get("action"));
  const limit = parseLimit(searchParams.get("limit"));
  const result = await runAction(action, limit);
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const action = parseAction(body.action ?? "fit");
  const limit = parseLimit(body.limit);
  const result = await runAction(action, limit);
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
