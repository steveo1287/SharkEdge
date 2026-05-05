import { NextResponse } from "next/server";

import { getMlbV8CalibrationLabReport } from "@/services/simulation/mlb-v8-calibration-lab";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseWindowDays(value: string | null) {
  const numeric = Number(value ?? 180);
  return Number.isFinite(numeric) ? Math.max(1, Math.min(3650, Math.round(numeric))) : 180;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const result = await getMlbV8CalibrationLabReport(parseWindowDays(searchParams.get("windowDays")));
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
