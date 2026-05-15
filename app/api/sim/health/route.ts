import { NextResponse } from "next/server";

import { getSimDataHealthReport } from "@/services/ops/sim-data-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

export async function GET() {
  try {
    const report = await getSimDataHealthReport();
    return NextResponse.json({ ok: true, ...report }, { status: report.status === "BLOCKED" ? 207 : 200 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Sim data health failed." }, { status: 500 });
  }
}
