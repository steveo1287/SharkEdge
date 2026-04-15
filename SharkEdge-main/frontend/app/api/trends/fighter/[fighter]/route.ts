import { NextResponse } from "next/server";

import { getTrendApiResponse, parseTrendFilters } from "@/services/trends/trends-service";

export const dynamic = "force-dynamic";

type RouteProps = {
  params: Promise<{
    fighter: string;
  }>;
};

export async function GET(request: Request, { params }: RouteProps) {
  const { fighter } = await params;
  const url = new URL(request.url);
  const filters = parseTrendFilters(Object.fromEntries(url.searchParams.entries()));
  const value = decodeURIComponent(fighter);
  const data = await getTrendApiResponse({
    ...filters,
    fighter: value,
    subject: value
  });

  return NextResponse.json(data, {
    status: data.setup ? 503 : 200
  });
}
