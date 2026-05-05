import assert from "node:assert/strict";

import { classifyMainSimBrainStatus } from "@/services/simulation/main-sim-brain-status";

const red = classifyMainSimBrainStatus({
  mlbHealthStatus: "RED",
  canPublishAttackPicks: false,
  rowCount: 0,
  gameCount: 0,
  warningCount: 2,
  profileStatus: "DEFAULT",
  profileSampleSize: 0,
  profileReliability: null
});

assert.equal(red.status, "RED");
assert.ok(red.blockers.length >= 2);
assert.ok(red.warnings.some((warning) => warning.includes("default weights")));

const yellow = classifyMainSimBrainStatus({
  mlbHealthStatus: "YELLOW",
  canPublishAttackPicks: true,
  rowCount: 12,
  gameCount: 12,
  warningCount: 0,
  profileStatus: "LEARNED",
  profileSampleSize: 160,
  profileReliability: 0.42
});

assert.equal(yellow.status, "YELLOW");
assert.ok(yellow.warnings.some((warning) => warning.includes("sample")));
assert.ok(yellow.warnings.some((warning) => warning.includes("reliability")));

const green = classifyMainSimBrainStatus({
  mlbHealthStatus: "GREEN",
  canPublishAttackPicks: true,
  rowCount: 15,
  gameCount: 15,
  warningCount: 0,
  profileStatus: "LEARNED",
  profileSampleSize: 600,
  profileReliability: 0.77
});

assert.equal(green.status, "GREEN");
assert.equal(green.blockers.length, 0);
assert.equal(green.warnings.length, 0);

console.log("main-sim-brain-status.test.ts passed");
