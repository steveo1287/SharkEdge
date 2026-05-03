import assert from "node:assert/strict";

import { summarizeUfcWarehousePayload, validateUfcWarehousePayload } from "@/services/ufc/warehouse-ingestion";

const validPayload = {
  events: [{ externalEventId: "event-1", sourceKey: "fixture", eventName: "UFC Fixture Card", eventDate: "2026-06-01T00:00:00.000Z" }],
  fighters: [{ externalKey: "a", fullName: "A" }, { externalKey: "b", fullName: "B" }],
  fights: [{ externalFightId: "m1", eventKey: "event-1", eventLabel: "A vs B", fightDate: "2026-06-01T00:00:00.000Z", scheduledRounds: 3, fighterAKey: "a", fighterBKey: "b", preFightSnapshotAt: "2026-05-31T00:00:00.000Z" }],
  modelFeatures: [{ fightKey: "m1", fightDate: "2026-06-01T00:00:00.000Z", fighterKey: "a", opponentFighterKey: "b", snapshotAt: "2026-05-31T00:00:00.000Z", modelVersion: "v1" }],
  predictions: [{ fightKey: "m1", modelVersion: "v1", generatedAt: "2026-05-31T00:01:00.000Z", fighterAKey: "a", fighterBKey: "b", fighterAWinProbability: 0.55, fighterBWinProbability: 0.45 }],
  backtestResults: [{ modelVersion: "v1", backtestName: "wf", foldNumber: 1, trainEndDate: "2025-01-01T00:00:00.000Z", testStartDate: "2025-02-01T00:00:00.000Z", testEndDate: "2025-03-01T00:00:00.000Z" }]
};

const summary = summarizeUfcWarehousePayload(validPayload);
assert.equal(summary.events, 1);
assert.equal(summary.fighters, 2);
assert.equal(summary.fights, 1);
assert.equal(summary.modelFeatures, 1);
assert.equal(summary.predictions, 1);
assert.equal(summary.backtestResults, 1);

assert.throws(() => validateUfcWarehousePayload({
  ...validPayload,
  fights: [{ ...validPayload.fights[0], preFightSnapshotAt: "2026-06-02T00:00:00.000Z" }]
}), /future-data leakage/);

assert.throws(() => validateUfcWarehousePayload({
  ...validPayload,
  predictions: [{ ...validPayload.predictions[0], fighterAWinProbability: 0.55, fighterBWinProbability: 0.5 }]
}), /probabilities must sum to 1/);

assert.throws(() => validateUfcWarehousePayload({
  ...validPayload,
  backtestResults: [{ ...validPayload.backtestResults[0], trainEndDate: "2025-03-01T00:00:00.000Z", testStartDate: "2025-02-01T00:00:00.000Z" }]
}), /walk-forward/);

console.log("ufc-warehouse-ingestion tests passed");
