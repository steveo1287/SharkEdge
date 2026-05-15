import { NextResponse } from "next/server";

import { getDataControlTowerReport } from "@/services/ops/data-control-tower";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

export async function GET() {
  try {
    const report = await getDataControlTowerReport();
    return NextResponse.json({ ok: true, ...report });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Data control tower failed." }, { status: 500 });
  }
}
