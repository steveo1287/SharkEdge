import assert from "node:assert/strict";

import { buildEventModelInputBundle } from "@/services/intelligence/model-input-bundle-service";

const event = {
  id: "event_1",
  startTime: new Date("2026-04-20T00:00:00Z"),
  venue: "Arrowhead Stadium",
  metadataJson: {
    weatherSource: "windy.com",
    weather: {
      source: "windy.com",
      observedAt: "2026-04-19T18:00:00Z"
    }
  },
  league: { key: "NFL", sport: "FOOTBALL" },
  participants: [
    { competitorId: "home", role: "HOME" },
    { competitorId: "away", role: "AWAY" }
  ],
  participantContexts: [
    {
      competitorId: "home",
      recentWinRate: 66,
      recentMargin: 4.2,
      metadataJson: { combatProfile: { ready: true } }
    },
    {
      competitorId: "away",
      recentWinRate: 48,
      recentMargin: -1.1,
      metadataJson: null
    }
  ]
};

const bundleA = buildEventModelInputBundle(event as any);
const bundleB = buildEventModelInputBundle(event as any);

assert.equal(bundleA.weather.available, true);
assert.equal(bundleA.participants[0]?.combatProfileReady, true);
assert.equal(bundleA.bundleHash, bundleB.bundleHash);

console.log("model-input-bundle-service.test.ts passed");
