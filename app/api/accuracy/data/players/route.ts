import { NextResponse } from "next/server";

import { getPlayerTendencyCoverageReport } from "@/services/ops/player-tendency-coverage";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

export async function GET() {
  try {
    const report = await getPlayerTendencyCoverageReport();
    return NextResponse.json({ ok: true, ...report });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Player tendency coverage failed." }, { status: 500 });
  }
}
