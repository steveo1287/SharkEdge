import type { MlbTrendCondition, MlbTrendDefinition, MlbTrendMatch } from "@/lib/types/mlb-trend-feed";
import type { MlbTrendBoardRow } from "@/lib/types/mlb-trends";

export interface MlbTrendActiveMatchService {
  findMatches(definition: MlbTrendDefinition, rows: MlbTrendBoardRow[]): MlbTrendMatch[];
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

function resolveBoardFieldValue(
  row: MlbTrendBoardRow,
  field: MlbTrendCondition["field"]
): string | number | boolean | null {
  switch (field) {
    case "closing_total":
      return row.currentTotal ?? null;
    case "closing_moneyline_home":
      return row.currentMoneylineHome ?? null;
    case "closing_moneyline_away":
      return row.currentMoneylineAway ?? null;
    case "closing_runline_home":
      return row.currentRunlineHome ?? null;
    case "closing_runline_away":
      return row.currentRunlineAway ?? null;
    case "season": {
      const timestamp = row.startsAt ? Date.parse(row.startsAt) : NaN;
      return Number.isFinite(timestamp) ? new Date(timestamp).getUTCFullYear() : null;
    }
    case "month": {
      const timestamp = row.startsAt ? Date.parse(row.startsAt) : NaN;
      return Number.isFinite(timestamp) ? new Date(timestamp).getUTCMonth() + 1 : null;
    }
    case "starting_pitcher_hand_home":
      return row.startingPitcherHandHome ?? null;
    case "starting_pitcher_hand_away":
      return row.startingPitcherHandAway ?? null;
    default:
      return null;
  }
}

function matchesBoardConditions(definition: MlbTrendDefinition, row: MlbTrendBoardRow) {
  return definition.conditions.every((condition) =>
    compareCondition(resolveBoardFieldValue(row, condition.field), condition)
  );
}

function formatSignedNumber(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return `${value > 0 ? "+" : ""}${value}`;
}

function getMarketType(definition: MlbTrendDefinition): "moneyline" | "runline" | "total" {
  if (definition.betSide === "over" || definition.betSide === "under") {
    return "total";
  }

  if (definition.betSide === "home_runline" || definition.betSide === "away_runline") {
    return "runline";
  }

  return "moneyline";
}

function buildRecommendedBet(definition: MlbTrendDefinition, row: MlbTrendBoardRow) {
  switch (definition.betSide) {
    case "over":
      return `Over ${row.currentTotal ?? "TBD"}`;
    case "under":
      return `Under ${row.currentTotal ?? "TBD"}`;
    case "home_ml":
      return `${row.homeTeamName} ML`;
    case "away_ml":
      return `${row.awayTeamName} ML`;
    case "home_runline":
      return `${row.homeTeamName} ${formatSignedNumber(row.currentRunlineHome) ?? "RL"}`;
    case "away_runline":
      return `${row.awayTeamName} ${formatSignedNumber(row.currentRunlineAway) ?? "RL"}`;
    default:
      return definition.title;
  }
}

function buildExplanation(definition: MlbTrendDefinition, row: MlbTrendBoardRow) {
  const marketType = getMarketType(definition);
  if (marketType === "total") {
    return `Current total still sits inside the ${definition.title.toLowerCase()} band.`;
  }

  if (marketType === "moneyline") {
    return `Current moneyline still fits the ${definition.title.toLowerCase()} profile.`;
  }

  return `Current runline still matches the ${definition.title.toLowerCase()} profile.`;
}

export class DefaultMlbTrendActiveMatchService implements MlbTrendActiveMatchService {
  findMatches(definition: MlbTrendDefinition, rows: MlbTrendBoardRow[]): MlbTrendMatch[] {
    return rows
      .filter((row) => matchesBoardConditions(definition, row))
      .filter((row) => {
        if (definition.betSide === "over" || definition.betSide === "under") {
          return row.currentTotal !== null && row.currentTotal !== undefined;
        }

        if (definition.betSide === "home_ml") {
          return row.currentMoneylineHome !== null && row.currentMoneylineHome !== undefined;
        }

        if (definition.betSide === "away_ml") {
          return row.currentMoneylineAway !== null && row.currentMoneylineAway !== undefined;
        }

        if (definition.betSide === "home_runline") {
          return row.currentRunlineHome !== null && row.currentRunlineHome !== undefined;
        }

        return row.currentRunlineAway !== null && row.currentRunlineAway !== undefined;
      })
      .map((row) => ({
        trendId: definition.id,
        gameId: row.gameId,
        matchup: row.matchup,
        startsAt: row.startsAt ?? null,
        recommendedBet: buildRecommendedBet(definition, row),
        explanation: buildExplanation(definition, row),
        marketType: getMarketType(definition)
      }));
  }
}
