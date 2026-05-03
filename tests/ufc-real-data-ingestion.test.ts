import assert from "node:assert/strict";

import { normalizeUfcRealDataSnapshot } from "@/services/ufc/real-data-ingestion";

const snapshot = normalizeUfcRealDataSnapshot({
  sourceKey: "fixture-source",
  modelVersion: "ufc-fight-iq-v1",
  snapshotAt: "2026-05-31T18:00:00.000Z",
  event: {
    sourceEventId: "event-1",
    eventName: "UFC Fixture Card",
    eventDate: "2026-06-01T02:00:00.000Z",
    location: "Chicago, Illinois"
  },
  fights: [
    {
      sourceFightId: "fight-1",
      eventLabel: "A vs B",
      fightDate: "2026-06-01T02:00:00.000Z",
      scheduledRounds: 3,
      fighterA: {
        sourceId: "fighter-a",
        name: "Fighter A",
        proFights: 12,
        ufcFights: 3,
        roundsFought: 15,
        sigStrikesLandedPerMin: 4.1,
        sigStrikesAbsorbedPerMin: 3.2,
        takedownsPer15: 1.8,
        takedownDefensePct: 66,
        opponentAdjustedStrength: 58
      },
      fighterB: {
        sourceId: "fighter-b",
        name: "Fighter B",
        proFights: 9,
        ufcFights: 1,
        roundsFought: 6,
        sigStrikesLandedPerMin: 3.3,
        sigStrikesAbsorbedPerMin: 4.2,
        takedownsPer15: 0.8,
        takedownDefensePct: 52,
        opponentAdjustedStrength: 51,
        coldStartActive: true
      }
    }
  ]
});

assert.equal(snapshot.events.length, 1);
assert.equal(snapshot.events[0].externalEventId, "event-1");
assert.equal(snapshot.events[0].eventName, "UFC Fixture Card");
assert.equal(snapshot.fighters.length, 2);
assert.equal(snapshot.fights.length, 1);
assert.equal(snapshot.fights[0].eventKey, "event-1");
assert.equal(snapshot.modelFeatures.length, 2);
assert.equal(snapshot.modelFeatures[0].fighterKey, "fighter-a");
assert.equal(snapshot.modelFeatures[1].opponentFighterKey, "fighter-a");
assert.equal(snapshot.modelFeatures[1].coldStartActive, true);

assert.throws(() => normalizeUfcRealDataSnapshot({
  sourceKey: "bad",
  snapshotAt: "2026-06-02T00:00:00.000Z",
  fights: [{
    sourceFightId: "bad-1",
    eventLabel: "Bad",
    fightDate: "2026-06-01T00:00:00.000Z",
    fighterA: { sourceId: "a", name: "A" },
    fighterB: { sourceId: "b", name: "B" }
  }]
}), /future-data leakage/);

console.log("ufc-real-data-ingestion tests passed");
