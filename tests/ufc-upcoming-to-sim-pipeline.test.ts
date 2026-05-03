import assert from "node:assert/strict";

import { buildFallbackFeaturePayload, hasCompleteFeaturePair, shouldSimulateUpcomingCandidate } from "@/services/ufc/upcoming-to-sim-pipeline";

assert.equal(hasCompleteFeaturePair({ fighterAFeatureCount: 1, fighterBFeatureCount: 1 }), true);
assert.equal(hasCompleteFeaturePair({ fighterAFeatureCount: 1, fighterBFeatureCount: 0 }), false);
assert.equal(hasCompleteFeaturePair({ fighterAFeatureCount: 0, fighterBFeatureCount: 1 }), false);

assert.equal(shouldSimulateUpcomingCandidate({ hasPrediction: true, fighterAFeatureCount: 1, fighterBFeatureCount: 1 }, false), "skip-existing");
assert.equal(shouldSimulateUpcomingCandidate({ hasPrediction: false, fighterAFeatureCount: 1, fighterBFeatureCount: 1 }, false), "simulate");
assert.equal(shouldSimulateUpcomingCandidate({ hasPrediction: false, fighterAFeatureCount: 1, fighterBFeatureCount: 0 }, false), "skip-missing-features");
assert.equal(shouldSimulateUpcomingCandidate({ hasPrediction: false, fighterAFeatureCount: 0, fighterBFeatureCount: 0 }, true), "simulate");

const fallback = buildFallbackFeaturePayload({
  fightId: "fight-1",
  fightDate: "2026-06-01T02:00:00.000Z",
  fighterId: "fighter-a",
  opponentFighterId: "fighter-b",
  modelVersion: "ufc-fight-iq-v1"
});

assert.equal(fallback.fightId, "fight-1");
assert.equal(fallback.fighterId, "fighter-a");
assert.equal(fallback.opponentFighterId, "fighter-b");
assert.equal(fallback.modelVersion, "ufc-fight-iq-v1");
assert.equal(fallback.coldStartActive, true);
assert.equal(fallback.ufcFights, 0);
assert.equal(fallback.proFights, 0);
assert.equal(fallback.feature.source, "upcoming-card-fallback");
assert.equal(fallback.feature.dataQuality, "D");
assert.equal(new Date(fallback.snapshotAt).getTime() <= new Date(fallback.fightDate).getTime(), true);

console.log("ufc-upcoming-to-sim-pipeline tests passed");
