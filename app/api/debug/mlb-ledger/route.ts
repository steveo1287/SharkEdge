import { NextResponse } from "next/server";

import { getMlbLedgerDiagnostics } from "@/services/simulation/mlb-ledger-diagnostics";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function parseWindowDays(value: string | null) {
  const numeric = Number(value ?? 180);
  return Number.isFinite(numeric) ? Math.max(1, Math.min(3650, Math.round(numeric))) : 180;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const diagnostics = await getMlbLedgerDiagnostics(parseWindowDays(searchParams.get("windowDays")));
  return NextResponse.json(diagnostics, { status: diagnostics.ok ? 200 : 503 });
}
