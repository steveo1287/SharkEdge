import { NextResponse } from "next/server";
import { captureMlbHistoricalSnapshots, readMlbHistoricalSnapshots } from "@/services/simulation/mlb-historical-snapshot-worker";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 200);
  const snapshots = await readMlbHistoricalSnapshots(limit);
  return NextResponse.json({ ok: true, count: snapshots.length, snapshots });
}

export async function POST() {
  const result = await captureMlbHistoricalSnapshots();
  return NextResponse.json(result);
}
