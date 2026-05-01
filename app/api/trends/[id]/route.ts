import { NextResponse } from "next/server";

import { calculateTrendStats } from "@/lib/trends/statisticalValidator";
import { matchTrendToGames } from "@/lib/trends/trendMatcher";
import {
  getTrendDefinitionDetail,
  getTrendDefinitionActiveMatches
} from "@/services/trends/trend-foundation";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * GET /api/trends/[id]
 *
 * Returns a saved trend definition along with freshly-recomputed stats and
 * the full chronological game-by-game match list.  The stats are always
 * recomputed live so callers always see current numbers.
 *
 * Response 200:
 *   {
 *     definition:    TrendDefinitionRecord
 *     stats:         TrendStatsSummary         (recomputed live)
 *     matches:       TrendMatchResult[]         (historical, chronological)
 *     activeMatches: TrendMatchResult[]         (today / upcoming qualifiers)
 *     snapshots:     TrendSnapshotView[]        (stored historical snapshots, newest first)
 *   }
 *
 * Response 404 — trend not found
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    const detail = await getTrendDefinitionDetail(id);

    if (!detail) {
      return NextResponse.json({ error: "Trend not found." }, { status: 404 });
    }

    // Recompute live matches (definition.filterConditions is already parsed)
    const [liveMatches, activeMatches] = await Promise.all([
      matchTrendToGames(detail.definition.filterConditions),
      getTrendDefinitionActiveMatches(id)
    ]);

    // Recompute stats fresh so the response reflects current data
    const stats = calculateTrendStats(liveMatches ?? detail.matches);

    return NextResponse.json(
      {
        definition: detail.definition,
        stats,
        matches: liveMatches ?? detail.matches,
        activeMatches: activeMatches ?? [],
        snapshots: detail.snapshots
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load trend.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
