import { NextResponse } from "next/server";

import { getTrendApiResponse, parseTrendFilters } from "@/services/trends/trends-service";

export const dynamic = "force-dynamic";

type RouteProps = {
  params: Promise<{
    player: string;
  }>;
};

export async function GET(request: Request, { params }: RouteProps) {
  const { player } = await params;
  const url = new URL(request.url);
  const filters = parseTrendFilters(Object.fromEntries(url.searchParams.entries()));
  const data = await getTrendApiResponse({
    ...filters,
    player: decodeURIComponent(player),
    subject: decodeURIComponent(player)
  });

  return NextResponse.json(data, {
    status: data.setup ? 503 : 200
  });
}
