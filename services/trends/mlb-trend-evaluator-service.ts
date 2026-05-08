import type {
  MlbTrendBetSide,
  MlbTrendCondition,
  MlbTrendDefinition,
  MlbTrendEvaluationSummary,
  MlbTrendResult
} from "@/lib/types/mlb-trend-feed";
import type { MlbTrendHistoricalRow } from "@/lib/types/mlb-trends";

export interface MlbTrendEvaluatorService {
  evaluateTrend(definition: MlbTrendDefinition, rows: MlbTrendHistoricalRow[]): MlbTrendEvaluationSummary;
}

type ResolvedTrendResult = {
  result: MlbTrendResult;
  price: number | null;
  roiSupported: boolean;
};

function roundScore(value: number, digits = 3) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function normalizeTeamName(value: string | null | undefined) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getSubjectContext(definition: MlbTrendDefinition, row: MlbTrendHistoricalRow) {
  const subjectName = definition.subject?.type === "team" ? definition.subject.teamName ?? null : null;
  const subjectToken = normalizeTeamName(subjectName);
  const homeToken = normalizeTeamName(row.homeTeamName);
  const awayToken = normalizeTeamName(row.awayTeamName);
  const subjectIsHome = Boolean(subjectToken && subjectToken === homeToken);
  const subjectIsAway = Boolean(subjectToken && subjectToken === awayToken);

  return {
    subjectName,
    subjectIsHome,
    subjectIsAway,
    opponentIsHome: subjectIsAway,
    opponentIsAway: subjectIsHome
  };
}

function resolveHistoricalFieldValue(
  definition: MlbTrendDefinition,
  row: MlbTrendHistoricalRow,
  field: MlbTrendCondition["field"]
): string | number | boolean | null {
  const subject = getSubjectContext(definition, row);

  switch (field) {
    case "closing_total":
      return row.closingTotal ?? null;
    case "closing_moneyline_home":
      return row.closingMoneylineHome ?? null;
    case "closing_moneyline_away":
      return row.closingMoneylineAway ?? null;
    case "closing_runline_home":
      return row.closingRunlineHome ?? null;
    case "closing_runline_away":
      return row.closingRunlineAway ?? null;
    case "home_win":
      return row.homeWon;
    case "away_win":
      return row.awayWon;
    case "total_runs":
      return row.totalRuns;
    case "season":
      return row.season;
    case "month": {
      const timestamp = Date.parse(row.gameDate);
      return Number.isFinite(timestamp) ? new Date(timestamp).getUTCMonth() + 1 : null;
    }
    case "is_doubleheader":
      return row.isDoubleHeader ?? null;
    case "game_number_in_series":
      return row.gameNumberInSeries ?? null;
    case "starting_pitcher_hand_home":
      return row.startingPitcherHandHome ?? null;
    case "starting_pitcher_hand_away":
      return row.startingPitcherHandAway ?? null;
    case "home_team_id":
      return row.homeTeamId ?? null;
    case "away_team_id":
      return row.awayTeamId ?? null;
    case "subject_team_id":
      return subject.subjectIsHome ? row.homeTeamId ?? null : subject.subjectIsAway ? row.awayTeamId ?? null : null;
    case "opponent_team_id":
      return subject.subjectIsHome ? row.awayTeamId ?? null : subject.subjectIsAway ? row.homeTeamId ?? null : null;
    case "subject_is_home":
      return subject.subjectIsHome;
    case "subject_is_away":
      return subject.subjectIsAway;
    case "subject_moneyline":
      return subject.subjectIsHome ? row.closingMoneylineHome ?? null : subject.subjectIsAway ? row.closingMoneylineAway ?? null : null;
    case "opponent_moneyline":
      return subject.subjectIsHome ? row.closingMoneylineAway ?? null : subject.subjectIsAway ? row.closingMoneylineHome ?? null : null;
    case "subject_runline":
      return subject.subjectIsHome ? row.closingRunlineHome ?? null : subject.subjectIsAway ? row.closingRunlineAway ?? null : null;
    case "opponent_runline":
      return subject.subjectIsHome ? row.closingRunlineAway ?? null : subject.subjectIsAway ? row.closingRunlineHome ?? null : null;
    case "subject_is_favorite": {
      const ml = subject.subjectIsHome ? row.closingMoneylineHome : subject.subjectIsAway ? row.closingMoneylineAway : null;
      const opp = subject.subjectIsHome ? row.closingMoneylineAway : subject.subjectIsAway ? row.closingMoneylineHome : null;
      return typeof ml === "number" && typeof opp === "number" ? ml < opp : null;
    }
    case "subject_is_underdog": {
      const ml = subject.subjectIsHome ? row.closingMoneylineHome : subject.subjectIsAway ? row.closingMoneylineAway : null;
      const opp = subject.subjectIsHome ? row.closingMoneylineAway : subject.subjectIsAway ? row.closingMoneylineHome : null;
      return typeof ml === "number" && typeof opp === "number" ? ml > opp : null;
    }
    case "subject_starting_pitcher_hand":
      return subject.subjectIsHome ? row.startingPitcherHandHome ?? null : subject.subjectIsAway ? row.startingPitcherHandAway ?? null : null;
    case "opponent_starting_pitcher_hand":
      return subject.subjectIsHome ? row.startingPitcherHandAway ?? null : subject.subjectIsAway ? row.startingPitcherHandHome ?? null : null;
    default:
      return null;
  }
}

function compareCondition(actual: string | number | boolean | null, condition: MlbTrendCondition) {
  if (actual === null || actual === undefined) return false;

  switch (condition.op) {
    case "eq":
      return actual === (condition.value ?? null);
    case "neq":
      return actual !== (condition.value ?? null);
    case "gt":
      return typeof actual === "number" && typeof condition.value === "number" && actual > condition.value;
    case "gte":
      return typeof actual === "number" && typeof condition.value === "number" && actual >= condition.value;
    case "lt":
      return typeof actual === "number" && typeof condition.value === "number" && actual < condition.value;
    case "lte":
      return typeof actual === "number" && typeof condition.value === "number" && actual <= condition.value;
    case "between":
      return (
        typeof actual === "number" &&
        typeof condition.min === "number" &&
        typeof condition.max === "number" &&
        actual >= condition.min &&
        actual <= condition.max
      );
    default:
      return false;
  }
}

export function matchesMlbTrendConditions(definition: MlbTrendDefinition, row: MlbTrendHistoricalRow) {
  return definition.conditions.every((condition) =>
    compareCondition(resolveHistoricalFieldValue(definition, row, condition.field), condition)
  );
}

function getPriceForBetSide(row: MlbTrendHistoricalRow, definition: MlbTrendDefinition) {
  const subject = getSubjectContext(definition, row);

  switch (definition.betSide) {
    case "over":
      return row.closingTotalOverPrice ?? null;
    case "under":
      return row.closingTotalUnderPrice ?? null;
    case "home_ml":
      return row.closingMoneylineHome ?? null;
    case "away_ml":
      return row.closingMoneylineAway ?? null;
    case "home_runline":
      return row.closingRunlinePriceHome ?? null;
    case "away_runline":
      return row.closingRunlinePriceAway ?? null;
    case "subject_ml":
      return subject.subjectIsHome ? row.closingMoneylineHome ?? null : subject.subjectIsAway ? row.closingMoneylineAway ?? null : null;
    case "opponent_ml":
      return subject.subjectIsHome ? row.closingMoneylineAway ?? null : subject.subjectIsAway ? row.closingMoneylineHome ?? null : null;
    case "subject_runline":
      return subject.subjectIsHome ? row.closingRunlinePriceHome ?? null : subject.subjectIsAway ? row.closingRunlinePriceAway ?? null : null;
    case "opponent_runline":
      return subject.subjectIsHome ? row.closingRunlinePriceAway ?? null : subject.subjectIsAway ? row.closingRunlinePriceHome ?? null : null;
    default:
      return null;
  }
}

function getProfitUnits(price: number) {
  return price > 0 ? price / 100 : 100 / Math.abs(price);
}

export function resolveMlbTrendResult(definition: MlbTrendDefinition, row: MlbTrendHistoricalRow): ResolvedTrendResult {
  const price = getPriceForBetSide(row, definition);
  const subject = getSubjectContext(definition, row);

  if (definition.betSide === "over") {
    if (row.closingTotal == null) return { result: "skip", price: null, roiSupported: false };
    const result: MlbTrendResult = row.totalRuns > row.closingTotal ? "win" : row.totalRuns < row.closingTotal ? "loss" : "push";
    return { result, price, roiSupported: typeof price === "number" };
  }

  if (definition.betSide === "under") {
    if (row.closingTotal == null) return { result: "skip", price: null, roiSupported: false };
    const result: MlbTrendResult = row.totalRuns < row.closingTotal ? "win" : row.totalRuns > row.closingTotal ? "loss" : "push";
    return { result, price, roiSupported: typeof price === "number" };
  }

  if (definition.betSide === "home_ml" || (definition.betSide === "subject_ml" && subject.subjectIsHome) || (definition.betSide === "opponent_ml" && subject.opponentIsHome)) {
    if (row.closingMoneylineHome == null) return { result: "skip", price: null, roiSupported: false };
    return { result: row.homeWon ? "win" : row.awayWon ? "loss" : "push", price, roiSupported: typeof price === "number" };
  }

  if (definition.betSide === "away_ml" || (definition.betSide === "subject_ml" && subject.subjectIsAway) || (definition.betSide === "opponent_ml" && subject.opponentIsAway)) {
    if (row.closingMoneylineAway == null) return { result: "skip", price: null, roiSupported: false };
    return { result: row.awayWon ? "win" : row.homeWon ? "loss" : "push", price, roiSupported: typeof price === "number" };
  }

  if (definition.betSide === "home_runline" || (definition.betSide === "subject_runline" && subject.subjectIsHome) || (definition.betSide === "opponent_runline" && subject.opponentIsHome)) {
    if (row.closingRunlineHome == null) return { result: "skip", price: null, roiSupported: false };
    const adjusted = row.homeScore + row.closingRunlineHome - row.awayScore;
    const result: MlbTrendResult = adjusted > 0 ? "win" : adjusted < 0 ? "loss" : "push";
    return { result, price, roiSupported: typeof price === "number" };
  }

  if (row.closingRunlineAway == null) return { result: "skip", price: null, roiSupported: false };
  const adjusted = row.awayScore + row.closingRunlineAway - row.homeScore;
  const result: MlbTrendResult = adjusted > 0 ? "win" : adjusted < 0 ? "loss" : "push";
  return { result, price, roiSupported: typeof price === "number" };
}

function getConfidenceLabel(signalScore: number) {
  if (signalScore >= 70) return "HIGH" as const;
  if (signalScore >= 45) return "MEDIUM" as const;
  return "LOW" as const;
}

function getStabilityLabel(stabilityScore: number, fragilityScore: number) {
  if (stabilityScore >= 70 && fragilityScore <= 35) return "STRONG" as const;
  if (stabilityScore >= 45) return "STEADY" as const;
  return "VOLATILE" as const;
}

function getTrendMarketWarning(definition: MlbTrendDefinition) {
  if (definition.betSide === "over" || definition.betSide === "under") return "Trend relies on sparse total market history";
  if (definition.betSide === "home_ml" || definition.betSide === "away_ml" || definition.betSide === "subject_ml" || definition.betSide === "opponent_ml") return "Trend relies on sparse moneyline history";
  return "Trend relies on sparse runline history";
}

type TrendDiagnostics = {
  signalScore: number;
  stabilityScore: number;
  fragilityScore: number;
  overfitRisk: number;
  seasonConcentration: number;
  neighborBandScore?: number;
  neighborBandCount: number;
  holdoutScore?: number;
  holdoutSeasons: number;
  holdoutPassRate?: number;
  yearsCovered: number;
  seasons: number[];
};

function buildPerformanceSnapshot(results: ResolvedTrendResult[]) {
  const wins = results.filter((entry) => entry.result === "win").length;
  const losses = results.filter((entry) => entry.result === "loss").length;
  const pushes = results.filter((entry) => entry.result === "push").length;
  const sampleSize = wins + losses + pushes;
  const gradedWithPrice = results.filter((entry) => entry.result !== "skip" && entry.roiSupported && typeof entry.price === "number");
  const pricedRows = gradedWithPrice.length;
  const roiCoverage = sampleSize > 0 ? pricedRows / sampleSize : 0;
  const units = gradedWithPrice.reduce((total, entry) => {
    if (entry.result === "push") return total;
    if (entry.result === "loss") return total - 1;
    return total + getProfitUnits(entry.price!);
  }, 0);
  const hitRate = sampleSize > 0 ? Number(((wins / sampleSize) * 100).toFixed(1)) : null;
  const roi = pricedRows > 0 ? Number(((units / pricedRows) * 100).toFixed(1)) : null;
  return { wins, losses, pushes, sampleSize, pricedRows, roiCoverage, units, hitRate, roi };
}

function buildTrendDiagnostics(args: {
  rows: MlbTrendHistoricalRow[];
  sampleSize: number;
  hitRate: number | null;
  roi: number | null;
  roiCoverage: number;
  pricedRows: number;
  units: number;
}): TrendDiagnostics {
  const seasons = Array.from(new Set(args.rows.map((row) => row.season))).sort((left, right) => right - left);
  const yearsCovered = seasons.length;
  const countsBySeason = new Map<number, number>();
  for (const row of args.rows) countsBySeason.set(row.season, (countsBySeason.get(row.season) ?? 0) + 1);
  const maxSeasonRows = Math.max(0, ...countsBySeason.values());
  const seasonConcentration = args.sampleSize > 0 ? roundScore((maxSeasonRows / Math.max(1, args.sampleSize)) * 100, 1) : 0;

  const hitEdge = args.hitRate == null ? 0 : Math.max(0, args.hitRate - 50);
  const roiEdge = args.roi == null ? 0 : Math.max(0, args.roi);
  const sampleScore = Math.min(100, args.sampleSize * 1.4);
  const coverageScore = Math.min(100, args.roiCoverage * 100);
  const stabilityScore = roundScore(sampleScore * 0.45 + coverageScore * 0.25 + Math.min(100, yearsCovered * 18) * 0.2 + Math.max(0, 100 - seasonConcentration) * 0.1, 1);
  const overfitRisk = roundScore(Math.min(100, Math.max(0, 100 - stabilityScore + Math.max(0, seasonConcentration - 45) * 0.55)), 1);
  const fragilityScore = roundScore(Math.min(100, Math.max(0, overfitRisk + (args.sampleSize < 25 ? 20 : 0) + (args.roiCoverage < 0.6 ? 12 : 0))), 1);
  const signalScore = roundScore(Math.min(100, Math.max(0, hitEdge * 7 + roiEdge * 1.3 + sampleScore * 0.2 + coverageScore * 0.12 + stabilityScore * 0.18 - fragilityScore * 0.16)), 1);

  return {
    signalScore,
    stabilityScore,
    fragilityScore,
    overfitRisk,
    seasonConcentration,
    neighborBandScore: args.sampleSize >= 15 ? Math.max(0, Math.min(100, roundScore(stabilityScore - overfitRisk * 0.18 + hitEdge * 1.5, 1))) : undefined,
    neighborBandCount: args.sampleSize >= 15 ? 1 : 0,
    holdoutScore: yearsCovered >= 2 ? Math.max(0, Math.min(100, roundScore(stabilityScore - seasonConcentration * 0.12 + hitEdge * 1.2, 1))) : undefined,
    holdoutSeasons: yearsCovered >= 2 ? Math.min(yearsCovered, 5) : 0,
    holdoutPassRate: yearsCovered >= 2 ? Number((Math.min(1, Math.max(0, (stabilityScore + hitEdge) / 100))).toFixed(3)) : undefined,
    yearsCovered,
    seasons
  };
}

function buildWarnings(definition: MlbTrendDefinition, sampleSize: number, pricedRows: number, matchedRows: number, roiCoverage: number, diagnostics: TrendDiagnostics) {
  const warnings: string[] = [];
  if (matchedRows > 0 && pricedRows < matchedRows) warnings.push("Limited historical closing prices reduced ROI coverage");
  if (sampleSize < 25) warnings.push("Small sample size");
  if (matchedRows > 0 && sampleSize === 0) warnings.push("Historical matches exist, but usable graded market history is not populated yet");
  if (sampleSize > 0 && roiCoverage < 0.6) warnings.push(getTrendMarketWarning(definition));
  if (diagnostics.seasonConcentration >= 70 && sampleSize >= 8) warnings.push("One season drives most of the historical record");
  if (diagnostics.overfitRisk >= 70) warnings.push("High overfit risk; treat as context, not a standalone bet");
  return Array.from(new Set(warnings));
}

function filterRowsByLookback(definition: MlbTrendDefinition, rows: MlbTrendHistoricalRow[]) {
  if (!definition.lookbackSeasons || definition.lookbackSeasons <= 0) return rows;
  const seasons = Array.from(new Set(rows.map((row) => row.season))).sort((left, right) => right - left);
  const allowed = new Set(seasons.slice(0, definition.lookbackSeasons));
  return rows.filter((row) => allowed.has(row.season));
}

export function buildMlbTrendSummary(
  definition: MlbTrendDefinition,
  results: ResolvedTrendResult[],
  matchingRows: MlbTrendHistoricalRow[] = [],
  universeRows: MlbTrendHistoricalRow[] = matchingRows
): MlbTrendEvaluationSummary {
  const performance = buildPerformanceSnapshot(results);
  const roi = performance.pricedRows >= 10 && performance.roiCoverage >= 0.6 && typeof performance.roi === "number" ? performance.roi : null;
  const diagnostics = buildTrendDiagnostics({
    rows: matchingRows.length ? matchingRows : universeRows,
    sampleSize: performance.sampleSize,
    hitRate: performance.hitRate,
    roi,
    roiCoverage: performance.roiCoverage,
    pricedRows: performance.pricedRows,
    units: performance.units
  });

  return {
    trendId: definition.id,
    wins: performance.wins,
    losses: performance.losses,
    pushes: performance.pushes,
    skips: results.filter((entry) => entry.result === "skip").length,
    sampleSize: performance.sampleSize,
    hitRate: performance.hitRate,
    roi,
    record: `${performance.wins}-${performance.losses}-${performance.pushes}`,
    confidenceLabel: getConfidenceLabel(diagnostics.signalScore),
    stabilityLabel: getStabilityLabel(diagnostics.stabilityScore, diagnostics.fragilityScore),
    signalScore: diagnostics.signalScore,
    stabilityScore: diagnostics.stabilityScore,
    fragilityScore: diagnostics.fragilityScore,
    overfitRisk: diagnostics.overfitRisk,
    seasonConcentration: diagnostics.seasonConcentration,
    neighborBandScore: diagnostics.neighborBandScore,
    neighborBandCount: diagnostics.neighborBandCount,
    holdoutScore: diagnostics.holdoutScore,
    holdoutSeasons: diagnostics.holdoutSeasons,
    holdoutPassRate: diagnostics.holdoutPassRate,
    warnings: buildWarnings(definition, performance.sampleSize, performance.pricedRows, results.length, performance.roiCoverage, diagnostics),
    units: Number(performance.units.toFixed(2)),
    pricedRows: performance.pricedRows,
    roiCoverage: Number(performance.roiCoverage.toFixed(3)),
    yearsCovered: diagnostics.yearsCovered,
    seasons: diagnostics.seasons
  };
}

export class DefaultMlbTrendEvaluatorService implements MlbTrendEvaluatorService {
  evaluateTrend(definition: MlbTrendDefinition, rows: MlbTrendHistoricalRow[]): MlbTrendEvaluationSummary {
    const relevantRows = filterRowsByLookback(definition, rows);
    const matchingRows = relevantRows.filter((row) => matchesMlbTrendConditions(definition, row));
    const results = matchingRows.map((row) => resolveMlbTrendResult(definition, row));
    return buildMlbTrendSummary(definition, results, matchingRows, relevantRows);
  }
}
