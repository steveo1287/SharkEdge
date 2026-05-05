import { NextResponse } from "next/server";

import { getMlbV8PromotionGate } from "@/services/simulation/mlb-v8-promotion-gate";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseWindowDays(value: string | null) {
  const numeric = Number(value ?? 180);
  return Number.isFinite(numeric) ? Math.max(1, Math.min(3650, Math.round(numeric))) : 180;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gate = await getMlbV8PromotionGate(parseWindowDays(searchParams.get("windowDays")));
  return NextResponse.json(gate, { status: gate.ok ? 200 : 503 });
}
