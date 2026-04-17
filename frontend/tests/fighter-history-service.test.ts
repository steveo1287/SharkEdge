import assert from "node:assert/strict";

import { buildCombatProfileFromRows } from "@/services/modeling/fighter-history-service";

const profile = buildCombatProfileFromRows([
  {
    competitorId: "fighter_a",
    opponentCompetitorId: "fighter_b",
    opponentRecord: "18-4-0",
    winnerCompetitorId: "fighter_a",
    loserCompetitorId: "fighter_b",
    method: "Submission",
    period: "2",
    officialAt: new Date("2025-01-01T00:00:00Z")
  },
  {
    competitorId: "fighter_a",
    opponentCompetitorId: "fighter_c",
    opponentRecord: "22-6-0",
    winnerCompetitorId: "fighter_a",
    loserCompetitorId: "fighter_c",
    method: "Decision",
    period: "5",
    officialAt: new Date("2025-06-01T00:00:00Z")
  },
  {
    competitorId: "fighter_a",
    opponentCompetitorId: "fighter_d",
    opponentRecord: "15-3-0",
    winnerCompetitorId: "fighter_d",
    loserCompetitorId: "fighter_a",
    method: "KO/TKO",
    period: "1",
    officialAt: new Date("2025-10-01T00:00:00Z")
  }
]);

assert.equal(profile.sampleSize, 3);
assert.equal(profile.historicalWinPct > 0.6, true);
assert.equal(profile.finishWinRate > 0, true);
assert.equal(profile.durabilityScore > 0, true);
assert.equal(profile.activityScore > 0, true);

console.log("fighter-history-service.test.ts passed");
