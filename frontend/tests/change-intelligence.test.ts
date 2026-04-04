import type {
  AlertNotificationView,
  WatchlistItemView
} from "@/lib/types/product";
import type { OpportunityView } from "@/lib/types/opportunity";
import {
  buildChangeIntelligence,
  buildDecisionStateRecord,
  shouldAlertForChange
} from "@/services/decision/change-intelligence";
import { buildDecisionFromOpportunitySnapshot } from "@/services/decision/decision-engine";
import { buildPrioritizationView } from "@/services/decision/prioritization-engine";
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

function testIdenticalStatesProduceNoChange() {
  const decision = buildDecision();
  const previous = buildDecisionStateRecord(decision, "2026-04-03T10:00:00.000Z");
  const change = buildChangeIntelligence(previous, decision, "2026-04-03T10:05:00.000Z");

  assert(change.changeSeverity === "none", `expected none severity, got ${change.changeSeverity}`);
  assert(change.changeDirection === "unchanged", `expected unchanged, got ${change.changeDirection}`);
  assert(change.noiseSuppressed, "expected unchanged semantic state to be suppressed as noise");
  assert(!shouldAlertForChange(change), "expected unchanged semantic state to avoid alerting");

  const repeat = buildChangeIntelligence(previous, decision, "2026-04-03T10:06:00.000Z");
  assert(
    change.stableChangeSignature === repeat.stableChangeSignature,
    "expected identical semantic states to share the same stable signature"
  );
}

function testUpgradeAndDowngradeSignals() {
  const previous = buildDecisionStateRecord(
    buildDecision({ confidenceTier: "C", actionState: "WATCH", timingState: "MONITOR_ONLY", opportunityScore: 61 }),
    "2026-04-03T10:00:00.000Z"
  );
  const current = buildDecision({ confidenceTier: "A", actionState: "BET_NOW", timingState: "WINDOW_OPEN", opportunityScore: 88 });
  const change = buildChangeIntelligence(previous, current, "2026-04-03T10:10:00.000Z");

  assert(change.changeDirection === "upgraded", `expected upgraded, got ${change.changeDirection}`);
  assert(change.changeSeverity === "major", `expected major, got ${change.changeSeverity}`);
  assert(change.changeReasons.includes("confidence_improved"), "expected confidence improvement reason");
  assert(change.changeReasons.includes("action_shifted_to_bet_now"), "expected bet-now shift reason");
  assert(change.changeReasons.includes("timing_became_live"), "expected live timing reason");

  const downgraded = buildChangeIntelligence(
    buildDecisionStateRecord(current, "2026-04-03T10:10:00.000Z"),
    buildDecision({ confidenceTier: "D", actionState: "PASS", timingState: "PASS_ON_PRICE", opportunityScore: 42 }),
    "2026-04-03T10:20:00.000Z"
  );

  assert(downgraded.changeDirection === "downgraded", `expected downgraded, got ${downgraded.changeDirection}`);
  assert(downgraded.changeSeverity === "major", `expected major downgrade, got ${downgraded.changeSeverity}`);
}

function testTrapDeltaReasons() {
  const base = buildDecision();
  const trapHeavy = buildDecision({
    trapFlags: ["STALE_EDGE", "LOW_PROVIDER_HEALTH"],
    staleFlag: true,
    sourceHealth: {
      state: "DEGRADED",
      freshnessMinutes: 28,
      warnings: ["Feed is degraded."]
    },
    providerFreshnessMinutes: 28
  });

  const added = buildChangeIntelligence(
    buildDecisionStateRecord(base, "2026-04-03T10:00:00.000Z"),
    trapHeavy,
    "2026-04-03T10:05:00.000Z"
  );
  assert(added.changeReasons.includes("trap_flag_added"), "expected trap add reason");
  assert(added.changeReasons.includes("stale_data_detected"), "expected stale detection reason");

  const cleared = buildChangeIntelligence(
    buildDecisionStateRecord(trapHeavy, "2026-04-03T10:05:00.000Z"),
    base,
    "2026-04-03T10:10:00.000Z"
  );
  assert(cleared.changeReasons.includes("trap_flag_cleared"), "expected trap clear reason");
  assert(cleared.changeReasons.includes("stale_data_cleared"), "expected stale cleared reason");
}

function testAlertsOnlyFireForMeaningfulChanges() {
  const previous = buildDecisionStateRecord(buildDecision(), "2026-04-03T10:00:00.000Z");
  const unchanged = buildChangeIntelligence(previous, buildDecision(), "2026-04-03T10:05:00.000Z");
  assert(!shouldAlertForChange(unchanged), "expected unchanged semantic state to stay quiet");

  const meaningful = buildChangeIntelligence(
    previous,
    buildDecision({ actionState: "PASS", timingState: "PASS_ON_PRICE", confidenceTier: "D", opportunityScore: 39 }),
    "2026-04-03T10:07:00.000Z"
  );
  assert(shouldAlertForChange(meaningful), "expected major semantic downgrade to be alert-worthy");
}

function testWatchlistAndAlertsShareChangeSemantics() {
  const previous = buildDecisionStateRecord(
    buildDecision({ actionState: "WATCH", timingState: "MONITOR_ONLY", confidenceTier: "B", opportunityScore: 68 }),
    "2026-04-03T10:00:00.000Z"
  );
  const current = buildDecision({ actionState: "BET_NOW", timingState: "WINDOW_OPEN", confidenceTier: "A", opportunityScore: 87 });
  const change = buildChangeIntelligence(previous, current, "2026-04-03T10:03:00.000Z");
  const prioritization = buildPrioritizationView({ decision: current, change });

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
    opportunitySnapshot: buildOpportunitySnapshot(makeOpportunity())!,
    decision: current,
    changeIntelligence: change,
    prioritization
  };

  const alertNotification: AlertNotificationView = {
    id: "alert-1",
    alertRuleId: "rule-1",
    watchlistItemId: watchlistItem.id,
    severity: "ACTION",
    title: "Decision improved",
    body: "Decision changed.",
    sourcePath: "/alerts",
    sourcePage: "alerts",
    createdAt: new Date("2026-04-03T10:04:00.000Z").toISOString(),
    readAt: null,
    dismissedAt: null,
    eventLabel: watchlistItem.eventLabel,
    selection: watchlistItem.selection,
    betIntent: watchlistItem.intent,
    opportunitySnapshot: watchlistItem.opportunitySnapshot,
    decision: current,
    changeIntelligence: change,
    prioritization
  };

  assert(
    watchlistItem.changeIntelligence?.stableChangeSignature === alertNotification.changeIntelligence?.stableChangeSignature,
    "expected watchlist and alerts to share the same change signature"
  );
}

function run() {
  testIdenticalStatesProduceNoChange();
  testUpgradeAndDowngradeSignals();
  testTrapDeltaReasons();
  testAlertsOnlyFireForMeaningfulChanges();
  testWatchlistAndAlertsShareChangeSemantics();
  console.log("Change intelligence tests passed.");
}

run();
