import { NextResponse } from "next/server";

import { buildNbaWinnerLearnedModelReport } from "@/services/training/nba-winner-learned-model";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit") ?? "10000");
  const iterationsParam = Number(url.searchParams.get("iterations") ?? "900");
  const lambdaParam = Number(url.searchParams.get("lambda") ?? "0.08");
  const learningRateParam = Number(url.searchParams.get("learningRate") ?? "0.055");
  const report = await buildNbaWinnerLearnedModelReport({
    limit: Number.isFinite(limitParam) ? Math.max(100, Math.min(limitParam, 10000)) : 10000,
    iterations: Number.isFinite(iterationsParam) ? Math.max(100, Math.min(iterationsParam, 2500)) : 900,
    lambda: Number.isFinite(lambdaParam) ? Math.max(0, Math.min(lambdaParam, 1)) : 0.08,
    learningRate: Number.isFinite(learningRateParam) ? Math.max(0.005, Math.min(learningRateParam, 0.2)) : 0.055
  });
  return NextResponse.json(report);
}
