import type { OpportunityView } from "@/lib/types/opportunity";
import {
  getPrioritizationExplanation,
  getPrioritizationLabel
} from "@/components/intelligence/prioritization";
import { buildChangeIntelligence, buildDecisionStateRecord } from "@/services/decision/change-intelligence";
import { buildDecisionMemorySync } from "@/services/decision/decision-memory-sync";
import { buildDecisionFromOpportunitySnapshot } from "@/services/decision/decision-engine";
import {
  attachPrioritization,
  buildAttentionQueue
} from "@/services/decision/attention-queue";
import { buildOpportunitySnapshot } from "@/services/opportunities/opportunity-snapshot";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function makeOpportunity(overrides: Partial<OpportunityView> = {}): OpportunityView {
  return {
    id: "opp-attention-1",
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
    fairPriceAmerican: -126,
    fairPriceMethod: "blended_fair_price",
    expectedValuePct: 4.9,
    marketDeltaAmerican: 18,
    consensusImpliedProbability: 0.53,
    marketDisagreementScore: 0.04,
    providerFreshnessMinutes: 5,
    staleFlag: false,
    bookCount: 5,
    lineMovement: 1.5,
    edgeScore: 80,
    opportunityScore: 84,
    confidenceTier: "A",
    actionState: "BET_NOW",
    timingState: "WINDOW_OPEN",
    trapFlags: [],
    whyItShows: ["The number is still off fair."],
    whatCouldKillIt: ["If the price slips, this drops."],
    triggerSummary: "The number is still off fair.",
    killSummary: "If the price slips, this drops.",
    reasonSummary: "The number is still off fair.",
    personalizationAdjustments: [],
    sourceHealth: {
      state: "HEALTHY",
      freshnessMinutes: 5,
      warnings: []
    },
    sourceNote: "Healthy feed.",
    scoreComponents: {
      priceEdge: 24,
      expectedValue: 20,
      marketValidation: 16,
      timingQuality: 12,
      freshness: 8,
      support: 5,
      sourceQuality: 0,
      marketEfficiency: 0,
      edgeDecay: 0,
      truthCalibration: 0,
      reasonCalibration: 0,
      marketPath: 0,
      closeDestination: 0,
      executionCapacity: 0,
      personalization: 0,
      penalties: 0
    },
    truthClassification: "trustworthy",
    ...overrides
  } as unknown as OpportunityView;
}

function buildDecision(overrides: Partial<OpportunityView> = {}) {
  return buildDecisionFromOpportunitySnapshot(buildOpportunitySnapshot(makeOpportunity(overrides))!);
}

function testStableQueueOrderingForIdenticalSemantics() {
  const decision = buildDecision();
  const previous = buildDecisionStateRecord(
    buildDecision({
      actionState: "WATCH",
      timingState: "MONITOR_ONLY",
      confidenceTier: "C",
      opportunityScore: 60
    }),
    "2026-04-03T10:00:00.000Z"
  );
  const change = buildChangeIntelligence(previous, decision, "2026-04-03T10:05:00.000Z");

  const queue = buildAttentionQueue(
    [
      {
        id: "older",
        createdAt: "2026-04-03T10:00:00.000Z",
        decision,
        changeIntelligence: change
      },
      {
        id: "newer",
        createdAt: "2026-04-03T10:01:00.000Z",
        decision,
        changeIntelligence: change
      }
    ],
    {
      getSecondarySortValue: (item) => Date.parse(item.createdAt)
    }
  );

  assert(queue[0]?.id === "newer", "expected identical semantics to fall back to deterministic secondary ordering");
  assert(
    queue[0]?.prioritization.stableAttentionSignature === queue[1]?.prioritization.stableAttentionSignature,
    "expected identical semantics to share the same attention signature"
  );
}

function testBoardWatchlistAndAlertsSharePrioritySemantics() {
  const decision = buildDecision();
  const summary = buildDecisionMemorySync({
    previousMemory: null,
    decision,
    recordedAt: "2026-04-03T10:00:00.000Z"
  }).nextMemory.latestSummary;

  const boardItem = attachPrioritization({
    id: "board",
    decision,
    summary
  });
  const watchlistItem = attachPrioritization({
    id: "watchlist",
    decision
  });
  const alertItem = attachPrioritization({
    id: "alert",
    decision
  });

  assert(
    boardItem.prioritization.attentionTier === watchlistItem.prioritization.attentionTier &&
      watchlistItem.prioritization.attentionTier === alertItem.prioritization.attentionTier,
    "expected board, watchlist, and alerts to share attention-tier semantics for the same decision"
  );
  assert(
    getPrioritizationLabel(boardItem.prioritization) === getPrioritizationLabel(watchlistItem.prioritization) &&
      getPrioritizationLabel(watchlistItem.prioritization) === getPrioritizationLabel(alertItem.prioritization),
    "expected board, watchlist, and alerts to share the same visible priority label"
  );
}

function testLowSignalStatesFallBehindSurfacedQueueItems() {
  const surfacedDecision = buildDecision();
  const hiddenDecision = buildDecision({
    actionState: "PASS",
    timingState: "PASS_ON_PRICE",
    confidenceTier: "D",
    providerFreshnessMinutes: 50,
    staleFlag: true,
    trapFlags: ["STALE_EDGE", "LOW_PROVIDER_HEALTH"],
    opportunityScore: 38,
    sourceHealth: {
      state: "DEGRADED",
      freshnessMinutes: 50,
      warnings: ["Feed is degraded."]
    }
  });

  const queue = buildAttentionQueue(
    [
      {
        id: "hidden",
        createdAt: "2026-04-03T10:02:00.000Z",
        decision: hiddenDecision
      },
      {
        id: "surfaced",
        createdAt: "2026-04-03T10:01:00.000Z",
        decision: surfacedDecision
      }
    ],
    {
      getSecondarySortValue: (item) => Date.parse(item.createdAt)
    }
  );

  assert(queue[0]?.id === "surfaced", "expected surfaced opportunity to outrank hidden low-signal state");
  assert(queue[1]?.prioritization.surfaced === false, "expected low-signal state to stay hidden in the shared queue");
}

function testUnsupportedPriorityExplanationStaysHidden() {
  const hidden = attachPrioritization({
    id: "hidden",
    decision: null
  });

  assert(getPrioritizationExplanation(hidden.prioritization) === null, "expected hidden queue items to avoid blank explanation leaks");
}

function run() {
  testStableQueueOrderingForIdenticalSemantics();
  testBoardWatchlistAndAlertsSharePrioritySemantics();
  testLowSignalStatesFallBehindSurfacedQueueItems();
  testUnsupportedPriorityExplanationStaysHidden();
  console.log("Attention queue tests passed.");
}

run();
