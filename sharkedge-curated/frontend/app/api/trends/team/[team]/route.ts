import { NextResponse } from "next/server";

import { getTeamTrendBundle } from "@/lib/trends/engine";
import { trendFiltersSchema } from "@/lib/validation/filters";

export const dynamic = "force-dynamic";

type RouteProps = {
  params: Promise<{
    team: string;
  }>;
};

export async function GET(request: Request, { params }: RouteProps) {
  const { team } = await params;
  const url = new URL(request.url);
  const filters = trendFiltersSchema.parse(Object.fromEntries(url.searchParams.entries()));
  const payload = await getTeamTrendBundle(decodeURIComponent(team), filters);

  return NextResponse.json(payload, { status: 200 });
}
