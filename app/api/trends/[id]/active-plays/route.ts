import { NextResponse } from "next/server";

import { getTrendDefinitionActiveMatches } from "@/services/trends/trend-foundation";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
export const maxDuration = 20;
export const dynamic = "force-dynamic";

/**
 * GET /api/trends/[id]/active-plays
 *
 * Returns games on today's schedule (or future scheduled games) that match
 * the filter conditions of the saved trend.  Use this to surface "active
 * plays" — games where the system fires today.
 *
 * Query params:
 *   date   string   (optional)  — ISO date string "YYYY-MM-DD"; defaults to today
 *
 * Response 200:
 *   {
 *     trendId:          string
 *     trendName:        string
 *     filterConditions: FilterConditions
 *     activeMatches:    TrendMatchResult[]
 *     count:            number
 *     asOf:             string (ISO)
 *   }
 *
 * Response 404 — trend not found
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // Look up the definition to confirm it exists and get its name
    const definition = await (prisma as any).savedTrendDefinition.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        filterConditionsJson: true
      }
    });

    if (!definition) {
      return NextResponse.json({ error: "Trend not found." }, { status: 404 });
    }

    const activeMatches = await getTrendDefinitionActiveMatches(id);

    return NextResponse.json(
      {
        trendId: id,
        trendName: definition.name,
        filterConditions: definition.filterConditionsJson,
        activeMatches: activeMatches ?? [],
        count: activeMatches?.length ?? 0,
        asOf: new Date().toISOString()
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load active plays.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
