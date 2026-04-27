import { NextResponse } from "next/server";
import { buildMlbEdges } from "@/services/simulation/mlb-edge-detector";

export const runtime = "nodejs";
export const maxDuration = 20;
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const data = await buildMlbEdges();
  return NextResponse.json(data);
}
