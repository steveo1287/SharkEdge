import { NextResponse } from "next/server";
import { buildMlbTrainingDataset } from "@/services/simulation/mlb-training-dataset-builder";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 500);
  const daysBack = Number(url.searchParams.get("daysBack") ?? 220);

  const data = await buildMlbTrainingDataset(limit, daysBack);

  return NextResponse.json(data);
}
