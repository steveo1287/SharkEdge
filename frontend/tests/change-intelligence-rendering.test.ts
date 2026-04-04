import {
  getChangeBadgeLabel,
  getChangeExplanation,
  getChangeReasonLabels,
  hasRenderableChange
} from "@/components/intelligence/change-intelligence";
import { buildChangeIntelligence, buildDecisionStateRecord } from "@/services/decision/change-intelligence";
import { buildDecisionFromOpportunitySnapshot } from "@/services/decision/decision-engine";
import { buildOpportunitySnapshot } from "@/services/opportunities/opportunity-snapshot";
import type { OpportunityView } from "@/lib/types/opportunity";
import type { ChangeIntelligenceView } from "@/lib/types/change-intelligence";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function makeOpportunity(overrides: Partial<OpportunityView> = {}): OpportunityView {
  return {
    id: "opp-render-1",
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
    expectedValuePct: 5.1,
    marketDeltaAmerican: 16,
    consensusImpliedProbability: 0.53,
    marketDisagreementScore: 0.04,
    providerFreshnessMinutes: 3,
    staleFlag: false,
    bookCount: 5,
    lineMovement: 2,
    edgeScore: 82,
    opportunityScore: 84,
    confidenceTier: "B",
    actionState: "WAIT",
    timingState: "WAIT_FOR_CONFIRMATION",
    trapFlags: [],
    whyItShows: ["Market is still off fair."],
    whatCouldKillIt: ["If the price slips, this drops out."],
    reasonSummary: "Market is still off fair.",
    personalizationAdjustments: [],
    sourceHealth: {
      state: "HEALTHY",
      freshnessMinutes: 3,
      warnings: []
    },
    sourceNote: "Healthy feed.",
    scoreComponents: {
      priceEdge: 25,
      expectedValue: 20,
      marketValidation: 15,
      timingQuality: 10,
      freshness: 8,
      support: 5,
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

function testMeaningfulChangeRenders() {
  const previous = buildDecisionStateRecord(
    buildDecision({ actionState: "WATCH", timingState: "MONITOR_ONLY", confidenceTier: "C", opportunityScore: 60 }),
    "2026-04-03T10:00:00.000Z"
  );
  const current = buildDecision({ actionState: "BET_NOW", timingState: "WINDOW_OPEN", confidenceTier: "A", opportunityScore: 90 });
  const change = buildChangeIntelligence(previous, current, "2026-04-03T10:05:00.000Z");

  assert(hasRenderableChange(change), "expected meaningful change to render");
  assert(getChangeExplanation(change) === change.shortExplanation, "expected rendered explanation to use typed shortExplanation");
  assert(getChangeBadgeLabel(change).length > 0, "expected non-empty badge label");
  assert(getChangeReasonLabels(change).length > 0, "expected compact reason labels");
}

function testNonMeaningfulChangeDoesNotRender() {
  const decision = buildDecision();
  const noChange = buildChangeIntelligence(
    buildDecisionStateRecord(decision, "2026-04-03T10:00:00.000Z"),
    decision,
    "2026-04-03T10:05:00.000Z"
  );

  assert(!hasRenderableChange(noChange), "expected no-change state to stay hidden");
  assert(getChangeExplanation(noChange) === null, "expected no explanation for no-change state");
}

function testConsistentRenderingAcrossSurfaces() {
  const previous = buildDecisionStateRecord(
    buildDecision({ actionState: "BET_NOW", timingState: "WINDOW_OPEN", confidenceTier: "A", opportunityScore: 91 }),
    "2026-04-03T10:00:00.000Z"
  );
  const current = buildDecision({ actionState: "PASS", timingState: "PASS_ON_PRICE", confidenceTier: "D", opportunityScore: 40 });
  const change = buildChangeIntelligence(previous, current, "2026-04-03T10:07:00.000Z");

  const watchlistRender = {
    badge: getChangeBadgeLabel(change),
    explanation: getChangeExplanation(change)
  };
  const detailRender = {
    badge: getChangeBadgeLabel(change),
    explanation: getChangeExplanation(change)
  };
  const alertsRender = {
    badge: getChangeBadgeLabel(change),
    explanation: getChangeExplanation(change)
  };

  assert(watchlistRender.badge === detailRender.badge && detailRender.badge === alertsRender.badge, "expected shared badge label across surfaces");
  assert(
    watchlistRender.explanation === detailRender.explanation && detailRender.explanation === alertsRender.explanation,
    "expected shared explanation across surfaces"
  );
}

function testEmptyExplanationNeverLeaks() {
  const invalid = {
    previousDecisionAvailable: true,
    currentDecisionAvailable: true,
    changeSeverity: "major",
    changeDirection: "upgraded",
    changedFields: ["recommendation"],
    changeReasons: ["recommendation_upgraded"],
    shortExplanation: "   ",
    alertWorthyChange: true,
    noiseSuppressed: false,
    stableChangeSignature: "sig",
    previousRecordedAt: "2026-04-03T10:00:00.000Z",
    currentRecordedAt: "2026-04-03T10:05:00.000Z"
  } satisfies ChangeIntelligenceView;

  assert(!hasRenderableChange(invalid), "expected blank explanation content to stay hidden");
  assert(getChangeExplanation(invalid) === null, "expected blank explanation to return null");
}

function run() {
  testMeaningfulChangeRenders();
  testNonMeaningfulChangeDoesNotRender();
  testConsistentRenderingAcrossSurfaces();
  testEmptyExplanationNeverLeaks();
  console.log("Change intelligence rendering tests passed.");
}

run();
