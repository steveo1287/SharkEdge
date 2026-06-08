import { loadMlbBatterBoxProjection } from "@/services/simulation/mlb-batter-box-loader";

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
    topHitters: projection ? [...projection.awayHitters, ...projection.homeHitters]
      .sort((a, b) => b.expectedTotalBases - a.expectedTotalBases)
      .slice(0, 10)
      .map((hitter) => ({
        playerId: hitter.playerId,
        playerName: hitter.playerName,
        team: hitter.team,
        battingOrder: hitter.battingOrder,
        expectedHits: hitter.expectedHits,
        expectedTotalBases: hitter.expectedTotalBases,
        homeRunProbability: hitter.statDistribution.homeRunProbability,
        confidence: hitter.confidence
      })) : [],
    warnings: result.diagnostics.warnings,
    projectionWarnings: projection?.warnings ?? [],
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
