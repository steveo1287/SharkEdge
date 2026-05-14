import { NextResponse } from "next/server";
import { trainMlbMlModel, getCachedMlbMlModel } from "@/services/simulation/mlb-ml-training-engine";
import { getCachedMlbCalibrationConformal, trainBestAvailableMlbCalibrationConformal } from "@/services/simulation/mlb-calibration-conformal";

export const runtime = "nodejs";
export const maxDuration = 20;
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const [model, calibration] = await Promise.all([
    getCachedMlbMlModel(),
    getCachedMlbCalibrationConformal()
  ]);
  return NextResponse.json({ ok: true, model, calibration });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 1000);
  const [model, calibration] = await Promise.all([
    trainMlbMlModel(limit),
    trainBestAvailableMlbCalibrationConformal(limit)
  ]);
  return NextResponse.json({ ok: Boolean(model.ok || calibration.ok), model, calibration });
}
