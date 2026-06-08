import assert from "node:assert/strict";

import { buildUfcCardRosterIntelligence } from "@/services/ufc/fighter-roster-intelligence";
import type { UfcCardDetail } from "@/services/ufc/card-feed";
import type { UfcOperationalFeedCard } from "@/services/ufc/operational-feed";

function fight(overrides: Partial<UfcOperationalFeedCard> = {}): UfcOperationalFeedCard {
  return {
    fightId: "fight-1",
    eventId: "ufc-test",
    eventName: "UFC Test",
    eventDate: "2026-06-20T00:00:00.000Z",
    eventSourceKey: "ufc",
    promotionKey: "ufc",
    promotionName: "UFC",
    combatSport: "MMA",
    matchupQuality: "VALID",
    matchupQualityScore: 90,
    matchupQualityReasons: [],
    eventLabel: "UFC Test",
    fightDate: "2026-06-20T00:00:00.000Z",
    scheduledRounds: 3,
    fighterAId: "a",
    fighterBId: "b",
    fighterAName: "Alpha Finisher",
    fighterBName: "Beta Grinder",
    hasPrediction: true,
    sourceStatus: "ready",
    cardSection: "Main Card",
    boutOrder: 1,
    pickFighterId: "a",
    pickName: "Alpha Finisher",
    fighterAWinProbability: 0.66,
    fighterBWinProbability: 0.34,
    fairOddsAmerican: -194,
    sportsbookOddsAmerican: -155,
    edgePct: 6.5,
    methodProbabilities: { KO_TKO: 0.44, SUBMISSION: 0.18, DECISION: 0.38 },
    rawMethodProbabilities: { KO_TKO: 0.42, SUBMISSION: 0.17, DECISION: 0.41 },
    methodCalibration: { sampleSize: 60, quality: "B", corrections: null },
    predictionJson: { activeUfcFighter: true },
    simInputAudit: {
      score: 86,
      grade: "A",
      fighterA: { score: 88, grade: "A", missingCritical: [], missingUseful: [], coldStartActive: false },
      fighterB: { score: 58, grade: "C", missingCritical: ["recent_form"], missingUseful: ["stance"], coldStartActive: true },
      market: { hasTwoSidedMarket: true, score: 82, missing: [] },
      engineReadiness: { roundByRoundReady: true, exchangeReady: true, skillReady: true, score: 88, blockers: [] },
      blockers: [],
      warnings: []
    },
    marketAware: { hasRealMarket: true, noMarketEdge: false, modelWeight: 0.7, marketWeight: 0.3, edgePct: 6.5, confidenceBand: { low: 0.58, high: 0.72, width: 0.14, crossesMarket: false }, reasonCodes: ["model_over_market"] },
    promotionGate: { status: "PROMOTABLE", grade: "A", reasons: [], confidenceCap: "HIGH" },
    isPromotable: true,
    isWatchlist: false,
    isShadowOnly: false,
    dataQualityGrade: "A",
    confidenceGrade: "HIGH",
    simulationCount: 12000,
    generatedAt: "2026-06-08T12:00:00.000Z",
    pathSummary: ["Alpha controls power lanes", "Beta needs grappling control"],
    dangerFlags: [],
    shadowStatus: null,
    ...overrides
  };
}

const card: UfcCardDetail = {
  eventId: "ufc-test",
  eventLabel: "UFC Test",
  eventDate: "2026-06-20T00:00:00.000Z",
  promotionKey: "ufc",
  promotionName: "UFC",
  combatSport: "MMA",
  fightCount: 2,
  simulatedFightCount: 2,
  dataQualityGrade: "A",
  lastSimulatedAt: "2026-06-08T12:00:00.000Z",
  shadowPendingCount: 0,
  shadowResolvedCount: 0,
  providerStatus: "ufc-linked",
  fights: [
    fight(),
    fight({
      fightId: "fight-2",
      fighterAId: "c",
      fighterBId: "d",
      fighterAName: "Gamma Prospect",
      fighterBName: "Delta Veteran",
      pickFighterId: "d",
      fighterAWinProbability: 0.42,
      fighterBWinProbability: 0.58,
      edgePct: null,
      methodProbabilities: { KO_TKO: 0.19, SUBMISSION: 0.14, DECISION: 0.67 },
      simInputAudit: {
        score: 58,
        grade: "C",
        fighterA: { score: 44, grade: "D", missingCritical: ["ufc_sample"], missingUseful: ["recent_form"], coldStartActive: true },
        fighterB: { score: 76, grade: "B", missingCritical: [], missingUseful: [], coldStartActive: false },
        market: { hasTwoSidedMarket: false, score: 45, missing: ["two_sided_market"] },
        engineReadiness: { roundByRoundReady: true, exchangeReady: false, skillReady: true, score: 61, blockers: ["exchange_not_ready"] },
        blockers: ["thin_market"],
        warnings: ["partial_sim_input"]
      },
      isShadowOnly: true,
      dangerFlags: ["cold_start", "missing_market"],
      dataQualityGrade: "C",
      confidenceGrade: "MEDIUM",
      predictionJson: { activeUfcFighter: true }
    })
  ]
};

const board = buildUfcCardRosterIntelligence(card, "2026-06-08T12:00:00.000Z");
assert.equal(board.modelVersion, "ufc-fighter-roster-intelligence-v1");
assert.equal(board.fighterCount, 4);
assert.ok(board.activeCount >= 4);
assert.ok(board.topFighters.length > 0);
assert.ok(board.pickSideFighters.length >= 2);
assert.ok(board.finishThreats.some((row) => row.fighterName === "Alpha Finisher"));
assert.ok(board.decisionFloor.some((row) => row.fightId === "fight-2"));
assert.ok(board.marketEdges.some((row) => row.fighterName === "Alpha Finisher"));
assert.ok(board.riskFlags.some((row) => row.fighterName === "Gamma Prospect"));
assert.ok(board.summary.includes("Roster intelligence"));
for (const row of board.rows) {
  assert.ok(row.rosterScore >= 0 && row.rosterScore <= 100);
  assert.ok(row.confidence >= 0 && row.confidence <= 1);
  assert.ok(["A_PLUS", "A", "B", "WATCH", "RESEARCH", "RISK"].includes(row.grade));
  assert.ok(row.tags.length > 0);
}

console.log("ufc-fighter-roster-intelligence.test.ts passed");
