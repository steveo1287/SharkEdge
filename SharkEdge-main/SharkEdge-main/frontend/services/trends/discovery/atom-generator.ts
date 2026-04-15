import { trendFeatureRegistry } from "./feature-registry";
import { getFieldValue } from "./helpers";
import type { HistoricalBetOpportunity, TrendCondition } from "../types";

function isPrimitiveValue(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function uniquePrimitiveValues(rows: HistoricalBetOpportunity[], field: string) {
  return Array.from(
    new Set(
      rows
        .map((row) => getFieldValue(row, field))
        .filter(isPrimitiveValue)
    )
  );
}

export function generateTrendAtoms(rows: HistoricalBetOpportunity[]) {
  const atoms: TrendCondition[] = [];

  for (const feature of trendFeatureRegistry) {
    if (feature.type === "categorical") {
      const values = feature.allowedValues ?? uniquePrimitiveValues(rows, String(feature.field));
      for (const value of values.slice(0, 20)) {
        atoms.push({
          field: String(feature.field),
          operator: "eq",
          value,
          label: `${String(feature.field)} ${String(value)}`,
          group: feature.group
        });
      }
      continue;
    }

    if (feature.type === "boolean") {
      atoms.push({
        field: String(feature.field),
        operator: "is_true",
        label: `${String(feature.field)} true`,
        group: feature.group
      });
      atoms.push({
        field: String(feature.field),
        operator: "is_false",
        label: `${String(feature.field)} false`,
        group: feature.group
      });
      continue;
    }

    for (const bucket of feature.buckets ?? []) {
      atoms.push({
        field: String(feature.field),
        operator: "gte",
        value: bucket,
        label: `${String(feature.field)} >= ${bucket}`,
        group: feature.group
      });
      atoms.push({
        field: String(feature.field),
        operator: "lte",
        value: bucket,
        label: `${String(feature.field)} <= ${bucket}`,
        group: feature.group
      });
    }
  }

  return atoms;
}
