import { NextResponse } from "next/server";

import { buildEventSimulationView } from "@/services/simulation/simulation-view-service";
import {
  buildGameSimVerdict,
  buildPlayerPropVerdict
} from "@/services/simulation/sim-verdict-engine";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const simulation = await buildEventSimulationView(id);

    if (!simulation || !simulation.projectionSummary) {
      return NextResponse.json(
        { error: "Simulation data unavailable for this event." },
        { status: 404 }
      );
    }

    const { projectionSummary, simulationDrivers } = simulation;

    // Build a minimal sim summary compatible with the verdict engine
    const simSummary = {
      engine: "contextual-monte-carlo-v2",
      projectedHomeScore: projectionSummary.projectedHomeScore,
      projectedAwayScore: projectionSummary.projectedAwayScore,
      projectedTotal: projectionSummary.projectedTotal,
      projectedSpreadHome: projectionSummary.projectedSpreadHome,
      winProbHome: projectionSummary.winProbHome,
      winProbAway: projectionSummary.winProbAway,
      distribution: {
        totalStdDev: 8.5,
        homeScoreStdDev: 6.2,
        awayScoreStdDev: 6.2,
        p10Total: projectionSummary.projectedTotal * 0.82,
        p50Total: projectionSummary.projectedTotal,
        p90Total: projectionSummary.projectedTotal * 1.18
      },
      drivers: simulationDrivers.gameDrivers,
      ratingsPrior: { source: "MISSING" as const, blendWeight: 0, deltaOverall: 0, confidence: 0 }
    };

    // Extract market anchors from the event comparisons
    const totalComparison = simulation.eventBetComparisons.find((c) => c.marketType === "total");
    const spreadComparison = simulation.eventBetComparisons.find((c) => c.marketType === "spread_home");

    const gameVerdict = buildGameSimVerdict({
      sim: simSummary,
      leagueKey: "UNKNOWN",
      homeTeam: "Home",
      awayTeam: "Away",
      marketTotal: totalComparison?.marketLine ?? null,
      marketSpreadHome: spreadComparison?.marketLine ?? null,
      homeMoneylineOdds: null,
      awayMoneylineOdds: null,
      overOdds: null,
      homeSpreadOdds: null
    });

    // Build player prop verdicts
    const playerPropVerdicts = simulation.topPlayerEdges
      .filter((edge) => edge.marketLine !== null && edge.overProbability !== null)
      .map((edge) => {
        const propSim = {
          meanValue: edge.projectedMean,
          medianValue: edge.projectedMedian,
          stdDev: 2.5,
          p10: edge.projectedMean * 0.6,
          p50: edge.projectedMean,
          p90: edge.projectedMean * 1.4,
          hitProbOver: { [String(edge.marketLine)]: edge.overProbability ?? 0.5 },
          hitProbUnder: { [String(edge.marketLine)]: edge.underProbability ?? 0.5 },
          contextualEdgeScore: edge.contextualEdgeScore,
          drivers: edge.drivers,
          priorWeight: 0.04,
          sourceSummary: "Derived from stored player projections."
        };
        return buildPlayerPropVerdict(
          propSim,
          edge.playerId,
          edge.playerName,
          edge.statKey,
          edge.marketLine,
          null,
          null
        );
      });

    return NextResponse.json({
      eventId: id,
      gameVerdict,
      playerPropVerdicts,
      simulationDrivers,
      mlbContext: simulation.mlbSourceNativeContext
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build verdict." },
      { status: 500 }
    );
  }
}
