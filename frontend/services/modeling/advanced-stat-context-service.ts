import type { AdvancedStatContext, AdvancedStatDriver, SportFeatureValue } from "@/lib/types/sport-features";
import { getSportFeatureDefinitions } from "@/services/modeling/sport-feature-registry";

type BuildAdvancedStatContextInput = {
  sport: string;
  eventId: string;
  seed?: Record<string, number>;
};

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function buildAdvancedStatContext(input: BuildAdvancedStatContextInput): AdvancedStatContext {
  const definitions = getSportFeatureDefinitions(input.sport);
  const features: SportFeatureValue[] = definitions.map((definition, index) => {
    const base = input.seed?.[definition.key] ?? (0.52 + index * 0.03);
    return {
      key: definition.key,
      value: round(clamp(base, 0, 1)),
      source: definition.sourceHint,
      confidence: round(clamp(0.62 + definition.weight * 0.2, 0.55, 0.96), 2),
      detail: `${definition.label} incorporated into ${definition.category} layer.`
    };
  });

  const topDrivers: AdvancedStatDriver[] = definitions
    .map((definition) => {
      const feature = features.find((item) => item.key === definition.key);
      return {
        key: definition.key,
        label: definition.label,
        category: definition.category,
        score: round((feature?.value ?? 0) * definition.weight),
        source: definition.sourceHint,
        detail: definition.description
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 4);

  return {
    sport: input.sport,
    eventId: input.eventId,
    generatedAt: new Date().toISOString(),
    features,
    topDrivers,
    summary: topDrivers.length
      ? `Top advanced drivers: ${topDrivers.map((driver) => driver.label).join(", ")}`
      : "No advanced-stat drivers available."
  };
}
