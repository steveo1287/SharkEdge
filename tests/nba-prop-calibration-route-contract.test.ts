import assert from "node:assert/strict";

import { GET } from "@/app/api/simulation/nba/prop-calibration/route";

const response = await GET(new Request("http://localhost/api/simulation/nba/prop-calibration?statKey=points&confidence=0.72"));
assert.equal(response.status, 200);

const body = await response.json();
assert.equal(body.ok, true);
assert.ok(["GREEN", "YELLOW", "RED"].includes(body.status));
assert.equal(typeof body.generatedAt, "string");
assert.equal(typeof body.hasDatabase, "boolean");
assert.equal(typeof body.rowCount, "number");
assert.equal(typeof body.bucketCount, "number");
assert.equal(typeof body.healthyBucketCount, "number");
assert.equal(typeof body.watchBucketCount, "number");
assert.equal(typeof body.poorBucketCount, "number");
assert.equal(typeof body.insufficientBucketCount, "number");
assert.ok(Array.isArray(body.buckets));
assert.ok(Array.isArray(body.blockers));
assert.ok(Array.isArray(body.warnings));
assert.equal(body.query.statKey, "points");
assert.equal(body.query.confidence, 0.72);
assert.equal(body.query.lookupRequested, true);
assert.ok(body.actionRule.includes("HEALTHY"));
assert.ok(body.examples.points.includes("/api/simulation/nba/prop-calibration"));

if (!body.hasDatabase || body.rowCount === 0) {
  assert.equal(body.status, "RED");
  assert.ok(body.blockers.length > 0);
}

console.log("nba-prop-calibration-route-contract.test.ts passed");
