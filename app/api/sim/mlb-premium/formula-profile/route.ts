import { NextResponse } from "next/server";

import {
  ensureMlbPremiumFormulaProfileTable,
  fitAndPersistMlbPremiumFormulaProfile,
  getActiveMlbPremiumFormulaProfile
} from "@/services/simulation/mlb-premium-formula-profile";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Action = "active" | "ensure" | "fit";

function parseAction(value: unknown): Action {
  if (value === "ensure" || value === "fit") return value;
  return "active";
}

function parseLimit(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value ?? 5000);
  return Number.isFinite(numeric) ? Math.max(50, Math.min(20000, Math.round(numeric))) : 5000;
}

async function runAction(action: Action, limit: number) {
  if (action === "ensure") {
    const databaseReady = await ensureMlbPremiumFormulaProfileTable();
    return { ok: databaseReady, databaseReady, action };
  }
  if (action === "fit") return { action, ...(await fitAndPersistMlbPremiumFormulaProfile(limit)) };
  const profile = await getActiveMlbPremiumFormulaProfile();
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
