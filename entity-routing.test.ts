import assert from "node:assert/strict";

import { recordToView } from "@/services/trends/discovered-systems";

const view = recordToView({
  id: "sys_1",
  slug: "sys-1",
  name: "System",
  sport: "MLB",
  league: "MLB",
  marketType: "total",
  side: "under",
  tier: "A",
  status: "ACTIVE",
  sampleSize: 44,
  wins: 24,
  losses: 18,
  pushes: 2,
  roi: 8.2,
  totalProfit: 3.4,
  hitRate: 57.1,
  avgClv: 1.2,
  beatCloseRate: 55.4,
  validationScore: 78,
  score: 80,
  recentSampleSize: 12,
  seasonsJson: null,
  teamBreakdownJson: null,
  opponentBreakdownJson: null,
  lineDistributionJson: null,
  warningsJson: null,
  conditionsJson: null,
  snapshots: null,
  activations: [{ id: "a1", reasonsJson: ["Edge"], isActive: true }],
  createdAt: new Date(),
  updatedAt: new Date()
});

assert.ok(Array.isArray(view.seasonsJson));
assert.ok(Array.isArray(view.teamBreakdownJson));
assert.ok(Array.isArray(view.opponentBreakdownJson));
assert.ok(Array.isArray(view.lineDistributionJson));
assert.ok(Array.isArray(view.activations));
assert.deepEqual(view.activations[0]?.reasonsJson, ["Edge"]);
console.log("discovered-trend-route-contract test passed");
