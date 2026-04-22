import assert from "node:assert/strict";

import { applyMultipleTestingControl } from "@/services/trends/validation/multiple-testing";
import type { CandidateTrendSystem, TrendCondition, TrendDiscoveryConfig } from "@/services/trends/types";

const config: TrendDiscoveryConfig = {
  minSample: 24,
  minRecentSample: 4,
  minSeasons: 1,
  maxSeedAtoms: 50,
  beamWidth: 20,
  maxConditions: 3,
  maxSystemOverlap: 0.8,
  requirePositiveClv: false,
  maxFalseDiscoveryRate: 0.25,
  multipleTestingPenaltyWeight: 1.75
};

function makeConditions(count: number): TrendCondition[] {
  return Array.from({ length: count }, (_, index) => ({
    field: `field_${index}`,
    operator: "eq",
    value: `value_${index}`,
    label: `Condition ${index + 1}`,
    group: `group_${index}`
  }));
}

function makeSystem(input: {
  id: string;
  wins: number;
  losses: number;
  sampleSize: number;
  validationScore: number;
  conditions?: number;
}): CandidateTrendSystem {
  return {
    id: input.id,
    sport: "BASKETBALL",
    league: "NBA",
    marketType: "spread",
    side: "home",
    conditions: makeConditions(input.conditions ?? 1),
    name: input.id,
    shortLabel: input.id,
    sampleSize: input.sampleSize,
    wins: input.wins,
    losses: input.losses,
    pushes: 0,
    hitRate: input.sampleSize ? input.wins / input.sampleSize : null,
    roi: 0.05,
    totalProfit: 8,
    avgClv: 4,
    beatCloseRate: 0.56,
    seasons: [2025],
    recentSampleSize: Math.min(20, input.sampleSize),
    score: input.validationScore,
    validationScore: input.validationScore,
    tier: "B",
    warnings: []
  };
}

const stableEdge = makeSystem({
  id: "stable-edge",
  wins: 66,
  losses: 44,
  sampleSize: 110,
  validationScore: 42,
  conditions: 2
});
const lowBurden = applyMultipleTestingControl([stableEdge], 12, config)[0];
const highBurden = applyMultipleTestingControl([stableEdge], 180, config)[0];
assert.ok(
  (highBurden.discoveryAdjustedScore ?? highBurden.validationScore) <
    (lowBurden.discoveryAdjustedScore ?? lowBurden.validationScore),
  "larger search burden should reduce the adjusted score"
);

const stronger = makeSystem({
  id: "stronger",
  wins: 104,
  losses: 76,
  sampleSize: 180,
  validationScore: 40,
  conditions: 2
});
const weaker = makeSystem({
  id: "weaker",
  wins: 21,
  losses: 15,
  sampleSize: 36,
  validationScore: 42,
  conditions: 2
});
const ranked = applyMultipleTestingControl([weaker, stronger], 90, config).sort(
  (left, right) => (right.discoveryAdjustedScore ?? right.validationScore) - (left.discoveryAdjustedScore ?? left.validationScore)
);
assert.equal(ranked[0].id, "stronger", "more durable edges should survive multiple-testing control better");
assert.ok(
  (weaker.falseDiscoveryRate ?? 1) >= (stronger.falseDiscoveryRate ?? 0),
  "weaker signal should carry at least as much search-burden risk"
);

console.log("trend multiple-testing control test passed");
