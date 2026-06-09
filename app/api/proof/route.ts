import { NextResponse } from "next/server";

import { getResultsCenter } from "@/services/results/mlb-results-center";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const data = await getResultsCenter("overview");
  const graded = data.summary.wins + data.summary.losses + data.summary.pushes;
  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    proof: {
      title: "SharkEdge Proof Room",
      thesis: "Locked results, visible misses, pending rows, and Railway-backed verification.",
      graded,
      wins: data.summary.wins,
      losses: data.summary.losses,
      pushes: data.summary.pushes,
      pending: data.summary.pending,
      winRatePct: data.summary.winRatePct,
      unitsNet: data.summary.unitsNet,
      roiPct: data.summary.roiPct,
      actualOddsCount: data.summary.actualOddsCount,
      fallbackOddsCount: data.summary.fallbackOddsCount
    },
    markets: data.marketCards,
    recent: data.rows.slice(0, 20),
    warnings: data.warnings
  });
}
