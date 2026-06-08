import { NextResponse } from "next/server";

import { getMlbIntelligenceReadiness } from "@/services/simulation/mlb-intelligence-readiness";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const report = await getMlbIntelligenceReadiness();
    return NextResponse.json({ ok: true, ready: report.state === "READY", report });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        ready: false,
        error: error instanceof Error ? error.message : "MLB intelligence readiness failed."
      },
      { status: 500 }
    );
  }
}
