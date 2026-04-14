import { NextResponse } from "next/server";

import { getTrendApiResponse, parseTrendFilters } from "@/services/trends/trends-service";

export const dynamic = "force-dynamic";

type RouteProps = {
  params: Promise<{
    market: string;
  }>;
};

export async function GET(request: Request, { params }: RouteProps) {
  const { market } = await params;
  const url = new URL(request.url);
  const filters = parseTrendFilters(Object.fromEntries(url.searchParams.entries()));
  const data = await getTrendApiResponse({
    ...filters,
    market: decodeURIComponent(market) as typeof filters.market
  });

  return NextResponse.json(data, {
    status: data.setup ? 503 : 200
  });
}
