import { NextResponse } from "next/server";

import { getPublishedTrendFeed } from "@/lib/trends/publisher";
import { trendFiltersSchema } from "@/lib/validation/filters";
import { createTrendDefinition, listTrendDefinitions } from "@/services/trends/trend-foundation";
import { buildTrendSignals } from "@/services/trends/trends-engine";
import { filterConditionsSchema } from "@/types/trends";
import type { LeagueKey } from "@/lib/types/domain";

export const runtime = "nodejs";
export const maxDuration = 20;
export const dynamic = "force-dynamic";
export const revalidate = 0;

const SIGNAL_LEAGUES: Array<"ALL" | LeagueKey> = ["ALL", "MLB", "NBA", "NHL", "NFL", "NCAAF", "UFC", "BOXING"];
function parseSignalLeague(value: string | null): "ALL" | LeagueKey {
  const upper = String(value ?? "ALL").toUpperCase();
  return SIGNAL_LEAGUES.includes(upper as "ALL" | LeagueKey) ? upper as "ALL" | LeagueKey : "ALL";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode");

    if (mode === "signals" || url.searchParams.has("league")) {
      const league = parseSignalLeague(url.searchParams.get("league"));
      const includeResearch = url.searchParams.get("research") !== "false";
      const payload = await buildTrendSignals({ league, includeResearch });
      return NextResponse.json(payload, { status: 200 });
    }

    const filters = trendFiltersSchema.parse(Object.fromEntries(url.searchParams.entries()));

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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load trends.";
    return NextResponse.json(
      {
        sections: [],
        featured: [],
        overlooked: [],
        meta: {
          count: 0,
          sampleWarning: message
        }
      },
      { status: 200 }
    );
  }
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
