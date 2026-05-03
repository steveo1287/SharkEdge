import assert from "node:assert/strict";

import { buildHydratedUfcFeature, hasHydratableUfcPayload, hydrationAction, pickUfcPayloadNumber } from "@/services/ufc/upcoming-feature-hydration";

const payload = {
  sourceKey: "ufcstats",
  rawFeature: {
    sigStrikesLandedPerMin: 4.2,
    sigStrikesAbsorbedPerMin: 3.1,
    takedownsPer15: 1.4,
    takedownDefensePct: "62%",
    submissionAttemptsPer15: 0.3,
    strikeAccuracyPct: 48,
    strikeDefensePct: 55
  },
  proFights: 12,
  ufcFights: 4,
  reachInches: 72
};

assert.equal(pickUfcPayloadNumber(payload, "sigStrikesLandedPerMin"), 4.2);
assert.equal(pickUfcPayloadNumber(payload, "takedownDefensePct"), 62);
assert.equal(hasHydratableUfcPayload(payload), true);
assert.equal(hasHydratableUfcPayload({ rawFeature: { sigStrikesLandedPerMin: 4.2 } }), false);
assert.equal(hydrationAction(1, payload), "skip-existing");
assert.equal(hydrationAction(0, payload), "create");
assert.equal(hydrationAction(0, {}), "skip-insufficient-data");

const feature = buildHydratedUfcFeature({
  fightId: "fight-1",
  fightDate: "2026-06-01T02:00:00.000Z",
  fighterId: "fighter-a",
  opponentFighterId: "fighter-b",
  modelVersion: "ufc-fight-iq-v1",
  payload
});

assert.ok(feature);
assert.equal(feature?.fightId, "fight-1");
assert.equal(feature?.fighterId, "fighter-a");
assert.equal(feature?.opponentFighterId, "fighter-b");
assert.equal(feature?.sigStrikesLandedPerMin, 4.2);
assert.equal(feature?.sigStrikesAbsorbedPerMin, 3.1);
assert.equal(feature?.strikingDifferential, 1.1);
assert.equal(feature?.takedownDefensePct, 62);
assert.equal(feature?.opponentAdjustedStrength, 50);
assert.equal(feature?.coldStartActive, false);
assert.equal(feature?.feature.source, "upcoming-feature-hydration");
assert.equal(feature?.feature.hydrationQuality, "profile-derived");
assert.equal(new Date(feature!.snapshotAt).getTime() <= new Date(feature!.fightDate).getTime(), true);

const coldFeature = buildHydratedUfcFeature({ fightId: "fight-2", fightDate: "2026-06-01T02:00:00.000Z", fighterId: "fighter-c", opponentFighterId: "fighter-d", payload: { rawFeature: { slpm: 2.5, sapm: 3.2 }, proFights: 4, ufcFights: 0 } });
assert.equal(coldFeature?.coldStartActive, true);

console.log("ufc-upcoming-feature-hydration tests passed");
