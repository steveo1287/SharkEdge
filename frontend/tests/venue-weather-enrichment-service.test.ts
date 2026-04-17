import assert from "node:assert/strict";

import {
  mergeEventMetadataWithWeather,
  resolveVenueCoordinates
} from "@/services/weather/venue-weather-enrichment-service";

const coords = resolveVenueCoordinates({
  venueName: "Empower Field at Mile High",
  metadataJson: null
});

assert.equal(coords?.source, "venue_map");
assert.equal((coords?.lat ?? 0) > 39, true);

const merged = mergeEventMetadataWithWeather({
  metadataJson: { existing: true },
  venueCoordinates: coords,
  weather: {
    source: "windy.com",
    observedAt: "2026-04-16T00:00:00.000Z",
    tempF: 31,
    windMph: 22,
    windDirection: "NW",
    precipProbability: 60,
    humidity: 55,
    altitudeFeet: 5280,
    roofStatus: null
  }
});

assert.equal((merged as any).existing, true);
assert.equal((merged as any).weather.source, "windy.com");
assert.equal((merged as any).venueLat, coords?.lat ?? null);

console.log("venue-weather-enrichment-service.test.ts passed");
