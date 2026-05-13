import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { getMlbHistoricalOddsCoverage } from "@/src/server/sharktrends/coverage";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const coverage = await getMlbHistoricalOddsCoverage(prisma);
    return NextResponse.json({ ok: true, coverage, data: { coverage }, warnings: coverage.warnings });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Coverage audit failed.", warnings: [] }, { status: 500 });
  }
}
