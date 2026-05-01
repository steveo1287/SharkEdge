import { NextResponse } from "next/server";

import { calculateTrendStats } from "@/lib/trends/statisticalValidator";
import { matchTrendToGames, parseFilterConditions } from "@/lib/trends/trendMatcher";
import { generateTrendNaming } from "@/lib/trends/trendNamer";
import { filterConditionsSchema } from "@/types/trends";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * POST /api/trends/run
 *
 * Runs the Trends Engine against a set of filter conditions and returns a
 * full stats summary plus the matching game-by-game results.  Nothing is
 * persisted — use POST /api/trends (with a name) to save a system.
 *
 * Request body:
 *   filterConditions  FilterConditions  (required)  — trend filter payload
 *   limit             number            (optional)  — cap matched games returned (default 200)
 *
 * Response 200:
 *   {
 *     stats:         TrendStatsSummary
 *     matches:       TrendMatchResult[]   (historical, chronological)
 *     activeMatches: TrendMatchResult[]   (today / upcoming qualifiers)
 *     title:         string
 *     shortDescription: string
 *     explanation:   string
 *     filterConditions: FilterConditions
 *     ranAt:         string (ISO)
 *   }
 *
 * Response 422 — filter produces fewer games than minGames threshold
 * Response 400 — invalid filter payload
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Support both { filterConditions: {...} } and bare filter objects
    const rawFilters = body.filterConditions ?? body;
    const filterConditions = filterConditionsSchema.parse(rawFilters);

    const limit = typeof body.limit === "number" && body.limit > 0 ? Math.min(body.limit, 500) : 200;

    // Run matching pipeline in parallel: historical games and active (today/future) games
    const [historicalMatches, activeMatches] = await Promise.all([
      matchTrendToGames(filterConditions, { limit }),
      matchTrendToGames(filterConditions, { activeOnly: true, limit: 50 })
    ]);

    // Compute all stats: win rate, ROI, streaks, margins, significance
    const stats = calculateTrendStats(historicalMatches);

    // Enforce minimum sample gate
    if (stats.totalGames < filterConditions.minGames) {
      return NextResponse.json(
        {
          error: `Trend requires at least ${filterConditions.minGames} matched games. Found ${stats.totalGames}.`,
          stats,
          matches: historicalMatches,
          activeMatches,
          filterConditions
        },
        { status: 422 }
      );
    }

    const naming = generateTrendNaming(filterConditions, stats);

    return NextResponse.json(
      {
        stats,
        matches: historicalMatches,
        activeMatches,
        title: naming.title,
        shortDescription: naming.shortDescription,
        explanation: naming.explanation,
        filterConditions,
        ranAt: new Date().toISOString()
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run trend.";
    const status = /parse|invalid|required/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
