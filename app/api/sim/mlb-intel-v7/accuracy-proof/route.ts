import { NextResponse } from "next/server";

import { getMlbIntelV7AccuracyProof } from "@/services/simulation/mlb-intel-v7-accuracy-adapter";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseWindowDays(value: string | null) {
  const numeric = Number(value ?? 90);
  return Number.isFinite(numeric) ? Math.max(1, Math.min(3650, Math.round(numeric))) : 90;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const windowDays = parseWindowDays(searchParams.get("windowDays"));
  const proof = await getMlbIntelV7AccuracyProof(windowDays);
  return NextResponse.json(proof, { status: proof.ok ? 200 : 503 });
}
