import assert from "node:assert/strict";

import {
  calculateMlbHitterOverall,
  calculateMlbPitcherOverall,
  classifyMlbHitterRole,
  classifyMlbStarterRole
} from "@/services/simulation/mlb-roster-intelligence";

const eliteBat = calculateMlbHitterOverall({
  contact: 88,
  power: 92,
  discipline: 84,
  vsLhp: 83,
  vsRhp: 90,
  baserunning: 70,
  fielding: 72,
  currentForm: 88
});

assert.ok(eliteBat >= 84);
assert.equal(classifyMlbHitterRole(eliteBat), "STAR");
assert.equal(classifyMlbHitterRole(75), "STARTER");
assert.equal(classifyMlbHitterRole(64), "ROLE_PLAYER");
assert.equal(classifyMlbHitterRole(58), "BENCH");
assert.equal(classifyMlbHitterRole(49), "REPLACEMENT");

const eliteStarter = calculateMlbPitcherOverall({
  xeraQuality: 92,
  fipQuality: 90,
  kBb: 88,
  hrRisk: 20,
  groundballRate: 72,
  platoonSplit: 78,
  stamina: 86,
  recentWorkload: 18,
  arsenalQuality: 92
});

assert.ok(eliteStarter >= 86);
assert.equal(classifyMlbStarterRole(eliteStarter), "ACE");
assert.equal(classifyMlbStarterRole(78), "TOP_ROTATION");
assert.equal(classifyMlbStarterRole(70), "MID_ROTATION");
assert.equal(classifyMlbStarterRole(57), "BACK_END");

console.log("mlb-roster-intelligence.test.ts passed");
