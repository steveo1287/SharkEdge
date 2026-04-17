import assert from "node:assert/strict";

import { buildUfcCommonOpponentView, buildUfcOpponentGraphSnapshot } from "@/services/modeling/ufc-opponent-graph";

const fighterARows = [
  {
    competitorId: "fighter_a",
    opponentCompetitorId: "opp_1",
    opponentRecord: "19-4-0",
    winnerCompetitorId: "fighter_a",
    loserCompetitorId: "opp_1",
    method: "Submission",
    period: "2",
    officialAt: new Date("2024-05-01T00:00:00Z")
  },
  {
    competitorId: "fighter_a",
    opponentCompetitorId: "opp_2",
    opponentRecord: "22-5-0",
    winnerCompetitorId: "fighter_a",
    loserCompetitorId: "opp_2",
    method: "Decision",
    period: "5",
    officialAt: new Date("2024-10-01T00:00:00Z")
  }
];

const fighterBRows = [
  {
    competitorId: "fighter_b",
    opponentCompetitorId: "opp_1",
    opponentRecord: "19-4-0",
    winnerCompetitorId: "opp_1",
    loserCompetitorId: "fighter_b",
    method: "Decision",
    period: "3",
    officialAt: new Date("2024-06-01T00:00:00Z")
  },
  {
    competitorId: "fighter_b",
    opponentCompetitorId: "opp_3",
    opponentRecord: "16-6-0",
    winnerCompetitorId: "fighter_b",
    loserCompetitorId: "opp_3",
    method: "KO/TKO",
    period: "1",
    officialAt: new Date("2024-11-01T00:00:00Z")
  }
];

const snapshot = buildUfcOpponentGraphSnapshot(fighterARows);
const common = buildUfcCommonOpponentView(fighterARows, fighterBRows);

assert.equal(snapshot.graphQualityScore > 6, true);
assert.equal(snapshot.qualityWinCount >= 2, true);
assert.equal(common.commonOpponentCount, 1);
assert.equal(common.fighterAEdgeScore > common.fighterBEdgeScore, true);

console.log("ufc-opponent-graph.test.ts passed");
