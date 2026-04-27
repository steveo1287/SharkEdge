import { NextResponse } from "next/server";
import { trainMlbMlModel, getCachedMlbMlModel } from "@/services/simulation/mlb-ml-training-engine";

export const runtime = "nodejs";
export const maxDuration = 20;
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const model = await getCachedMlbMlModel();
  return NextResponse.json({ ok: true, model });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 1000);
  const model = await trainMlbMlModel(limit);
  return NextResponse.json(model);
}
