import assert from "node:assert/strict";

import { resolveWeatherAdjustment } from "@/services/modeling/weather-context";

const windyFootball = resolveWeatherAdjustment({
  sportKey: "NFL",
  venueName: "Arrowhead Stadium",
  weather: {
    source: "windy.com",
    windMph: 24,
    tempF: 27,
    precipitationProbability: 65,
    altitudeFeet: 900
  }
});

assert.equal(windyFootball.available, true);
assert.equal(windyFootball.source, "WINDY");
assert.equal(windyFootball.isIndoor, false);
assert.equal(windyFootball.totalDelta < 0, true);
assert.equal(windyFootball.uncertaintyPenalty > 0, true);

const indoorUfc = resolveWeatherAdjustment({
  sportKey: "UFC",
  venueName: "T-Mobile Arena",
  weather: {
    source: "windy.com",
    windMph: 30,
    tempF: 40
  }
});

assert.equal(indoorUfc.isIndoor, true);
assert.equal(indoorUfc.totalDelta, 0);
assert.equal(indoorUfc.scoreFactor, 1);

console.log("weather-context.test.ts passed");
