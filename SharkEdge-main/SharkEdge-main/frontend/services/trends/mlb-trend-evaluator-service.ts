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

function resolveHistoricalFieldValue(
  row: MlbTrendHistoricalRow,
  field: MlbTrendCondition["field"]
): string | number | boolean | null {
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
    default:
      return null;
  }
}

function compareCondition(
  actual: string | number | boolean | null,
  condition: MlbTrendCondition
) {
  if (actual === null || actual === undefined) {
    return false;
  }

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

export function matchesMlbTrendConditions(
  definition: MlbTrendDefinition,
  row: MlbTrendHistoricalRow
) {
  return definition.conditions.every((condition) =>
    compareCondition(resolveHistoricalFieldValue(row, condition.field), condition)
  );
}

function getPriceForBetSide(row: MlbTrendHistoricalRow, betSide: MlbTrendBetSide) {
  switch (betSide) {
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
    default:
      return null;
  }
}

function getProfitUnits(price: number) {
  return price > 0 ? price / 100 : 100 / Math.abs(price);
}

export function resolveMlbTrendResult(
  definition: MlbTrendDefinition,
  row: MlbTrendHistoricalRow
): ResolvedTrendResult {
  const price = getPriceForBetSide(row, definition.betSide);

  if (definition.betSide === "over") {
    if (row.closingTotal === null || row.closingTotal === undefined) {
      return { result: "skip", price: null, roiSupported: false };
    }

    const result: MlbTrendResult =
      row.totalRuns > row.closingTotal ? "win" : row.totalRuns < row.closingTotal ? "loss" : "push";
    return { result, price, roiSupported: typeof price === "number" };
  }

  if (definition.betSide === "under") {
    if (row.closingTotal === null || row.closingTotal === undefined) {
      return { result: "skip", price: null, roiSupported: false };
    }

    const result: MlbTrendResult =
      row.totalRuns < row.closingTotal ? "win" : row.totalRuns > row.closingTotal ? "loss" : "push";
    return { result, price, roiSupported: typeof price === "number" };
  }

  if (definition.betSide === "home_ml") {
    if (row.closingMoneylineHome === null || row.closingMoneylineHome === undefined) {
      return { result: "skip", price: null, roiSupported: false };
    }

    return {
      result: row.homeWon ? "win" : row.awayWon ? "loss" : "push",
      price,
      roiSupported: typeof price === "number"
    };
  }

  if (definition.betSide === "away_ml") {
    if (row.closingMoneylineAway === null || row.closingMoneylineAway === undefined) {
      return { result: "skip", price: null, roiSupported: false };
    }

    return {
      result: row.awayWon ? "win" : row.homeWon ? "loss" : "push",
      price,
      roiSupported: typeof price === "number"
    };
  }

  if (definition.betSide === "home_runline") {
    if (row.closingRunlineHome === null || row.closingRunlineHome === undefined) {
      return { result: "skip", price: null, roiSupported: false };
    }

    const adjusted = row.homeScore + row.closingRunlineHome - row.awayScore;
    const result: MlbTrendResult = adjusted > 0 ? "win" : adjusted < 0 ? "loss" : "push";
    return { result, price, roiSupported: typeof price === "number" };
  }

  if (row.closingRunlineAway === null || row.closingRunlineAway === undefined) {
    return { result: "skip", price: null, roiSupported: false };
  }

  const adjusted = row.awayScore + row.closingRunlineAway - row.homeScore;
  const result: MlbTrendResult = adjusted > 0 ? "win" : adjusted < 0 ? "loss" : "push";
  return { result, price, roiSupported: typeof price === "number" };
}

function getConfidenceLabel(sampleSize: number, roiCoverage: number) {
  if (sampleSize >= 80 && roiCoverage >= 0.7) {
    return "HIGH" as const;
  }

  if (sampleSize >= 30) {
    return "MEDIUM" as const;
  }

  return "LOW" as const;
}

function getStabilityLabel(sampleSize: number, hitRate: number, roiCoverage: number) {
  const edgeDistance = Math.abs(hitRate - 50);
  if (sampleSize >= 100 && edgeDistance >= 5 && roiCoverage >= 0.6) {
    return "STRONG" as const;
  }

  if (sampleSize >= 40) {
    return "STEADY" as const;
  }

  return "VOLATILE" as const;
}

function getTrendMarketWarning(definition: MlbTrendDefinition) {
  if (definition.betSide === "over" || definition.betSide === "under") {
    return "Trend relies on sparse total market history";
  }

  if (definition.betSide === "home_ml" || definition.betSide === "away_ml") {
    return "Trend relies on sparse moneyline history";
  }

  return "Trend relies on sparse runline history";
}

function buildWarnings(
  definition: MlbTrendDefinition,
  sampleSize: number,
  pricedRows: number,
  matchedRows: number,
  roiCoverage: number
) {
  const warnings: string[] = [];

  if (matchedRows > 0 && pricedRows < matchedRows) {
    warnings.push("Limited historical closing prices reduced ROI coverage");
  }

  if (sampleSize < 25) {
    warnings.push("Small sample size");
  }

  if (matchedRows > 0 && sampleSize === 0) {
    warnings.push("Historical matches exist, but usable graded market history is not populated yet");
  }

  if (sampleSize > 0 && roiCoverage < 0.6) {
    warnings.push(getTrendMarketWarning(definition));
  }

  return warnings;
}

export function buildMlbTrendSummary(
  definition: MlbTrendDefinition,
  results: ResolvedTrendResult[]
): MlbTrendEvaluationSummary {
  const wins = results.filter((entry) => entry.result === "win").length;
  const losses = results.filter((entry) => entry.result === "loss").length;
  const pushes = results.filter((entry) => entry.result === "push").length;
  const skips = results.filter((entry) => entry.result === "skip").length;
  const sampleSize = wins + losses + pushes;

  const gradedWithPrice = results.filter(
    (entry) => entry.result !== "skip" && entry.roiSupported && typeof entry.price === "number"
  );
  const pricedRows = gradedWithPrice.length;
  const roiCoverage = sampleSize > 0 ? pricedRows / sampleSize : 0;

  const units = gradedWithPrice.reduce((total, entry) => {
    if (entry.result === "push") {
      return total;
    }

    if (entry.result === "loss") {
      return total - 1;
    }

    return total + getProfitUnits(entry.price!);
  }, 0);

  const hitRate = sampleSize > 0 ? Number(((wins / sampleSize) * 100).toFixed(1)) : 0;
  const roi =
    pricedRows >= 10 && roiCoverage >= 0.6
      ? Number(((units / pricedRows) * 100).toFixed(1))
      : null;

  return {
    trendId: definition.id,
    wins,
    losses,
    pushes,
    skips,
    sampleSize,
    hitRate,
    roi,
    record: `${wins}-${losses}-${pushes}`,
    confidenceLabel: getConfidenceLabel(sampleSize, roiCoverage),
    stabilityLabel: getStabilityLabel(sampleSize, hitRate, roiCoverage),
    warnings: buildWarnings(definition, sampleSize, pricedRows, results.length, roiCoverage)
  };
}

export class DefaultMlbTrendEvaluatorService implements MlbTrendEvaluatorService {
  evaluateTrend(definition: MlbTrendDefinition, rows: MlbTrendHistoricalRow[]): MlbTrendEvaluationSummary {
    const matchingRows = rows.filter((row) => matchesMlbTrendConditions(definition, row));
    const results = matchingRows.map((row) => resolveMlbTrendResult(definition, row));
    return buildMlbTrendSummary(definition, results);
  }
}
