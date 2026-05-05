import { NextResponse } from "next/server";

import { buildMlbIntelV7LiveBoard } from "@/services/simulation/mlb-intel-v7-live-board";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseLimit(value: string | null) {
  const numeric = Number(value ?? 30);
  return Number.isFinite(numeric) ? Math.max(1, Math.min(60, Math.round(numeric))) : 30;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const result = await buildMlbIntelV7LiveBoard({ limit: parseLimit(searchParams.get("limit")) });
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const result = await buildMlbIntelV7LiveBoard({ limit: typeof body.limit === "number" ? body.limit : 30 });
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
