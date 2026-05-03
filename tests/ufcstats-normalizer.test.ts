import assert from "node:assert/strict";

import { normalizeUfcStatsSnapshot } from "@/services/ufc/ufcstats-normalizer";

const snapshot = normalizeUfcStatsSnapshot({
  snapshotAt: "2026-05-31T18:00:00.000Z",
  modelVersion: "ufc-fight-iq-v1",
  event: {
    sourceEventId: "ufcstats-event123",
    eventName: "UFC Test Night",
    eventDate: "2026-06-01T02:00:00.000Z",
    location: "Chicago, Illinois",
    fights: [{ sourceFightId: "ufcstats-fight123", url: "http://example/fight", fighterAName: "Fighter A", fighterBName: "Fighter B" }]
  },
  fights: [{ sourceFightId: "ufcstats-fight123", url: "http://example/fight", fighterAName: "Fighter A", fighterBName: "Fighter B", scheduledRounds: 3 }],
  fighters: [
    { sourceId: "ufcstats-abc123", name: "Fighter A", heightInches: 71, reachInches: 72, stance: "Orthodox", slpm: 4.21, sapm: 3.02, strikeAccuracyPct: 49, strikeDefensePct: 58, takedownsPer15: 1.75, takedownAccuracyPct: 42, takedownDefensePct: 66, submissionAttemptsPer15: 0.6 },
    { sourceId: "ufcstats-def456", name: "Fighter B", heightInches: 70, reachInches: 70, stance: "Southpaw", slpm: 3.4, sapm: 4.1, strikeAccuracyPct: 41, strikeDefensePct: 51, takedownsPer15: 0.8, takedownAccuracyPct: 30, takedownDefensePct: 55, submissionAttemptsPer15: 0.2 }
  ]
});

assert.equal(snapshot.sourceKey, "ufcstats");
assert.equal(snapshot.event?.sourceEventId, "ufcstats-event123");
assert.equal(snapshot.event?.eventName, "UFC Test Night");
assert.equal(snapshot.event?.location, "Chicago, Illinois");
assert.equal(snapshot.fights.length, 1);
assert.equal(snapshot.fights[0].sourceFightId, "ufcstats-fight123");
assert.equal(snapshot.fights[0].eventId, "ufcstats-event123");
assert.equal(snapshot.fights[0].fighterA.sourceId, "ufcstats-abc123");
assert.equal(snapshot.fights[0].fighterA.sigStrikesLandedPerMin, 4.21);
assert.equal(snapshot.fights[0].fighterA.sigStrikesAbsorbedPerMin, 3.02);
assert.equal(snapshot.fights[0].fighterA.takedownsPer15, 1.75);
assert.equal(snapshot.fights[0].fighterA.takedownDefensePct, 66);
assert.equal(snapshot.fights[0].fighterA.feature?.sigStrikeAccuracyPct, 49);
assert.equal(snapshot.fights[0].fighterA.feature?.sigStrikeDefensePct, 58);
assert.equal(snapshot.fights[0].fighterA.feature?.takedownAccuracyPct, 42);
assert.equal(snapshot.fights[0].fighterB.sourceId, "ufcstats-def456");
assert.equal(snapshot.fights[0].scheduledRounds, 3);

console.log("ufcstats-normalizer tests passed");
