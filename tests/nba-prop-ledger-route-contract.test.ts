import assert from "node:assert/strict";

import { GET, POST } from "@/app/api/simulation/nba/prop-ledger/route";
import { __nbaPropPredictionLedgerTestHooks } from "@/services/simulation/nba-prop-prediction-ledger";
import { __nbaPropLedgerGraderTestHooks } from "@/services/simulation/nba-prop-ledger-grader";

assert.equal(__nbaPropPredictionLedgerTestHooks.resultFor(26, 25.5, 0.62), "WIN");
assert.equal(__nbaPropPredictionLedgerTestHooks.resultFor(22, 25.5, 0.62), "LOSS");
assert.equal(__nbaPropPredictionLedgerTestHooks.resultFor(22, 25.5, 0.42), "WIN");
assert.equal(__nbaPropPredictionLedgerTestHooks.resultFor(25.5, 25.5, 0.62), "PUSH");
assert.equal(__nbaPropPredictionLedgerTestHooks.firstMarketLine({ "25.5": 0.6 }), 25.5);

const boxScore = {
  points: 28,
  rebounds: 9,
  assists: 7,
  threes: 4,
  steals: 2,
  blocks: 1,
  turnovers: 3
};
assert.equal(__nbaPropLedgerGraderTestHooks.actualValueForNbaProp("points", boxScore), 28);
assert.equal(__nbaPropLedgerGraderTestHooks.actualValueForNbaProp("rebounds", boxScore), 9);
assert.equal(__nbaPropLedgerGraderTestHooks.actualValueForNbaProp("assists", boxScore), 7);
assert.equal(__nbaPropLedgerGraderTestHooks.actualValueForNbaProp("threes", boxScore), 4);
assert.equal(__nbaPropLedgerGraderTestHooks.actualValueForNbaProp("pra", boxScore), 44);
assert.equal(__nbaPropLedgerGraderTestHooks.resultForProp(28, 25.5, 0.62), "WIN");
assert.equal(__nbaPropLedgerGraderTestHooks.resultForProp(22, 25.5, 0.62), "LOSS");

const getResponse = await GET();
assert.equal(getResponse.status, 200);
const getBody = await getResponse.json();
assert.equal(getBody.ok, true);
assert.equal(typeof getBody.generatedAt, "string");
assert.equal(typeof getBody.openCount, "number");
assert.ok(getBody.actions.includes("capture"));
assert.ok(getBody.actions.includes("grade"));
assert.ok(getBody.actions.includes("gradeOpen"));

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

const gradeOpenResponse = await POST(new Request("http://localhost/api/simulation/nba/prop-ledger", {
  method: "POST",
  body: JSON.stringify({ action: "gradeOpen", limit: 1 })
}));
assert.equal(gradeOpenResponse.status, 200);
const gradeOpenBody = await gradeOpenResponse.json();
assert.equal(gradeOpenBody.ok, true);
assert.equal(gradeOpenBody.action, "gradeOpen");
assert.equal(typeof gradeOpenBody.scanned, "number");
assert.equal(typeof gradeOpenBody.graded, "number");
assert.equal(typeof gradeOpenBody.skipped, "number");
assert.ok(Array.isArray(gradeOpenBody.failures));

console.log("nba-prop-ledger-route-contract.test.ts passed");
