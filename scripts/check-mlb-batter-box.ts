import { loadMlbBatterBoxProjection } from "@/services/simulation/mlb-batter-box-loader";
import { buildMlbSimulatedBoxScore } from "@/services/simulation/mlb-simulated-box-score";
import { buildMlbSimulatedPitchingBoxScores } from "@/services/simulation/mlb-simulated-pitching-box-score";

function argValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? "";
}

async function main() {
  const params: Record<string, string> = {};
  for (const key of ["gameId", "awayTeam", "homeTeam", "awayProjectedRuns", "homeProjectedRuns"]) {
    const value = argValue(key);
    if (value) params[key] = value;
  }

  const result = await loadMlbBatterBoxProjection(params);
  const projection = result.projection;
  const boxScore = projection ? buildMlbSimulatedBoxScore(projection) : null;
  const pitching = projection && boxScore ? buildMlbSimulatedPitchingBoxScores({
    projection,
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
  const payload = {
    ok: Boolean(projection),
    command: "check-mlb-batter-box",
    selectedGame: result.diagnostics.selectedGame,
    counts: result.diagnostics.counts,
    databaseReady: result.diagnostics.databaseReady,
    paramsReady: result.diagnostics.paramsReady,
    gameOptions: result.diagnostics.gameOptions.map((option) => ({
      gameId: option.gameId,
      awayTeam: option.awayTeam,
      homeTeam: option.homeTeam,
      source: option.source,
      startTime: option.startTime
    })),
    hitterCount: projection ? projection.awayHitters.length + projection.homeHitters.length : 0,
    awayTeam: projection?.awayTeam ?? null,
    homeTeam: projection?.homeTeam ?? null,
    gameScript: boxScore?.gameScript ?? null,
    pitching: pitching ? {
      awayPitching: pitching.awayPitching,
      homePitching: pitching.homePitching,
      pitchingMatchup: pitching.pitchingMatchup,
      reconciliation: pitching.reconciliation
    } : null,
    simulatedTotals: boxScore ? {
      awayTeam: boxScore.awayTeam.team,
      homeTeam: boxScore.homeTeam.team,
      awayRuns: boxScore.awayTeam.totals.projectedRuns,
      homeRuns: boxScore.homeTeam.totals.projectedRuns,
      projectedHits: boxScore.gameTotals.projectedHits,
      projectedTotalBases: boxScore.gameTotals.projectedTotalBases,
      projectedHomeRuns: boxScore.gameTotals.projectedHomeRuns,
      projectedWalks: boxScore.gameTotals.projectedWalks,
      projectedStrikeouts: boxScore.gameTotals.projectedStrikeouts,
      awayProfile: boxScore.awayTeam.profile,
      homeProfile: boxScore.homeTeam.profile
    } : null,
    alphaHitters: boxScore ? boxScore.alphaHitters.map((hitter) => ({
      playerName: hitter.playerName,
      team: hitter.team,
      tier: hitter.tier,
      likelyLine: hitter.likelyLine,
      range: hitter.range,
      impactScore: hitter.impactScore,
      matchupEdge: hitter.matchupEdge,
      confidenceLabel: hitter.confidenceLabel,
      summary: hitter.summary
    })) : [],
    volatileCeilingHitters: boxScore ? boxScore.volatileCeilingHitters.map((hitter) => ({
      playerName: hitter.playerName,
      team: hitter.team,
      tier: hitter.tier,
      likelyLine: hitter.likelyLine,
      range: hitter.range,
      volatility: hitter.volatility,
      volatilityLabel: hitter.volatilityLabel,
      summary: hitter.summary
    })) : [],
    topSimulatedLines: boxScore ? boxScore.topProjectedHitters.slice(0, 10).map((hitter) => ({
      playerId: hitter.playerId,
      playerName: hitter.playerName,
      team: hitter.team,
      battingOrder: hitter.battingOrder,
      tier: hitter.tier,
      likelyLine: hitter.likelyLine,
      range: hitter.range,
      expected: hitter.expected,
      probabilities: hitter.probabilities,
      impactScore: hitter.impactScore,
      matchupEdge: hitter.matchupEdge,
      volatility: hitter.volatility,
      volatilityLabel: hitter.volatilityLabel,
      confidence: hitter.confidence,
      confidenceLabel: hitter.confidenceLabel,
      summary: hitter.summary
    })) : [],
    warnings: result.diagnostics.warnings,
    projectionWarnings: projection?.warnings ?? [],
    boxScoreNotes: boxScore?.notes ?? [],
    error: result.error
  };

  console.log(JSON.stringify(payload, null, 2));
  if (!projection) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    command: "check-mlb-batter-box",
    error: error instanceof Error ? error.message : String(error)
  }, null, 2));
  process.exitCode = 1;
});
