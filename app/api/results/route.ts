import { NextResponse } from "next/server";

import { getResultsCenter, normalizeResultsMarket } from "@/services/results/mlb-results-center";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const market = normalizeResultsMarket(url.searchParams.get("market"));
  const data = await getResultsCenter(market);
  return NextResponse.json(data);
}
