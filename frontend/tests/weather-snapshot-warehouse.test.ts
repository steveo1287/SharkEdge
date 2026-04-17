import assert from "node:assert/strict";

import { buildWeatherFeatureView, buildWeatherSnapshotFromEventMetadata } from "@/services/modeling/weather-snapshot-warehouse";

const snapshot = buildWeatherSnapshotFromEventMetadata({
  weather: {
    source: "windy.com",
    windMph: 21,
    tempF: 31,
    precipProbability: 62,
    altitudeFeet: 5280
  }
});

assert.equal(snapshot?.source, "windy.com");
assert.equal(snapshot?.windMph, 21);

const feature = buildWeatherFeatureView({
  sportKey: "NFL",
  venueName: "Empower Field at Mile High",
  metadataJson: {
    weather: {
      source: "windy.com",
      windMph: 21,
      tempF: 31,
      precipProbability: 62,
      altitudeFeet: 5280
    }
  }
});

assert.equal(feature.weatherBucket === "wet" || feature.weatherBucket === "windy" || feature.weatherBucket === "cold", true);
assert.equal(feature.altitudeBucket, "high_altitude");
assert.equal(feature.adjustment.source, "WINDY");

console.log("weather-snapshot-warehouse.test.ts passed");
