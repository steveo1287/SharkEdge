import { NextResponse } from "next/server";

import { buildMainSimBrainShadowAudit } from "@/services/simulation/main-sim-brain-shadow-audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseLimit(value: string | null) {
  const numeric = Number(value ?? 30);
  return Number.isFinite(numeric) ? Math.max(1, Math.min(60, Math.round(numeric))) : 30;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const result = await buildMainSimBrainShadowAudit({ limit: parseLimit(searchParams.get("limit")) });
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
