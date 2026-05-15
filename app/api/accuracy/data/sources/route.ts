import { NextResponse } from "next/server";

import { getEnhancedDataSourceCoverageReport } from "@/services/ops/data-source-coverage-enhanced";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

export async function GET() {
  try {
    const report = await getEnhancedDataSourceCoverageReport();
    return NextResponse.json({ ok: true, ...report });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Data source coverage failed." }, { status: 500 });
  }
}
