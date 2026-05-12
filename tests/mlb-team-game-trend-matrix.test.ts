import type { MlbTrendBoardRow, MlbTrendHistoricalRow } from "@/lib/types/mlb-trends";
import { buildMlbTeamGameTrendMatrixFromRows } from "@/services/trends/mlb-team-game-trend-matrix";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function historical(overrides: Partial<MlbTrendHistoricalRow> = {}): MlbTrendHistoricalRow {
  const homeScore = overrides.homeScore ?? 5;
  const awayScore = overrides.awayScore ?? 3;
  return {
    gameId: overrides.gameId ?? "hist-1",
    externalGameId: null,
    gameDate: overrides.gameDate ?? "2025-06-01T00:00:00.000Z",
    season: overrides.season ?? 2025,
    league: "MLB",
    homeTeamId: overrides.homeTeamId ?? "nyy",
    awayTeamId: overrides.awayTeamId ?? "bos",
    homeTeamName: overrides.homeTeamName ?? "New York Yankees",
    awayTeamName: overrides.awayTeamName ?? "Boston Red Sox",
    homeScore,
    awayScore,
    totalRuns: homeScore + awayScore,
    homeWon: homeScore > awayScore,
    awayWon: awayScore > homeScore,
    closingMoneylineHome: overrides.closingMoneylineHome ?? -125,
    closingMoneylineAway: overrides.closingMoneylineAway ?? 115,
    closingRunlineHome: overrides.closingRunlineHome ?? -1.5,
    closingRunlineAway: overrides.closingRunlineAway ?? 1.5,
    closingRunlinePriceHome: overrides.closingRunlinePriceHome ?? 140,
    closingRunlinePriceAway: overrides.closingRunlinePriceAway ?? -155,
    closingTotal: overrides.closingTotal ?? 8.5,
    closingTotalOverPrice: overrides.closingTotalOverPrice ?? -110,
    closingTotalUnderPrice: overrides.closingTotalUnderPrice ?? -110,
    startingPitcherHome: null,
    startingPitcherAway: null,
    startingPitcherHandHome: null,
    startingPitcherHandAway: null,
    bullpenStatusHome: null,
    bullpenStatusAway: null,
    isDoubleHeader: null,
    gameNumberInSeries: null,
    weatherSummary: null,
    temperatureF: null,
    windMph: null,
    windDirection: null,
    source: "fixture",
    ...overrides
  };
}

function board(overrides: Partial<MlbTrendBoardRow> = {}): MlbTrendBoardRow {
  return {
    gameId: "game-1",
    externalGameId: null,
    startsAt: "2026-06-01T23:05:00.000Z",
    league: "MLB",
    homeTeamId: "nyy",
    awayTeamId: "bos",
    homeTeamName: "New York Yankees",
    awayTeamName: "Boston Red Sox",
    matchup: "Boston Red Sox @ New York Yankees",
    currentMoneylineHome: -128,
    currentMoneylineAway: 116,
    currentRunlineHome: -1.5,
    currentRunlineAway: 1.5,
    currentRunlinePriceHome: 145,
    currentRunlinePriceAway: -160,
    currentTotal: 8.5,
    currentTotalOverPrice: -110,
    currentTotalUnderPrice: -110,
    startingPitcherHome: null,
    startingPitcherAway: null,
    startingPitcherHandHome: null,
    startingPitcherHandAway: null,
    status: "PREGAME",
    source: "fixture",
    ...overrides
  };
}

const rows: MlbTrendHistoricalRow[] = [];
for (let i = 0; i < 70; i += 1) {
  rows.push(historical({
    gameId: `nyy-win-${i}`,
    gameDate: `2025-06-${String((i % 25) + 1).padStart(2, "0")}T00:00:00.000Z`,
    homeScore: 5,
    awayScore: 3,
    closingMoneylineHome: -125,
    closingMoneylineAway: 115
  }));
}

for (let i = 0; i < 22; i += 1) {
  rows.push(historical({
    gameId: `nyy-loss-${i}`,
    gameDate: `2024-07-${String((i % 25) + 1).padStart(2, "0")}T00:00:00.000Z`,
    homeScore: 2,
    awayScore: 4,
    closingMoneylineHome: -125,
    closingMoneylineAway: 115
  }));
}

const matrix = buildMlbTeamGameTrendMatrixFromRows({
  historicalRows: rows,
  boardRows: [board()]
});

assert(matrix.summary.games === 1, "matrix should include every current board game");
assert(matrix.summary.teams === 2, "matrix should profile both teams in the current game");
assert(matrix.summary.angles >= 6, "matrix should generate team and game angles");
assert(matrix.games[0]?.topAngles.length, "matrix should expose ranked top angles per game");
assert(matrix.teamDepthBoard.some((team) => team.teamName === "New York Yankees"), "team depth board should include current home team");
assert(matrix.games[0]?.topAngles.some((angle) => angle.sampleSize >= 60), "deep angle should carry real historical sample size");

console.log("mlb-team-game-trend-matrix tests passed");
