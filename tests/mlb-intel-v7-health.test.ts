import assert from "node:assert/strict";

import { classifyMlbIntelV7Health } from "@/services/simulation/mlb-intel-v7-health";

const red = classifyMlbIntelV7Health({
  rowCount: 0,
  marketCoverage: 0,
  rosterCoverage: 0,
  lineupLockCoverage: 0,
  snapshotBrier: 0.28,
  snapshotLogLoss: 0.76,
  officialPickCount: 0,
  warningCount: 1
});

assert.equal(red.status, "RED");
assert.equal(red.canPublishAttackPicks, false);
assert.ok(red.blockers.length >= 3);

const yellow = classifyMlbIntelV7Health({
  rowCount: 10,
  marketCoverage: 0.82,
  rosterCoverage: 0.4,
  lineupLockCoverage: 0.1,
  snapshotBrier: 0.252,
  snapshotLogLoss: 0.7,
  officialPickCount: 20,
  warningCount: 0
});

assert.equal(yellow.status, "YELLOW");
assert.equal(yellow.canPublishAttackPicks, true);
assert.ok(yellow.warnings.some((warning) => warning.includes("Roster intelligence coverage")));
assert.ok(yellow.recommendations.length > 0);

const green = classifyMlbIntelV7Health({
  rowCount: 12,
  marketCoverage: 0.92,
  rosterCoverage: 0.86,
  lineupLockCoverage: 0.62,
  snapshotBrier: 0.242,
  snapshotLogLoss: 0.681,
  officialPickCount: 120,
  warningCount: 0
});

assert.equal(green.status, "GREEN");
assert.equal(green.canPublishAttackPicks, true);
assert.equal(green.blockers.length, 0);

console.log("mlb-intel-v7-health.test.ts passed");
