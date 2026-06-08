import { NextResponse } from "next/server";

import { loadMlbBatterBoxProjection } from "@/services/simulation/mlb-batter-box-loader";
import { buildMlbSimulatedBoxScore } from "@/services/simulation/mlb-simulated-box-score";
import { buildMlbSimulatedPitchingBoxScores } from "@/services/simulation/mlb-simulated-pitching-box-score";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function searchParamsToRecord(url: URL) {
  const out: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) out[key] = value;
  return out;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const result = await loadMlbBatterBoxProjection(searchParamsToRecord(url));
    const boxScore = result.projection ? buildMlbSimulatedBoxScore(result.projection) : null;
    const pitching = result.projection && boxScore ? buildMlbSimulatedPitchingBoxScores({
      projection: result.projection,
      awayOffense: {
        team: boxScore.awayTeam.team,
        projectedRuns: boxScore.awayTeam.totals.projectedRuns,
        plateAppearances: boxScore.awayTeam.totals.plateAppearances,
        hits: boxScore.awayTeam.totals.hits,
        totalBases: boxScore.awayTeam.totals.totalBases,
        homeRuns: boxScore.awayTeam.totals.homeRuns,
        walks: boxScore.awayTeam.totals.walks,
        strikeouts: boxScore.awayTeam.totals.strikeouts
      },
      homeOffense: {
        team: boxScore.homeTeam.team,
        projectedRuns: boxScore.homeTeam.totals.projectedRuns,
        plateAppearances: boxScore.homeTeam.totals.plateAppearances,
        hits: boxScore.homeTeam.totals.hits,
        totalBases: boxScore.homeTeam.totals.totalBases,
        homeRuns: boxScore.homeTeam.totals.homeRuns,
        walks: boxScore.homeTeam.totals.walks,
        strikeouts: boxScore.homeTeam.totals.strikeouts
      }
    }) : null;
    return NextResponse.json({
      ok: Boolean(result.projection),
      modelVersion: "mlb-simulated-box-score-v2-plus-pitching-v1",
      boxScore,
      pitching,
      projection: result.projection,
      diagnostics: result.diagnostics,
      error: result.error
    }, { status: result.projection ? 200 : 503 });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      modelVersion: "mlb-simulated-box-score-v2-plus-pitching-v1",
      boxScore: null,
      pitching: null,
      projection: null,
      diagnostics: null,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
