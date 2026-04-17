import assert from "node:assert/strict";

import { buildGenericEventProjection, buildWeightedAverage } from "@/services/modeling/team-projection-core";

const weighted = buildWeightedAverage([120, 118, 110, 108]);
assert.equal((weighted ?? 0) > 112, true);

const projection = buildGenericEventProjection({
  sportKey: "NBA",
  homeOffense: [118, 120, 114, 116, 112],
  awayOffense: [109, 111, 107, 105, 108],
  homeDefense: [108, 110, 106, 111, 109],
  awayDefense: [115, 117, 113, 116, 114],
  paceSamples: [99, 101, 98, 100, 102, 97],
  weather: {
    available: true,
    isIndoor: false,
    source: "WINDY",
    scoreFactor: 0.97,
    totalDelta: -2.1,
    spreadDeltaHome: 0.4,
    volatilityDelta: 2.6,
    uncertaintyPenalty: 4,
    note: "Wind suppresses passing efficiency.",
    diagnostics: {
      tempF: 32,
      windMph: 22,
      precipitationProbability: 40,
      humidity: null,
      altitudeFeet: null,
      roofStatus: null
    }
  }
});

assert.equal(projection.projectedHomeScore > projection.projectedAwayScore, true);
assert.equal(projection.winProbHome > 0.5, true);
assert.equal(projection.metadata.confidenceScore > 0, true);
assert.equal(projection.metadata.projectionBand.totalHigh > projection.metadata.projectionBand.totalLow, true);
assert.equal(projection.metadata.weather.available, true);
assert.equal(projection.metadata.weather.source, "WINDY");

console.log("team-projection-core.test.ts passed");
