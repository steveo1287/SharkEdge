import type { HistoricalBetOpportunity, TrendCondition } from "../types";

export function getFieldValue(row: HistoricalBetOpportunity, field: string) {
  return (row as Record<string, unknown>)[field] ?? null;
}

export function rowMatchesCondition(row: HistoricalBetOpportunity, condition: TrendCondition) {
  const value = getFieldValue(row, condition.field);

  switch (condition.operator) {
    case "eq":
      return value === condition.value;
    case "neq":
      return value !== condition.value;
    case "gt":
      return typeof value === "number" && typeof condition.value === "number" && value > condition.value;
    case "gte":
      return typeof value === "number" && typeof condition.value === "number" && value >= condition.value;
    case "lt":
      return typeof value === "number" && typeof condition.value === "number" && value < condition.value;
    case "lte":
      return typeof value === "number" && typeof condition.value === "number" && value <= condition.value;
    case "between":
      return (
        typeof value === "number" &&
        typeof condition.value === "number" &&
        typeof condition.value2 === "number" &&
        value >= condition.value &&
        value <= condition.value2
      );
    case "is_true":
      return value === true;
    case "is_false":
      return value === false;
    default:
      return false;
  }
}

export function filterRowsByConditions(rows: HistoricalBetOpportunity[], conditions: TrendCondition[]) {
  return rows.filter((row) => conditions.every((condition) => rowMatchesCondition(row, condition)));
}
