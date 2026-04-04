import type { OpportunityView } from "@/lib/types/opportunity";
import { buildDecisionStateRecord, buildChangeIntelligence } from "@/services/decision/change-intelligence";
import {
  getDecisionMemoryFromContextJson,
  getDecisionMemoryFromEvaluationStateJson,
  mergeDecisionMemoryIntoContextJson,
  mergeDecisionMemoryIntoEvaluationStateJson
} from "@/services/decision/decision-memory-repository";
import {
  buildDecisionMemorySync,
  getLatestDecisionMemorySummary,
  isDecisionMemoryMissing,
  isDecisionMemoryStale
} from "@/services/decision/decision-memory-sync";
import { buildDecisionFromOpportunitySnapshot } from "@/services/decision/decision-engine";
import { buildOpportunitySnapshot } from "@/services/opportunities/opportunity-snapshot";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function makeOpportunity(overrides: Partial<OpportunityView> = {}): OpportunityView {
  return {
    id: "opp-1",
    kind: "game_side",
    league: "NBA",
    eventId: "event-1",
    eventLabel: "Lakers at Celtics",
    marketType: "spread",
    selectionLabel: "Lakers +4.5",
    sportsbookKey: "draftkings",
    sportsbookName: "DraftKings",
    displayOddsAmerican: -110,
    displayLine: 4.5,
    fairPriceAmerican: -128,
    fairPriceMethod: "blended_fair_price",
    expectedValuePct: 5.8,
    marketDeltaAmerican: 18,
    consensusImpliedProbability: 0.53,
    marketDisagreementScore: 0.04,
    providerFreshnessMinutes: 3,
    staleFlag: false,
    bookCount: 5,
    lineMovement: 3,
    edgeScore: 82,
    opportunityScore: 86,
    confidenceTier: "A",
    actionState: "BET_NOW",
    timingState: "WINDOW_OPEN",
    trapFlags: [],
    whyItShows: ["Market is still off fair."],
    whatCouldKillIt: ["If the price gets worse, this drops out."],
    reasonSummary: "Market is still off fair and the window is open.",
    personalizationAdjustments: [],
    sourceHealth: {
      state: "HEALTHY",
      freshnessMinutes: 3,
      warnings: []
    },
    sourceNote: "Healthy live mesh.",
    scoreComponents: {
      priceEdge: 25,
      expectedValue: 22,
      marketValidation: 15,
      timingQuality: 14,
      freshness: 8,
      support: 6,
      personalization: 0,
      penalties: 0
    },
    truthClassification: "trustworthy",
    ...overrides
  };
}

function buildDecision(overrides: Partial<OpportunityView> = {}) {
  return buildDecisionFromOpportunitySnapshot(buildOpportunitySnapshot(makeOpportunity(overrides))!);
}

function testContextRoundTrip() {
  const decision = buildDecision();
  const sync = buildDecisionMemorySync({
    previousMemory: null,
    decision,
    recordedAt: "2026-04-03T10:00:00.000Z"
  });
  const contextJson = mergeDecisionMemoryIntoContextJson(
    { existing: true } as never,
    sync.nextMemory
  );
  const parsed = getDecisionMemoryFromContextJson(contextJson);

  assert(parsed !== null, "expected semantic memory to round-trip from context json");
  assert(
    parsed?.decisionState?.decision?.dedupeSignature === decision.dedupeSignature,
    "expected round-tripped context memory to preserve decision signature"
  );
}

function testLegacyFallbackParses() {
  const decision = buildDecision({ actionState: "WATCH", timingState: "MONITOR_ONLY", confidenceTier: "B" });
  const decisionState = buildDecisionStateRecord(decision, "2026-04-03T09:55:00.000Z");
  const change = buildChangeIntelligence(null, decision, "2026-04-03T09:55:00.000Z");

  const legacyContext = {
    decisionState,
    changeIntelligence: change
  };

  const parsedContext = getDecisionMemoryFromContextJson(legacyContext as never);
  const parsedEvaluation = getDecisionMemoryFromEvaluationStateJson(legacyContext as never);

  assert(parsedContext !== null, "expected legacy watchlist blob to parse into semantic memory");
  assert(parsedEvaluation !== null, "expected legacy alert blob to parse into semantic memory");
  assert(
    parsedContext?.latestSummary.currentSemanticSignature === decision.dedupeSignature,
    "expected legacy parse to derive summary signature"
  );
}

function testSyncPreservesPreviousCurrentSemantics() {
  const previousMemory = buildDecisionMemorySync({
    previousMemory: null,
    decision: buildDecision({ actionState: "WATCH", timingState: "MONITOR_ONLY", confidenceTier: "C", opportunityScore: 63 }),
    recordedAt: "2026-04-03T10:00:00.000Z"
  }).nextMemory;

  const current = buildDecision({ actionState: "BET_NOW", timingState: "WINDOW_OPEN", confidenceTier: "A", opportunityScore: 88 });
  const sync = buildDecisionMemorySync({
    previousMemory,
    decision: current,
    recordedAt: "2026-04-03T10:10:00.000Z"
  });

  assert(sync.changed, "expected upgraded semantic state to require memory sync");
  assert(
    sync.nextMemory.latestChange?.changeDirection === "upgraded",
    `expected upgraded direction, got ${sync.nextMemory.latestChange?.changeDirection ?? "null"}`
  );
  assert(
    sync.nextMemory.latestSummary.lastMeaningfulChangeAt === "2026-04-03T10:10:00.000Z",
    "expected latest summary to track the newest meaningful change timestamp"
  );
  assert(
    sync.nextMemory.latestSummary.currentSemanticSignature === current.dedupeSignature,
    "expected latest summary to preserve current semantic signature"
  );
}

function testSummaryStability() {
  const decision = buildDecision({ actionState: "WAIT", timingState: "WAIT_FOR_PULLBACK", confidenceTier: "B" });
  const left = buildDecisionMemorySync({
    previousMemory: null,
    decision,
    recordedAt: "2026-04-03T11:00:00.000Z"
  }).nextMemory.latestSummary;
  const right = buildDecisionMemorySync({
    previousMemory: null,
    decision,
    recordedAt: "2026-04-03T11:00:00.000Z"
  }).nextMemory.latestSummary;

  assert(
    JSON.stringify(left) === JSON.stringify(right),
    "expected latest summary shape to stay deterministic"
  );
}

function testMissingAndStaleMemoryHelpers() {
  assert(isDecisionMemoryMissing(null), "expected missing helper to treat null memory as missing");
  assert(isDecisionMemoryStale(null), "expected stale helper to treat null memory as stale");

  const freshMemory = buildDecisionMemorySync({
    previousMemory: null,
    decision: buildDecision(),
    recordedAt: new Date().toISOString()
  }).nextMemory;
  assert(!isDecisionMemoryMissing(freshMemory), "expected populated memory not to be missing");
  assert(!isDecisionMemoryStale(freshMemory, 30), "expected recent memory not to be stale");

  const staleMemory = buildDecisionMemorySync({
    previousMemory: null,
    decision: buildDecision(),
    recordedAt: "2026-04-03T00:00:00.000Z"
  }).nextMemory;
  assert(isDecisionMemoryStale(staleMemory, 30), "expected old memory to be stale");
}

function testWatchlistAndAlertStorageCompatibility() {
  const decision = buildDecision({ actionState: "PASS", timingState: "PASS_ON_PRICE", confidenceTier: "D", opportunityScore: 41 });
  const sync = buildDecisionMemorySync({
    previousMemory: null,
    decision,
    recordedAt: "2026-04-03T12:00:00.000Z"
  });

  const watchlistContext = mergeDecisionMemoryIntoContextJson(null, sync.nextMemory);
  const alertEvaluation = mergeDecisionMemoryIntoEvaluationStateJson(
    { available: true } as never,
    sync.nextMemory,
    { available: true }
  );
  const watchlistParsed = getDecisionMemoryFromContextJson(watchlistContext);
  const alertParsed = getDecisionMemoryFromEvaluationStateJson(alertEvaluation);

  assert(
    watchlistParsed?.latestSummary.latestChangeSignature === alertParsed?.latestSummary.latestChangeSignature,
    "expected watchlist and alert storage to preserve the same latest change signature"
  );
  assert(
    getLatestDecisionMemorySummary(watchlistParsed ?? null)?.shortExplanation ===
      getLatestDecisionMemorySummary(alertParsed ?? null)?.shortExplanation,
    "expected watchlist and alert storage to preserve the same semantic summary"
  );
}

function run() {
  testContextRoundTrip();
  testLegacyFallbackParses();
  testSyncPreservesPreviousCurrentSemantics();
  testSummaryStability();
  testMissingAndStaleMemoryHelpers();
  testWatchlistAndAlertStorageCompatibility();
  console.log("Decision memory tests passed.");
}

run();
