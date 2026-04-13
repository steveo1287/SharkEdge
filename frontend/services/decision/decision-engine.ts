import type {
  DecisionAlertBasis,
  DecisionPriorityTier,
  DecisionReasonCode,
  DecisionRecommendation,
  DecisionView
} from "@/lib/types/decision";
import {
  DECISION_ALERT_BASES,
  DECISION_PRIORITY_TIERS,
  DECISION_REASON_CODES,
  DECISION_RECOMMENDATIONS
} from "@/lib/types/decision";
import type {
  OpportunityActionState,
  OpportunityConfidenceTier,
  OpportunitySnapshotView,
  OpportunityTimingState
} from "@/lib/types/opportunity";

const OPPORTUNITY_ACTION_STATES = ["BET_NOW", "WAIT", "WATCH", "PASS"] as const;
const OPPORTUNITY_TIMING_STATES = [
  "WINDOW_OPEN",
  "WAIT_FOR_PULLBACK",
  "WAIT_FOR_CONFIRMATION",
  "MONITOR_ONLY",
  "PASS_ON_PRICE"
] as const;
const OPPORTUNITY_CONFIDENCE_TIERS = ["A", "B", "C", "D"] as const;
const OPPORTUNITY_TRAP_FLAGS = [
  "STALE_EDGE",
  "THIN_MARKET",
  "ONE_BOOK_OUTLIER",
  "FAKE_MOVE_RISK",
  "LOW_CONFIDENCE_FAIR_PRICE",
  "INJURY_UNCERTAINTY",
  "HIGH_MARKET_DISAGREEMENT",
  "LOW_PROVIDER_HEALTH",
  "MODEL_MARKET_CONFLICT"
] as const;
const HEALTHY_SOURCE_STATE = "HEALTHY";

function includesLiteral<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function getActionReasonCode(actionState: OpportunityActionState): DecisionReasonCode {
  switch (actionState) {
    case "BET_NOW":
      return "action_bet_now";
    case "WAIT":
      return "action_wait";
    case "WATCH":
      return "action_watch";
    default:
      return "action_pass";
  }
}

function getConfidenceReasonCode(confidenceTier: OpportunityConfidenceTier): DecisionReasonCode {
  if (confidenceTier === "A") {
    return "confidence_high";
  }

  if (confidenceTier === "B") {
    return "confidence_medium";
  }

  return "confidence_low";
}

function getTimingReasonCode(timingState: OpportunityTimingState): DecisionReasonCode {
  switch (timingState) {
    case "WINDOW_OPEN":
      return "timing_window_open";
    case "WAIT_FOR_PULLBACK":
      return "timing_pullback";
    case "WAIT_FOR_CONFIRMATION":
      return "timing_confirmation";
    case "MONITOR_ONLY":
      return "timing_monitor_only";
    default:
      return "timing_price_dead";
  }
}

function getTrapFlags(snapshot: OpportunitySnapshotView) {
  return [...snapshot.trapFlags].sort();
}

function hasLimitedSource(snapshot: OpportunitySnapshotView) {
  return snapshot.sourceHealthState !== HEALTHY_SOURCE_STATE;
}

function isStaleOrIncomplete(snapshot: OpportunitySnapshotView) {
  if (snapshot.staleFlag) {
    return true;
  }

  if (hasLimitedSource(snapshot)) {
    return true;
  }

  return typeof snapshot.providerFreshnessMinutes === "number" && snapshot.providerFreshnessMinutes > 20;
}

function buildDecisionReasons(snapshot: OpportunitySnapshotView) {
  const reasons = new Set<DecisionReasonCode>();
  reasons.add(getActionReasonCode(snapshot.actionState));
  reasons.add(getConfidenceReasonCode(snapshot.confidenceTier));
  reasons.add(getTimingReasonCode(snapshot.timingState));

  if (snapshot.trapFlags.length > 0) {
    reasons.add("trap_flag_present");
  }

  if (snapshot.trapFlags.length > 1) {
    reasons.add("trap_flag_multiple");
  }

  if (isStaleOrIncomplete(snapshot)) {
    reasons.add("stale_or_incomplete");
  }

  if (hasLimitedSource(snapshot)) {
    reasons.add("provider_limited");
  }

  return Array.from(reasons);
}

function buildDecisionRecommendation(snapshot: OpportunitySnapshotView): DecisionRecommendation {
  const severeRisk =
    snapshot.trapFlags.length > 1 ||
    snapshot.trapFlags.includes("LOW_PROVIDER_HEALTH") ||
    snapshot.trapFlags.includes("HIGH_MARKET_DISAGREEMENT") ||
    snapshot.trapFlags.includes("STALE_EDGE");

  if (
    snapshot.actionState === "PASS" ||
    snapshot.confidenceTier === "D" ||
    snapshot.timingState === "PASS_ON_PRICE"
  ) {
    return "suppress";
  }

  if (snapshot.actionState === "BET_NOW") {
    if (severeRisk || isStaleOrIncomplete(snapshot)) {
      return "hold";
    }

    return "surface";
  }

  if (snapshot.actionState === "WAIT") {
    return severeRisk && isStaleOrIncomplete(snapshot) ? "suppress" : "hold";
  }

  if (snapshot.actionState === "WATCH") {
    return severeRisk && isStaleOrIncomplete(snapshot) ? "suppress" : "monitor";
  }

  return "suppress";
}

function buildDecisionPriority(
  snapshot: OpportunitySnapshotView,
  recommendation: DecisionRecommendation
): DecisionPriorityTier {
  if (
    recommendation === "surface" &&
    snapshot.confidenceTier === "A" &&
    snapshot.trapFlags.length === 0 &&
    !isStaleOrIncomplete(snapshot)
  ) {
    return "high";
  }

  if (recommendation === "surface" || recommendation === "monitor" || recommendation === "hold") {
    return "medium";
  }

  return "low";
}

function buildDecisionAlertMeta(
  recommendation: DecisionRecommendation,
  snapshot: OpportunitySnapshotView
) {
  if (recommendation === "surface") {
    return {
      eligible: true,
      basis: "surface_actionable" as const
    };
  }

  if (recommendation === "monitor" && !isStaleOrIncomplete(snapshot) && snapshot.trapFlags.length <= 1) {
    return {
      eligible: true,
      basis: "monitor_window" as const
    };
  }

  if (recommendation === "hold") {
    return {
      eligible: false,
      basis: "hold_for_entry" as const
    };
  }

  const basis: DecisionAlertBasis =
    snapshot.trapFlags.length > 0 || isStaleOrIncomplete(snapshot)
      ? "suppressed_risk"
      : "suppressed_passive";

  return {
    eligible: false,
    basis
  };
}

function getExplanationFragment(reason: DecisionReasonCode) {
  switch (reason) {
    case "action_bet_now":
      return "Number is actionable now.";
    case "action_wait":
      return "Wait for a better entry.";
    case "action_watch":
      return "Watch for confirmation.";
    case "action_pass":
      return "Current number is not playable.";
    case "confidence_high":
      return "Confidence is holding up.";
    case "confidence_medium":
      return "Confidence is usable, not clean.";
    case "confidence_low":
      return "Confidence is limited.";
    case "timing_window_open":
      return "Window is open.";
    case "timing_pullback":
      return "Price may improve.";
    case "timing_confirmation":
      return "Needs more confirmation.";
    case "timing_monitor_only":
      return "Monitor only.";
    case "timing_price_dead":
      return "Price is no longer attractive.";
    case "trap_flag_present":
      return "Trap risk is active.";
    case "trap_flag_multiple":
      return "Multiple trap signals are active.";
    case "stale_or_incomplete":
      return "Freshness or coverage is limited.";
    case "provider_limited":
      return "Provider health is degraded.";
  }
}

function buildExplanationFragments(reasons: DecisionReasonCode[]) {
  return reasons.map(getExplanationFragment).slice(0, 3);
}

function buildDedupeSignature(
  snapshot: OpportunitySnapshotView,
  recommendation: DecisionRecommendation,
  priority: DecisionPriorityTier,
  reasons: DecisionReasonCode[],
  alertBasis: DecisionAlertBasis
) {
  return JSON.stringify({
    opportunityId: snapshot.id,
    recommendation,
    priority,
    alertBasis,
    actionState: snapshot.actionState,
    timingState: snapshot.timingState,
    confidenceTier: snapshot.confidenceTier,
    staleFlag: snapshot.staleFlag,
    sourceHealthState: snapshot.sourceHealthState,
    trapFlags: getTrapFlags(snapshot),
    reasons: [...reasons].sort()
  });
}

export function buildDecisionFromOpportunitySnapshot(
  snapshot: OpportunitySnapshotView
): DecisionView {
  const reasons = buildDecisionReasons(snapshot);
  const recommendation = buildDecisionRecommendation(snapshot);
  const priority = buildDecisionPriority(snapshot, recommendation);
  const alert = buildDecisionAlertMeta(recommendation, snapshot);

  return {
    opportunityId: snapshot.id,
    recommendation,
    priority,
    reasons,
    explanationFragments: buildExplanationFragments(reasons),
    alert,
    dedupeSignature: buildDedupeSignature(snapshot, recommendation, priority, reasons, alert.basis),
    actionState: snapshot.actionState,
    timingState: snapshot.timingState,
    confidenceTier: snapshot.confidenceTier,
    trapFlags: [...snapshot.trapFlags],
    trapCount: snapshot.trapFlags.length,
    providerFreshnessMinutes: snapshot.providerFreshnessMinutes,
    staleFlag: snapshot.staleFlag,
    sourceHealthState: snapshot.sourceHealthState
  };
}

export function isDecisionView(value: unknown): value is DecisionView {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.opportunityId === "string" &&
    includesLiteral(DECISION_RECOMMENDATIONS, candidate.recommendation) &&
    includesLiteral(DECISION_PRIORITY_TIERS, candidate.priority) &&
    Array.isArray(candidate.reasons) &&
    candidate.reasons.every((reason) => includesLiteral(DECISION_REASON_CODES, reason)) &&
    Array.isArray(candidate.explanationFragments) &&
    candidate.explanationFragments.every((fragment) => typeof fragment === "string") &&
    typeof candidate.dedupeSignature === "string" &&
    includesLiteral(OPPORTUNITY_ACTION_STATES, candidate.actionState) &&
    includesLiteral(OPPORTUNITY_TIMING_STATES, candidate.timingState) &&
    includesLiteral(OPPORTUNITY_CONFIDENCE_TIERS, candidate.confidenceTier) &&
    Array.isArray(candidate.trapFlags) &&
    candidate.trapFlags.every((flag) => includesLiteral(OPPORTUNITY_TRAP_FLAGS, flag)) &&
    typeof candidate.trapCount === "number" &&
    (candidate.providerFreshnessMinutes === null || typeof candidate.providerFreshnessMinutes === "number") &&
    typeof candidate.staleFlag === "boolean" &&
    typeof candidate.sourceHealthState === "string" &&
    typeof candidate.alert === "object" &&
    candidate.alert !== null &&
    !Array.isArray(candidate.alert) &&
    typeof (candidate.alert as { eligible?: unknown }).eligible === "boolean" &&
    includesLiteral(DECISION_ALERT_BASES, (candidate.alert as { basis?: unknown }).basis)
  );
}
