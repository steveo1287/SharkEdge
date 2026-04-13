import type { MlbTrendDefinition } from "@/lib/types/mlb-trend-feed";
import type { MlbTrendBoardRow, MlbTrendHistoricalRow } from "@/lib/types/mlb-trends";
import { DefaultMlbTrendActiveMatchService } from "@/services/trends/mlb-trend-active-match-service";
import {
  DefaultMlbTrendEvaluatorService,
  resolveMlbTrendResult
} from "@/services/trends/mlb-trend-evaluator-service";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const evaluator = new DefaultMlbTrendEvaluatorService();
const activeMatches = new DefaultMlbTrendActiveMatchService();

function makeHistoricalRow(overrides: Partial<MlbTrendHistoricalRow> = {}): MlbTrendHistoricalRow {
  return {
    gameId: "hist-1",
    externalGameId: "401814733",
    gameDate: "2026-04-04T00:00:00.000Z",
    season: 2026,
    league: "MLB",
    homeTeamId: "home",
    awayTeamId: "away",
    homeTeamName: "Chicago Cubs",
    awayTeamName: "St. Louis Cardinals",
    homeScore: 5,
    awayScore: 3,
    totalRuns: 8,
    homeWon: true,
    awayWon: false,
    closingMoneylineHome: -130,
    closingMoneylineAway: 118,
    closingRunlineHome: -1.5,
    closingRunlineAway: 1.5,
    closingRunlinePriceHome: 135,
    closingRunlinePriceAway: -150,
    closingTotal: 7.5,
    closingTotalOverPrice: -110,
    closingTotalUnderPrice: -110,
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
    source: "test",
    ...overrides
  };
}

function makeBoardRow(overrides: Partial<MlbTrendBoardRow> = {}): MlbTrendBoardRow {
  return {
    gameId: "board-1",
    externalGameId: "401814744",
    startsAt: "2026-04-04T19:10:00.000Z",
    league: "MLB",
    homeTeamId: "home",
    awayTeamId: "away",
    homeTeamName: "Chicago Cubs",
    awayTeamName: "St. Louis Cardinals",
    matchup: "St. Louis Cardinals at Chicago Cubs",
    currentMoneylineHome: -132,
    currentMoneylineAway: 120,
    currentRunlineHome: -1.5,
    currentRunlineAway: 1.5,
    currentRunlinePriceHome: 138,
    currentRunlinePriceAway: -152,
    currentTotal: 9.5,
    currentTotalOverPrice: -108,
    currentTotalUnderPrice: -112,
    startingPitcherHome: null,
    startingPitcherAway: null,
    startingPitcherHandHome: null,
    startingPitcherHandAway: null,
    status: "PREGAME",
    source: "test",
    ...overrides
  };
}

const overDefinition: MlbTrendDefinition = {
  id: "over-test",
  family: "TOTALS",
  title: "Low total over",
  description: "Test over definition",
  betSide: "over",
  conditions: [{ field: "closing_total", op: "lte", value: 7.5 }],
  whyThisMatters: "Test",
  cautionNote: "Test",
  enabled: true
};

const moneylineDefinition: MlbTrendDefinition = {
  id: "home-ml-test",
  family: "MONEYLINE",
  title: "Home ML",
  description: "Test moneyline definition",
  betSide: "home_ml",
  conditions: [{ field: "closing_moneyline_home", op: "between", min: -150, max: -120 }],
  whyThisMatters: "Test",
  cautionNote: "Test",
  enabled: true
};

const runlineDefinition: MlbTrendDefinition = {
  id: "home-runline-test",
  family: "RUNLINE",
  title: "Home RL",
  description: "Test runline definition",
  betSide: "home_runline",
  conditions: [{ field: "closing_runline_home", op: "lte", value: -1.5 }],
  whyThisMatters: "Test",
  cautionNote: "Test",
  enabled: true
};

const marketMissingDefinition: MlbTrendDefinition = {
  id: "market-missing-test",
  family: "SITUATIONAL",
  title: "April over check",
  description: "Test missing market path",
  betSide: "over",
  conditions: [{ field: "month", op: "eq", value: 4 }],
  whyThisMatters: "Test",
  cautionNote: "Test",
  enabled: true
};

const overResult = resolveMlbTrendResult(overDefinition, makeHistoricalRow({ totalRuns: 9, closingTotal: 8.5 }));
assert(overResult.result === "win", "over should win when total runs exceed closing total");

const moneylineSummary = evaluator.evaluateTrend(moneylineDefinition, [makeHistoricalRow()]);
assert(moneylineSummary.wins === 1, "home moneyline should count a home win");
assert(moneylineSummary.sampleSize === 1, "moneyline sample size should count graded result");

const runlineSummary = evaluator.evaluateTrend(runlineDefinition, [makeHistoricalRow()]);
assert(runlineSummary.wins === 1, "home runline should grade a cover correctly");

const missingTotalSummary = evaluator.evaluateTrend(marketMissingDefinition, [
  makeHistoricalRow({ closingTotal: null, closingTotalOverPrice: null })
]);
assert(missingTotalSummary.sampleSize === 0, "missing closing total should not produce graded sample");
assert(missingTotalSummary.skips === 1, "missing closing total should count as skip");

const partialRoiSummary = evaluator.evaluateTrend(overDefinition, [
  makeHistoricalRow({ gameId: "a", totalRuns: 9, closingTotal: 7.5, closingTotalOverPrice: -110 }),
  makeHistoricalRow({ gameId: "b", totalRuns: 9, closingTotal: 7.5, closingTotalOverPrice: null })
]);
assert(partialRoiSummary.sampleSize === 2, "matched rows with totals should still grade sample");
assert(partialRoiSummary.roi === null, "roi should stay null when usable price coverage is too thin");
assert(
  partialRoiSummary.warnings.some((warning) => warning.includes("ROI coverage")),
  "partial ROI coverage should emit a warning"
);

const activeMatchesResult = activeMatches.findMatches(
  {
    ...overDefinition,
    id: "high-total-under",
    title: "High total under",
    betSide: "under",
    conditions: [{ field: "closing_total", op: "gte", value: 9 }]
  },
  [makeBoardRow()]
);
assert(activeMatchesResult.length === 1, "board row should produce a live trend match");
assert(activeMatchesResult[0]?.recommendedBet === "Under 9.5", "active match should format recommended total bet");

console.log("mlb-trend-evaluator tests passed");
