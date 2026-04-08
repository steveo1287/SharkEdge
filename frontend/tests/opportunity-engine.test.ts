import { buildOpportunityScore } from "@/services/opportunities/opportunity-scoring";
import { buildOpportunityTiming } from "@/services/opportunities/opportunity-timing";
import { buildOpportunityTrapFlags } from "@/services/opportunities/opportunity-traps";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function getBucket(score: number) {
  if (score >= 85) {
    return "elite";
  }

  if (score >= 70) {
    return "strong";
  }

  if (score >= 55) {
    return "watch";
  }

  return "pass";
}

function testScoreBuckets() {
  const elite = buildOpportunityScore({
    expectedValuePct: 8,
    fairLineGap: 24,
    edgeScore: 88,
    confidenceScore: 82,
    qualityScore: 82,
    disagreementScore: 0.04,
    freshnessMinutes: 2,
    bookCount: 6,
    timingQuality: 88,
    supportScore: 11,
    sourceQualityScore: 88,
    marketEfficiencyScore: 6,
    edgeDecayPenalty: 2,
    trapFlags: [],
    personalizationDelta: 2
  });
  assert(elite.score >= 85, `expected elite score, got ${elite.score}`);

  const strong = buildOpportunityScore({
    expectedValuePct: 2.2,
    fairLineGap: 8,
    edgeScore: 60,
    confidenceScore: 50,
    qualityScore: 50,
    disagreementScore: 0.08,
    freshnessMinutes: 9,
    bookCount: 3,
    timingQuality: 60,
    supportScore: 5,
    sourceQualityScore: 44,
    marketEfficiencyScore: 0,
    edgeDecayPenalty: 10,
    trapFlags: [],
    personalizationDelta: 0
  });
  assert(strong.score >= 70 && strong.score < 85, `expected strong score band, got ${strong.score}`);

  const watch = buildOpportunityScore({
    expectedValuePct: 1.4,
    fairLineGap: 6,
    edgeScore: 58,
    confidenceScore: 50,
    qualityScore: 42,
    disagreementScore: 0.12,
    freshnessMinutes: 14,
    bookCount: 3,
    timingQuality: 58,
    supportScore: 4,
    sourceQualityScore: 44,
    marketEfficiencyScore: -2,
    edgeDecayPenalty: 12,
    trapFlags: [],
    personalizationDelta: 0
  });
  assert(watch.score >= 55 && watch.score < 70, `expected watch score band, got ${watch.score}`);

  const pass = buildOpportunityScore({
    expectedValuePct: 0.3,
    fairLineGap: 2,
    edgeScore: 48,
    confidenceScore: 42,
    qualityScore: 22,
    disagreementScore: 0.14,
    freshnessMinutes: 18,
    bookCount: 1,
    timingQuality: 28,
    supportScore: 1,
    sourceQualityScore: 22,
    marketEfficiencyScore: -4,
    edgeDecayPenalty: 24,
    trapFlags: ["THIN_MARKET"],
    personalizationDelta: 0
  });
  assert(pass.score < 55, `expected pass score band, got ${pass.score}`);
}

function testPenaltyBehavior() {
  const cleanArgs = {
    expectedValuePct: 4.5,
    fairLineGap: 14,
    edgeScore: 74,
    confidenceScore: 70,
    qualityScore: 70,
    disagreementScore: 0.05,
    freshnessMinutes: 4,
    bookCount: 5,
    timingQuality: 75,
    supportScore: 8,
    sourceQualityScore: 72,
    marketEfficiencyScore: 4,
    edgeDecayPenalty: 4,
    personalizationDelta: 0
  };
  const clean = buildOpportunityScore({
    ...cleanArgs,
    trapFlags: []
  });
  const trapped = buildOpportunityScore({
    ...cleanArgs,
    bookCount: 1,
    trapFlags: ["STALE_EDGE", "ONE_BOOK_OUTLIER", "LOW_PROVIDER_HEALTH"]
  });
  const eliteLooking = buildOpportunityScore({
    expectedValuePct: 8.2,
    fairLineGap: 22,
    edgeScore: 90,
    confidenceScore: 84,
    qualityScore: 82,
    disagreementScore: 0.04,
    freshnessMinutes: 3,
    bookCount: 6,
    timingQuality: 86,
    supportScore: 10,
    sourceQualityScore: 84,
    marketEfficiencyScore: 6,
    edgeDecayPenalty: 2,
    trapFlags: [],
    personalizationDelta: 0
  });
  const trapHeavy = buildOpportunityScore({
    expectedValuePct: 8.2,
    fairLineGap: 22,
    edgeScore: 90,
    confidenceScore: 84,
    qualityScore: 82,
    disagreementScore: 0.2,
    freshnessMinutes: 22,
    bookCount: 1,
    timingQuality: 86,
    supportScore: 10,
    sourceQualityScore: 36,
    marketEfficiencyScore: -4,
    edgeDecayPenalty: 28,
    trapFlags: [
      "STALE_EDGE",
      "ONE_BOOK_OUTLIER",
      "THIN_MARKET",
      "LOW_PROVIDER_HEALTH",
      "HIGH_MARKET_DISAGREEMENT",
      "FAKE_MOVE_RISK"
    ],
    personalizationDelta: 0
  });

  assert(trapped.score < clean.score, "expected trap penalties to reduce score");
  assert(trapped.components.penalties > clean.components.penalties, "expected penalties component to increase");
  assert(
    getBucket(clean.score) === "strong" || getBucket(clean.score) === "elite",
    `expected clean bucket strong or elite, got ${getBucket(clean.score)}`
  );
  assert(getBucket(trapped.score) === "watch" || getBucket(trapped.score) === "pass", `expected trapped score to drop out of strong, got ${getBucket(trapped.score)}`);
  assert(getBucket(eliteLooking.score) === "elite", `expected elite-looking case to start elite, got ${getBucket(eliteLooking.score)}`);
  assert(getBucket(trapHeavy.score) !== "elite", `expected trap-heavy case to lose elite status, got ${trapHeavy.score}`);
  assert(trapHeavy.score <= 69, `expected trap-heavy case to fall to watch or worse, got ${trapHeavy.score}`);
}

function testTimingTransitions() {
  const betNow = buildOpportunityTiming({
    score: 89,
    expectedValuePct: 5.2,
    lineMovement: 3,
    bestPriceFlag: true,
    freshnessMinutes: 3,
    trapFlags: [],
    disagreementScore: 0.05
  });
  assert(betNow.actionState === "BET_NOW", `expected BET_NOW, got ${betNow.actionState}`);
  assert(betNow.timingState === "WINDOW_OPEN", `expected WINDOW_OPEN, got ${betNow.timingState}`);

  const wait = buildOpportunityTiming({
    score: 74,
    expectedValuePct: 3.1,
    lineMovement: 10,
    bestPriceFlag: false,
    freshnessMinutes: 5,
    trapFlags: [],
    disagreementScore: 0.05
  });
  assert(wait.actionState === "WAIT", `expected WAIT, got ${wait.actionState}`);
  assert(wait.timingState === "WAIT_FOR_PULLBACK", `expected WAIT_FOR_PULLBACK, got ${wait.timingState}`);

  const waitForConfirmation = buildOpportunityTiming({
    score: 76,
    expectedValuePct: 3.1,
    lineMovement: 10,
    bestPriceFlag: true,
    freshnessMinutes: 4,
    trapFlags: [],
    disagreementScore: 0.04
  });
  assert(waitForConfirmation.actionState === "WAIT", `expected WAIT, got ${waitForConfirmation.actionState}`);
  assert(
    waitForConfirmation.timingState === "WAIT_FOR_CONFIRMATION",
    `expected WAIT_FOR_CONFIRMATION, got ${waitForConfirmation.timingState}`
  );

  const watch = buildOpportunityTiming({
    score: 76,
    expectedValuePct: 2.8,
    lineMovement: 6,
    bestPriceFlag: true,
    freshnessMinutes: 6,
    trapFlags: ["FAKE_MOVE_RISK"],
    disagreementScore: 0.12
  });
  assert(watch.actionState === "WATCH", `expected WATCH, got ${watch.actionState}`);
  assert(watch.timingState === "MONITOR_ONLY", `expected MONITOR_ONLY, got ${watch.timingState}`);

  const pass = buildOpportunityTiming({
    score: 78,
    expectedValuePct: 3.5,
    lineMovement: 3,
    bestPriceFlag: true,
    freshnessMinutes: 4,
    trapFlags: ["STALE_EDGE"],
    disagreementScore: 0.04
  });
  assert(pass.actionState === "PASS", `expected PASS, got ${pass.actionState}`);
  assert(pass.timingState === "PASS_ON_PRICE", `expected PASS_ON_PRICE, got ${pass.timingState}`);
}

function testTrapFlags() {
  const flags = buildOpportunityTrapFlags({
    fairPrice: {
      pricingConfidenceScore: 44
    } as never,
    marketIntelligence: {
      staleFlag: true,
      marketDisagreementScore: 0.2,
      bestPriceFlag: false
    } as never,
    marketTruth: {
      stale: true,
      disagreementPct: 7,
      movementStrength: 12,
      bookCount: 1
    } as never,
    providerHealth: {
      state: "DEGRADED"
    } as never,
    bookCount: 1,
    lineMovement: 12,
    conflictSignal: true
  });

  for (const expected of [
    "STALE_EDGE",
    "ONE_BOOK_OUTLIER",
    "HIGH_MARKET_DISAGREEMENT",
    "LOW_CONFIDENCE_FAIR_PRICE",
    "LOW_PROVIDER_HEALTH",
    "FAKE_MOVE_RISK",
    "MODEL_MARKET_CONFLICT"
  ]) {
    assert(flags.includes(expected as (typeof flags)[number]), `expected trap flag ${expected}`);
  }

  const thinFlags = buildOpportunityTrapFlags({
    fairPrice: null,
    marketIntelligence: {
      staleFlag: false,
      marketDisagreementScore: 0.08,
      bestPriceFlag: true
    } as never,
    marketTruth: {
      stale: false,
      disagreementPct: 3,
      movementStrength: 2,
      bookCount: 3
    } as never,
    providerHealth: {
      state: "HEALTHY"
    } as never,
    bookCount: 3,
    lineMovement: 2,
    conflictSignal: false
  });

  assert(thinFlags.includes("THIN_MARKET"), "expected THIN_MARKET for shallow but not one-book depth");
}

function run() {
  testScoreBuckets();
  testPenaltyBehavior();
  testTimingTransitions();
  testTrapFlags();
  console.log("Opportunity engine tests passed.");
}

run();
