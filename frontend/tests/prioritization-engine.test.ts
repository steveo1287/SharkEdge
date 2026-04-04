import type { OpportunityView } from "@/lib/types/opportunity";
import {
  getPrioritizationExplanation,
  getPrioritizationLabel,
  hasRenderablePrioritization
} from "@/components/intelligence/prioritization";
import { buildChangeIntelligence, buildDecisionStateRecord } from "@/services/decision/change-intelligence";
import { buildDecisionMemorySync } from "@/services/decision/decision-memory-sync";
import { buildDecisionFromOpportunitySnapshot } from "@/services/decision/decision-engine";
import {
  buildPrioritizationView,
  rankPrioritizationViews
} from "@/services/decision/prioritization-engine";
import { buildOpportunitySnapshot } from "@/services/opportunities/opportunity-snapshot";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function makeOpportunity(overrides: Partial<OpportunityView> = {}): OpportunityView {
  return {
    id: "opp-priority-1",
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
    expectedValuePct: 5.2,
    marketDeltaAmerican: 18,
    consensusImpliedProbability: 0.53,
    marketDisagreementScore: 0.04,
    providerFreshnessMinutes: 3,
    staleFlag: false,
    bookCount: 5,
    lineMovement: 2,
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

function testStablePrioritizationSignature() {
  const decision = buildDecision();
  const summary = buildDecisionMemorySync({
    previousMemory: null,
    decision,
    recordedAt: "2026-04-03T10:00:00.000Z"
  }).nextMemory.latestSummary;
  const left = buildPrioritizationView({ decision, summary });
  const right = buildPrioritizationView({ decision, summary });

  assert(
    left.stableAttentionSignature === right.stableAttentionSignature,
    "expected identical semantics to produce stable attention signatures"
  );
}

function testMeaningfulUpgradeOutranksUnchangedLowSignal() {
  const upgradedDecision = buildDecision();
  const upgradeChange = buildChangeIntelligence(
    buildDecisionStateRecord(
      buildDecision({ actionState: "WATCH", timingState: "MONITOR_ONLY", confidenceTier: "C", opportunityScore: 62 }),
      "2026-04-03T10:00:00.000Z"
    ),
    upgradedDecision,
    "2026-04-03T10:05:00.000Z"
  );
  const upgraded = buildPrioritizationView({ decision: upgradedDecision, change: upgradeChange });

  const lowSignalDecision = buildDecision({
    actionState: "WATCH",
    timingState: "MONITOR_ONLY",
    confidenceTier: "C",
    opportunityScore: 57
  });
  const unchanged = buildPrioritizationView({
    decision: lowSignalDecision,
    summary: buildDecisionMemorySync({
      previousMemory: null,
      decision: lowSignalDecision,
      recordedAt: "2026-04-03T10:00:00.000Z"
    }).nextMemory.latestSummary
  });

  const ranked = rankPrioritizationViews([
    { id: "unchanged", prioritization: unchanged },
    { id: "upgraded", prioritization: upgraded }
  ]);

  assert(ranked[0]?.id === "upgraded", "expected meaningful upgrade to outrank unchanged low-signal state");
  assert(upgraded.attentionTier === "critical", `expected critical tier, got ${upgraded.attentionTier}`);
}

function testStaleLowSignalSuppresses() {
  const decision = buildDecision({
    actionState: "PASS",
    timingState: "PASS_ON_PRICE",
    confidenceTier: "D",
    providerFreshnessMinutes: 45,
    staleFlag: true,
    trapFlags: ["STALE_EDGE", "LOW_PROVIDER_HEALTH"],
    sourceHealth: {
      state: "DEGRADED",
      freshnessMinutes: 45,
      warnings: ["Feed is degraded."]
    },
    opportunityScore: 42
  });
  const prioritization = buildPrioritizationView({ decision });

  assert(!prioritization.surfaced, "expected stale low-signal state to be hidden");
  assert(prioritization.attentionTier === "hidden", `expected hidden tier, got ${prioritization.attentionTier}`);
}

function testPrioritizationLanguageIsDeterministicAndSafe() {
  const decision = buildDecision();
  const change = buildChangeIntelligence(
    buildDecisionStateRecord(
      buildDecision({ actionState: "WATCH", timingState: "MONITOR_ONLY", confidenceTier: "C", opportunityScore: 62 }),
      "2026-04-03T10:00:00.000Z"
    ),
    decision,
    "2026-04-03T10:05:00.000Z"
  );
  const prioritization = buildPrioritizationView({ decision, change });

  assert(hasRenderablePrioritization(prioritization), "expected surfaced prioritization to be renderable");
  assert(getPrioritizationLabel(prioritization) === "Now", `expected stable label Now, got ${getPrioritizationLabel(prioritization)}`);
  assert(
    getPrioritizationExplanation(prioritization) === "Recommendation improved.",
    `expected deterministic explanation, got ${getPrioritizationExplanation(prioritization)}`
  );
}

function testEmptyExplanationDoesNotLeak() {
  const hidden = {
    attentionTier: "high",
    attentionDirection: "stable",
    surfaced: true,
    surfacedReasonCodes: ["recommendation_high_priority"] as ("recommendation_high_priority")[],
    shortAttentionLabel: "Active",
    shortAttentionExplanation: "   ",
    stableAttentionSignature: "sig",
    sortWeight: 100,
    freshnessBucket: "fresh"
  } as const;

  assert(getPrioritizationExplanation(hidden) === null, "expected blank prioritization explanation to stay hidden");
}

function run() {
  testStablePrioritizationSignature();
  testMeaningfulUpgradeOutranksUnchangedLowSignal();
  testStaleLowSignalSuppresses();
  testPrioritizationLanguageIsDeterministicAndSafe();
  testEmptyExplanationDoesNotLeak();
  console.log("Prioritization engine tests passed.");
}

run();
