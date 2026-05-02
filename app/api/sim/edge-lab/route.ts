import { NextResponse } from "next/server";

import { getSimModelEdgeLab } from "@/services/sim/model-edge-lab";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function readNumber(value: string | null) {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lab = await getSimModelEdgeLab({
    league: url.searchParams.get("league"),
    market: url.searchParams.get("market"),
    modelVersion: url.searchParams.get("modelVersion"),
    windowDays: readNumber(url.searchParams.get("windowDays"))
  });

  return NextResponse.json(lab, { status: lab.ok ? 200 : 503 });
}
