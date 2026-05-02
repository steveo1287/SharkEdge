import assert from "node:assert/strict";

import { summarizeUfcWarehousePayload } from "@/services/ufc/warehouse-ingestion";

const summary = summarizeUfcWarehousePayload({
  fighters: [{ externalKey: "a", fullName: "A" }, { externalKey: "b", fullName: "B" }],
  fights: [{ externalFightId: "m1", eventLabel: "A vs B", fightDate: "2026-06-01T00:00:00.000Z", scheduledRounds: 3, fighterAKey: "a", fighterBKey: "b", preFightSnapshotAt: "2026-05-31T00:00:00.000Z" }],
  modelFeatures: [{ fightKey: "m1", fightDate: "2026-06-01T00:00:00.000Z", fighterKey: "a", opponentFighterKey: "b", snapshotAt: "2026-05-31T00:00:00.000Z", modelVersion: "v1" }],
  predictions: [{ fightKey: "m1", modelVersion: "v1", generatedAt: "2026-05-31T00:01:00.000Z", fighterAKey: "a", fighterBKey: "b", fighterAWinProbability: 0.55, fighterBWinProbability: 0.45 }],
  backtestResults: [{ modelVersion: "v1", backtestName: "wf", foldNumber: 1, trainEndDate: "2025-01-01T00:00:00.000Z", testStartDate: "2025-02-01T00:00:00.000Z", testEndDate: "2025-03-01T00:00:00.000Z" }]
});

assert.equal(summary.fighters, 2);
assert.equal(summary.fights, 1);
assert.equal(summary.modelFeatures, 1);
assert.equal(summary.predictions, 1);
assert.equal(summary.backtestResults, 1);

console.log("ufc-warehouse-ingestion tests passed");
