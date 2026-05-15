import { NextResponse } from "next/server";

import { getDataSourceCoverageReport } from "@/services/ops/data-source-coverage";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

export async function GET() {
  try {
    const report = await getDataSourceCoverageReport();
    return NextResponse.json({ ok: true, ...report });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Data source coverage failed." }, { status: 500 });
  }
}
