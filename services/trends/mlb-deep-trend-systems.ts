import type {
  MlbTrendDefinition,
  MlbTrendEvaluationSummary,
  MlbTrendHistoryRow,
  MlbTrendResult,
  PublishedMlbTrendCard,
  PublishedMlbTrendFeed
} from "@/lib/types/mlb-trend-feed";
import type { MlbTrendHistoricalRow } from "@/lib/types/mlb-trends";

import { getDeepMlbTrendDefinitions } from "./mlb-deep-trend-definition-service";
import { DefaultMlbTrendActiveMatchService } from "./mlb-trend-active-match-service";
import {
  buildMlbTrendSummary,
  matchesMlbTrendConditions,
  resolveMlbTrendResult
} from "./mlb-trend-evaluator-service";
import {
  loadNormalizedMlbBoardTrendRows,
  loadNormalizedMlbHistoricalTrendRows
} from "./mlb-trends-data-adapters";

function confidenceRank(value: PublishedMlbTrendCard["confidenceLabel"]) {
  if (value === "HIGH") return 2;
  if (value === "MEDIUM") return 1;
  return 0;
}

function stabilityRank(value: PublishedMlbTrendCard["stabilityLabel"]) {
  if (value === "STRONG") return 2;
  if (value === "STEADY") return 1;
  return 0;
}

function getProfitUnits(price: number) {
  return price > 0 ? price / 100 : 100 / Math.abs(price);
}

function getFlatProfitUnits(result: Exclude<MlbTrendResult, "skip">, price: number | null) {
  if (result === "push") return 0;
  if (result === "loss") return -1;
  if (typeof price === "number") return getProfitUnits(price);
  return 1;
}

function getRecommendedBet(definition: MlbTrendDefinition, row: MlbTrendHistoricalRow) {
  switch (definition.betSide) {
    case "over":
      return `Over ${row.closingTotal ?? "TBD"}`;
    case "under":
      return `Under ${row.closingTotal ?? "TBD"}`;
    case "home_ml":
      return `${row.homeTeamName} ML`;
    case "away_ml":
      return `${row.awayTeamName} ML`;
    case "home_runline":
      return `${row.homeTeamName} ${row.closingRunlineHome ?? "RL"}`;
    case "away_runline":
      return `${row.awayTeamName} ${row.closingRunlineAway ?? "RL"}`;
    default:
      return definition.title;
  }
}

function historyRow(definition: MlbTrendDefinition, row: MlbTrendHistoricalRow): MlbTrendHistoryRow | null {
  const resolved = resolveMlbTrendResult(definition, row);
  if (resolved.result === "skip") return null;

  return {
    gameId: row.gameId,
    gameDate: row.gameDate,
    season: row.season,
    matchup: `${row.awayTeamName} @ ${row.homeTeamName}`,
    recommendedBet: getRecommendedBet(definition, row),
    result: resolved.result,
    price: resolved.price,
    profitUnits: Number(getFlatProfitUnits(resolved.result, resolved.price).toFixed(2)),
    awayTeamName: row.awayTeamName,
    homeTeamName: row.homeTeamName,
    awayScore: row.awayScore,
    homeScore: row.homeScore,
    closingTotal: row.closingTotal ?? null
  };
}

function last10(history: MlbTrendHistoryRow[]) {
  const recent = history.slice(0, 10);
  const wins = recent.filter((row) => row.result === "win").length;
  const losses = recent.filter((row) => row.result === "loss").length;
  const pushes = recent.filter((row) => row.result === "push").length;
  return `${wins}-${losses}-${pushes}`;
}

function streak(history: MlbTrendHistoryRow[]) {
  const first = history.find((row) => row.result !== "push");
  if (!first) return null;

  let count = 0;
  for (const row of history) {
    if (row.result === "push") continue;
    if (row.result !== first.result) break;
    count += 1;
  }

  return `${first.result === "win" ? "W" : "L"}${count}`;
}

function fallbackConditionLabel(condition: MlbTrendDefinition["conditions"][number]) {
  const field = condition.field.replace(/_/g, " ");
  if (condition.op === "between") return `${field} between ${condition.min} and ${condition.max}`;
  return `${field} ${condition.op} ${condition.value}`;
}

function conditionLabels(definition: MlbTrendDefinition) {
  return definition.conditionLabels?.length
    ? definition.conditionLabels
    : definition.conditions.map(fallbackConditionLabel);
}

function enrichSummary(
  definition: MlbTrendDefinition,
  summary: MlbTrendEvaluationSummary,
  rows: MlbTrendHistoricalRow[]
) {
  const history = rows
    .filter((row) => matchesMlbTrendConditions(definition, row))
    .map((row) => historyRow(definition, row))
    .filter((row): row is MlbTrendHistoryRow => Boolean(row))
    .sort((left, right) => Date.parse(right.gameDate) - Date.parse(left.gameDate));
  const seasons = Array.from(new Set(history.map((row) => row.season))).sort((left, right) => right - left);
  const pricedRows = history.filter((row) => typeof row.price === "number").length;
  const units = history
    .filter((row) => typeof row.price === "number")
    .reduce((sum, row) => sum + row.profitUnits, 0);
  const roiCoverage = summary.sampleSize > 0 ? pricedRows / summary.sampleSize : 0;

  return {
    units: Number(units.toFixed(2)),
    pricedRows,
    roiCoverage: Number(roiCoverage.toFixed(3)),
    last10: last10(history),
    streak: streak(history),
    yearsCovered: seasons.length,
    seasons,
    history: history.slice(0, 60)
  };
}

function warnings(args: { historicalWarnings: string[]; boardWarnings: string[]; cards: PublishedMlbTrendCard[] }) {
  const values = [...args.historicalWarnings, ...args.boardWarnings];
  if (!args.cards.length) values.push("No deep MLB trend systems are publishable from current historical coverage.");
  if (args.cards.some((card) => card.roi === null)) values.push("Some trend ROI values are pending because closing-price coverage is incomplete.");
  return Array.from(new Set(values));
}

function buildCard(definition: MlbTrendDefinition, summary: MlbTrendEvaluationSummary, rows: MlbTrendHistoricalRow[], boardRows: Awaited<ReturnType<typeof loadNormalizedMlbBoardTrendRows>>["rows"]): PublishedMlbTrendCard {
  const deep = enrichSummary(definition, summary, rows);
  const todayMatches = new DefaultMlbTrendActiveMatchService().findMatches(definition, boardRows);
  return {
    id: definition.id,
    family: definition.family,
    title: definition.title,
    description: definition.description,
    betSide: definition.betSide,
    whyThisMatters: definition.whyThisMatters,
    cautionNote: definition.cautionNote,
    wins: summary.wins,
    losses: summary.losses,
    pushes: summary.pushes,
    sampleSize: summary.sampleSize,
    record: summary.record,
    hitRate: summary.hitRate,
    roi: summary.roi,
    confidenceLabel: summary.confidenceLabel,
    stabilityLabel: summary.stabilityLabel,
    warnings: summary.warnings,
    todayMatches,
    conditions: conditionLabels(definition),
    conditionCount: conditionLabels(definition).length,
    units: deep.units,
    pricedRows: deep.pricedRows,
    roiCoverage: deep.roiCoverage,
    last10: deep.last10,
    streak: deep.streak,
    yearsCovered: deep.yearsCovered,
    seasons: deep.seasons,
    history: deep.history
  };
}

export async function buildDeepMlbTrendSystems(): Promise<PublishedMlbTrendFeed> {
  const [historical, board] = await Promise.all([
    loadNormalizedMlbHistoricalTrendRows(),
    loadNormalizedMlbBoardTrendRows()
  ]);
  const cards = getDeepMlbTrendDefinitions()
    .map((definition) => buildCard(definition, buildMlbTrendSummary(
      definition,
      historical.rows.filter((row) => matchesMlbTrendConditions(definition, row)).map((row) => resolveMlbTrendResult(definition, row))
    ), historical.rows, board.rows))
    .sort((left, right) => {
      const confidenceDelta = confidenceRank(right.confidenceLabel) - confidenceRank(left.confidenceLabel);
      if (confidenceDelta !== 0) return confidenceDelta;
      const stabilityDelta = stabilityRank(right.stabilityLabel) - stabilityRank(left.stabilityLabel);
      if (stabilityDelta !== 0) return stabilityDelta;
      const currentDelta = right.todayMatches.length - left.todayMatches.length;
      if (currentDelta !== 0) return currentDelta;
      return right.sampleSize - left.sampleSize;
    });

  return {
    generatedAt: new Date().toISOString(),
    cards,
    warnings: warnings({ historicalWarnings: historical.warnings, boardWarnings: board.warnings, cards })
  };
}
