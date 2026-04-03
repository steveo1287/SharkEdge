import { NextResponse } from "next/server";

import { getPublishedTrendFeed } from "@/lib/trends/publisher";
import { trendFiltersSchema } from "@/lib/validation/filters";
import { createTrendDefinition, listTrendDefinitions } from "@/services/trends/trend-foundation";
import { filterConditionsSchema } from "@/types/trends";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const filters = trendFiltersSchema.parse(Object.fromEntries(url.searchParams.entries()));
  const mode = url.searchParams.get("mode");

  if (mode === "definitions") {
    const page = Number(url.searchParams.get("page") ?? "1");
    const limit = Number(url.searchParams.get("limit") ?? "20");
    const minConfidence = Number(url.searchParams.get("minConfidence") ?? "0");
    const payload = await listTrendDefinitions({
      sport: filters.sport,
      betType: filters.market === "ALL" ? undefined : filters.market,
      minConfidence: Number.isFinite(minConfidence) ? minConfidence : undefined,
      page,
      limit
    });
    return NextResponse.json({ trends: payload }, { status: 200 });
  }

  const payload = await getPublishedTrendFeed(filters);
  return NextResponse.json(payload, { status: 200 });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const filterConditions = filterConditionsSchema.parse(body.filterConditions ?? body);
    const created = await createTrendDefinition({
      name: typeof body.name === "string" ? body.name : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
      filterConditions,
      isPublic: Boolean(body.isPublic)
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create trend.";
    const status = /requires at least/i.test(message) ? 422 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
