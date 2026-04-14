import type { AlertNotificationView, WatchlistItemView } from "@/lib/types/product";
import type { OpportunityView } from "@/lib/types/opportunity";
import { buildPrioritizationView } from "@/services/decision/prioritization-engine";
import { buildDecisionFromOpportunitySnapshot, isDecisionView } from "@/services/decision/decision-engine";
import {
  buildOpportunitySnapshot,
  isOpportunitySnapshot
} from "@/services/opportunities/opportunity-snapshot";

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
    triggerSummary: "Market is still off fair.",
    killSummary: "If the price gets worse, this drops out.",
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

function buildSnapshot(overrides: Partial<OpportunityView> = {}) {
  const snapshot = buildOpportunitySnapshot(makeOpportunity(overrides));
  if (!snapshot) {
    throw new Error("Expected opportunity snapshot");
  }

  return snapshot;
}

function testNormalizationBoundary() {
  const rawish = {
    id: "opp-raw",
    opportunityScore: 81,
    confidenceTier: "A",
    actionState: "BET_NOW",
    timingState: "WINDOW_OPEN",
    trapFlags: ["STALE_EDGE", "NOT_REAL"]
  };
  assert(!isOpportunitySnapshot(rawish), "expected raw-ish input to fail snapshot validation");

  const snapshot = buildSnapshot();
  assert(isOpportunitySnapshot(snapshot), "expected normalized snapshot to pass validation");

  const decision = buildDecisionFromOpportunitySnapshot(snapshot);
  assert(isDecisionView(decision), "expected normalized snapshot to produce a valid decision");
}

function testStableDecisionSignature() {
  const snapshot = buildSnapshot();
  const left = buildDecisionFromOpportunitySnapshot(snapshot);
  const right = buildDecisionFromOpportunitySnapshot(snapshot);

  assert(
    left.dedupeSignature === right.dedupeSignature,
    "expected same snapshot to produce same dedupe signature"
  );
}

function testSemanticSignatureChange() {
  const baseSnapshot = buildSnapshot();
  const riskSnapshot = buildSnapshot({
    confidenceTier: "C",
    actionState: "WATCH",
    timingState: "MONITOR_ONLY",
    trapFlags: ["STALE_EDGE", "LOW_PROVIDER_HEALTH"],
    staleFlag: true,
    providerFreshnessMinutes: 28,
    sourceHealth: {
      state: "DEGRADED",
      freshnessMinutes: 28,
      warnings: ["Feed is aging."]
    }
  });

  const baseDecision = buildDecisionFromOpportunitySnapshot(baseSnapshot);
  const riskDecision = buildDecisionFromOpportunitySnapshot(riskSnapshot);

  assert(
    baseDecision.dedupeSignature !== riskDecision.dedupeSignature,
    "expected semantic snapshot changes to alter the dedupe signature"
  );
}

function testTrapFlagsInfluenceDecision() {
  const snapshot = buildSnapshot({
    confidenceTier: "B",
    actionState: "BET_NOW",
    timingState: "WINDOW_OPEN",
    staleFlag: true,
    providerFreshnessMinutes: 24,
    trapFlags: ["STALE_EDGE", "LOW_PROVIDER_HEALTH", "HIGH_MARKET_DISAGREEMENT"],
    sourceHealth: {
      state: "DEGRADED",
      freshnessMinutes: 24,
      warnings: ["Source health is degraded."]
    }
  });

  const decision = buildDecisionFromOpportunitySnapshot(snapshot);

  assert(
    decision.reasons.includes("trap_flag_present"),
    "expected trap presence to appear in decision reasons"
  );
  assert(
    decision.reasons.includes("trap_flag_multiple"),
    "expected multiple traps to appear in decision reasons"
  );
  assert(
    decision.recommendation !== "surface",
    "expected trap-heavy cases to avoid the surface recommendation"
  );
}

function testWatchlistAlertAlignment() {
  const snapshot = buildSnapshot();
  const decision = buildDecisionFromOpportunitySnapshot(snapshot);
  const prioritization = buildPrioritizationView({ decision, change: null });

  const watchlistItem: WatchlistItemView = {
    id: "watch-1",
    savedAt: new Date("2026-04-03T10:00:00.000Z").toISOString(),
    archivedAt: null,
    sport: "BASKETBALL",
    league: "NBA",
    eventId: "event-1",
    eventExternalId: "external-1",
    eventLabel: "Lakers at Celtics",
    marketType: "spread",
    marketLabel: "Spread",
    selection: "Lakers +4.5",
    side: "AWAY",
    line: 4.5,
    oddsAmerican: -110,
    sportsbookName: "DraftKings",
    sourcePage: "board",
    sourcePath: "/board",
    supportStatus: "LIVE",
    supportNote: null,
    isLive: false,
    status: "ACTIVE",
    intent: {
      betType: "STRAIGHT",
      sport: "BASKETBALL",
      league: "NBA",
      eventLabel: "Lakers at Celtics",
      eventId: "event-1",
      externalEventId: "external-1",
      source: "MANUAL",
      isLive: false,
      sportsbookName: "DraftKings",
      legs: [
        {
          marketType: "spread",
          marketLabel: "Spread",
          selection: "Lakers +4.5",
          side: "AWAY",
          line: 4.5,
          oddsAmerican: -110,
          sportsbookName: "DraftKings"
        }
      ]
    },
    current: {
      available: true,
      stale: false,
      eventStatus: "PREGAME",
      stateDetail: null,
      scoreboard: null,
      startTime: new Date("2026-04-04T00:00:00.000Z").toISOString(),
      sportsbookName: "DraftKings",
      oddsAmerican: -110,
      line: 4.5,
      expectedValuePct: 5.8,
      bestBookChanged: false,
      note: "Live state resolved."
    },
    alertCount: 1,
    opportunitySnapshot: snapshot,
    decision,
    changeIntelligence: null,
    prioritization
  };

  const alertNotification: AlertNotificationView = {
    id: "alert-1",
    alertRuleId: "rule-1",
    watchlistItemId: watchlistItem.id,
    severity: "ACTION",
    title: "Surface now",
    body: "Decision changed.",
    sourcePath: "/alerts",
    sourcePage: "alerts",
    createdAt: new Date("2026-04-03T10:05:00.000Z").toISOString(),
    readAt: null,
    dismissedAt: null,
    eventLabel: watchlistItem.eventLabel,
    selection: watchlistItem.selection,
    betIntent: watchlistItem.intent,
    opportunitySnapshot: snapshot,
    decision,
    changeIntelligence: null,
    prioritization
  };

  assert(
    watchlistItem.decision?.dedupeSignature === alertNotification.decision?.dedupeSignature,
    "expected watchlist and alerts to share the same decision signature"
  );
  assert(
    watchlistItem.decision?.recommendation === alertNotification.decision?.recommendation,
    "expected watchlist and alerts to share the same recommendation"
  );
}

function run() {
  testNormalizationBoundary();
  testStableDecisionSignature();
  testSemanticSignatureChange();
  testTrapFlagsInfluenceDecision();
  testWatchlistAlertAlignment();
  console.log("Decision engine tests passed.");
}

run();
