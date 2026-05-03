import assert from "node:assert/strict";

import { GET, POST } from "@/app/api/simulation/nba/prop-ledger/route";
import { __nbaPropPredictionLedgerTestHooks } from "@/services/simulation/nba-prop-prediction-ledger";

assert.equal(__nbaPropPredictionLedgerTestHooks.resultFor(26, 25.5, 0.62), "WIN");
assert.equal(__nbaPropPredictionLedgerTestHooks.resultFor(22, 25.5, 0.62), "LOSS");
assert.equal(__nbaPropPredictionLedgerTestHooks.resultFor(22, 25.5, 0.42), "WIN");
assert.equal(__nbaPropPredictionLedgerTestHooks.resultFor(25.5, 25.5, 0.62), "PUSH");

const getResponse = await GET();
assert.equal(getResponse.status, 200);
const getBody = await getResponse.json();
assert.equal(getBody.ok, true);
assert.equal(typeof getBody.generatedAt, "string");
assert.equal(typeof getBody.openCount, "number");
assert.ok(getBody.actions.includes("capture"));
assert.ok(getBody.actions.includes("grade"));

const invalidResponse = await POST(new Request("http://localhost/api/simulation/nba/prop-ledger", {
  method: "POST",
  body: JSON.stringify({ action: "invalid" })
}));
assert.equal(invalidResponse.status, 400);
const invalidBody = await invalidResponse.json();
assert.equal(invalidBody.ok, false);
assert.ok(invalidBody.error.includes("Unsupported"));

const missingSnapshotResponse = await POST(new Request("http://localhost/api/simulation/nba/prop-ledger", {
  method: "POST",
  body: JSON.stringify({ action: "capture" })
}));
assert.equal(missingSnapshotResponse.status, 400);
const missingSnapshotBody = await missingSnapshotResponse.json();
assert.equal(missingSnapshotBody.ok, false);
assert.ok(missingSnapshotBody.error.includes("snapshot"));

const missingGradeResponse = await POST(new Request("http://localhost/api/simulation/nba/prop-ledger", {
  method: "POST",
  body: JSON.stringify({ action: "grade" })
}));
assert.equal(missingGradeResponse.status, 400);
const missingGradeBody = await missingGradeResponse.json();
assert.equal(missingGradeBody.ok, false);
assert.ok(missingGradeBody.error.includes("grade"));

console.log("nba-prop-ledger-route-contract.test.ts passed");
