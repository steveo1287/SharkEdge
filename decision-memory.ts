import type {
  ChangeDirection,
  ChangeIntelligenceView,
  ChangeReasonCode,
  ChangeSeverity,
  DecisionChangedField,
  DecisionStateRecord
} from "@/lib/types/change-intelligence";
import {
  CHANGE_DIRECTIONS,
  CHANGE_REASON_CODES,
  CHANGE_SEVERITIES,
  DECISION_CHANGED_FIELDS
} from "@/lib/types/change-intelligence";
import type { DecisionView } from "@/lib/types/decision";
import { isDecisionView } from "@/services/decision/decision-engine";

const RECOMMENDATION_WEIGHT = {
  surface: 3,
  hold: 2,
  monitor: 1,
  suppress: 0
} as const;

const PRIORITY_WEIGHT = {
  high: 2,
  medium: 1,
  low: 0
} as const;

const ACTION_WEIGHT = {
  BET_NOW: 3,
  WAIT: 2,
  WATCH: 1,
  PASS: 0
} as const;

const CONFIDENCE_WEIGHT = {
  A: 3,
  B: 2,
  C: 1,
  D: 0
} as const;

const PASSIVE_TIMING_STATES = new Set(["WAIT_FOR_PULLBACK", "WAIT_FOR_CONFIRMATION", "MONITOR_ONLY", "PASS_ON_PRICE"]);
const HEALTHY_SOURCE_STATE = "HEALTHY";

function includesLiteral<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function isDecisionStateRecord(value: unknown): value is DecisionStateRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.recordedAt === "string" &&
    (candidate.decision === null || isDecisionView(candidate.decision))
  );
}

function addField(fields: Set<DecisionChangedField>, field: DecisionChangedField) {
  fields.add(field);
}

function addReason(reasons: Set<ChangeReasonCode>, reason: ChangeReasonCode) {
  reasons.add(reason);
}

function getActionShiftReason(decision: DecisionView): ChangeReasonCode {
  switch (decision.actionState) {
    case "BET_NOW":
      return "action_shifted_to_bet_now";
    case "WAIT":
      return "action_shifted_to_wait";
    case "WATCH":
      return "action_shifted_to_watch";
    default:
      return "action_shifted_to_pass";
  }
}

function buildInitialChange(current: DecisionView | null, recordedAt: string): ChangeIntelligenceView {
  return {
    previousDecisionAvailable: false,
    currentDecisionAvailable: Boolean(current),
    changeSeverity: "none",
    changeDirection: "unchanged",
    changedFields: [],
    changeReasons: ["initial_state_recorded"],
    shortExplanation: current ? "Tracking current decision state." : "No decision state available yet.",
    alertWorthyChange: false,
    noiseSuppressed: true,
    stableChangeSignature: JSON.stringify({
      kind: "initial",
      currentSignature: current?.dedupeSignature ?? "no-decision"
    }),
    previousRecordedAt: null,
    currentRecordedAt: recordedAt
  };
}

function buildNoChange(previous: DecisionStateRecord, current: DecisionView | null, recordedAt: string): ChangeIntelligenceView {
  return {
    previousDecisionAvailable: Boolean(previous.decision),
    currentDecisionAvailable: Boolean(current),
    changeSeverity: "none",
    changeDirection: "unchanged",
    changedFields: [],
    changeReasons: ["semantic_state_unchanged"],
    shortExplanation: "No semantic change.",
    alertWorthyChange: false,
    noiseSuppressed: true,
    stableChangeSignature: JSON.stringify({
      kind: "unchanged",
      signature: current?.dedupeSignature ?? "no-decision"
    }),
    previousRecordedAt: previous.recordedAt,
    currentRecordedAt: recordedAt
  };
}

function buildDecisionPresenceChange(
  previous: DecisionView | null,
  current: DecisionView | null,
  previousRecordedAt: string | null,
  currentRecordedAt: string
): ChangeIntelligenceView {
  const reasons: ChangeReasonCode[] = current ? ["decision_appeared"] : ["decision_lost"];
  if (current?.alert.eligible) {
    reasons.push("alert_eligibility_gained");
  }
  if (previous?.alert.eligible && !current) {
    reasons.push("alert_eligibility_lost");
  }

  return {
    previousDecisionAvailable: Boolean(previous),
    currentDecisionAvailable: Boolean(current),
    changeSeverity: "major",
    changeDirection: current ? "upgraded" : "downgraded",
    changedFields: ["decision_presence", "alert_eligibility"],
    changeReasons: reasons,
    shortExplanation: current ? "Opportunity surfaced into the live queue." : "Opportunity dropped out of the live queue.",
    alertWorthyChange: true,
    noiseSuppressed: false,
    stableChangeSignature: JSON.stringify({
      kind: "decision-presence",
      previousSignature: previous?.dedupeSignature ?? "no-decision",
      currentSignature: current?.dedupeSignature ?? "no-decision"
    }),
    previousRecordedAt,
    currentRecordedAt
  };
}

function buildExplanation(reasons: ChangeReasonCode[], direction: ChangeDirection) {
  const primary = reasons[0];

  switch (primary) {
    case "decision_appeared":
      return "Opportunity surfaced into the queue.";
    case "decision_lost":
      return "Opportunity dropped out of the queue.";
    case "recommendation_upgraded":
      return "Recommendation improved.";
    case "recommendation_downgraded":
      return "Recommendation weakened.";
    case "priority_upgraded":
      return "Priority moved higher.";
    case "priority_downgraded":
      return "Priority moved lower.";
    case "action_shifted_to_bet_now":
      return "Action shifted to bet now.";
    case "action_shifted_to_wait":
      return "Action shifted to wait.";
    case "action_shifted_to_watch":
      return "Action shifted to watch.";
    case "action_shifted_to_pass":
      return "Action shifted to pass.";
    case "timing_became_live":
      return "Timing window opened.";
    case "timing_became_passive":
      return "Timing lost urgency.";
    case "confidence_improved":
      return "Confidence improved.";
    case "confidence_weakened":
      return "Confidence weakened.";
    case "trap_flag_added":
      return "Trap risk increased.";
    case "trap_flag_cleared":
      return "Trap risk eased.";
    case "alert_eligibility_gained":
      return "This setup became alert-worthy.";
    case "alert_eligibility_lost":
      return "This setup lost alert-worthy status.";
    case "stale_data_detected":
      return "Freshness degraded.";
    case "stale_data_cleared":
      return "Freshness recovered.";
    case "source_health_weakened":
      return "Source health weakened.";
    case "source_health_recovered":
      return "Source health recovered.";
    default:
      return direction === "upgraded"
        ? "Decision state improved."
        : direction === "downgraded"
          ? "Decision state weakened."
          : direction === "mixed"
            ? "Decision state changed in mixed ways."
            : "No semantic change.";
  }
}

function buildStableChangeSignature(
  previous: DecisionView,
  current: DecisionView,
  changeSeverity: ChangeSeverity,
  changeDirection: ChangeDirection,
  changedFields: DecisionChangedField[],
  changeReasons: ChangeReasonCode[]
) {
  return JSON.stringify({
    previousSignature: previous.dedupeSignature,
    currentSignature: current.dedupeSignature,
    changeSeverity,
    changeDirection,
    changedFields: [...changedFields].sort(),
    changeReasons: [...changeReasons].sort()
  });
}

function getDirectionScore(previous: DecisionView, current: DecisionView) {
  let upgraded = 0;
  let downgraded = 0;

  if (RECOMMENDATION_WEIGHT[current.recommendation] > RECOMMENDATION_WEIGHT[previous.recommendation]) {
    upgraded += 2;
  } else if (RECOMMENDATION_WEIGHT[current.recommendation] < RECOMMENDATION_WEIGHT[previous.recommendation]) {
    downgraded += 2;
  }

  if (PRIORITY_WEIGHT[current.priority] > PRIORITY_WEIGHT[previous.priority]) {
    upgraded += 1;
  } else if (PRIORITY_WEIGHT[current.priority] < PRIORITY_WEIGHT[previous.priority]) {
    downgraded += 1;
  }

  if (ACTION_WEIGHT[current.actionState] > ACTION_WEIGHT[previous.actionState]) {
    upgraded += 2;
  } else if (ACTION_WEIGHT[current.actionState] < ACTION_WEIGHT[previous.actionState]) {
    downgraded += 2;
  }

  if (CONFIDENCE_WEIGHT[current.confidenceTier] > CONFIDENCE_WEIGHT[previous.confidenceTier]) {
    upgraded += 1;
  } else if (CONFIDENCE_WEIGHT[current.confidenceTier] < CONFIDENCE_WEIGHT[previous.confidenceTier]) {
    downgraded += 1;
  }

  if (current.trapCount < previous.trapCount) {
    upgraded += 1;
  } else if (current.trapCount > previous.trapCount) {
    downgraded += 1;
  }

  if (current.alert.eligible && !previous.alert.eligible) {
    upgraded += 1;
  } else if (!current.alert.eligible && previous.alert.eligible) {
    downgraded += 1;
  }

  if (!current.staleFlag && previous.staleFlag) {
    upgraded += 1;
  } else if (current.staleFlag && !previous.staleFlag) {
    downgraded += 1;
  }

  return { upgraded, downgraded };
}

export function buildDecisionStateRecord(
  decision: DecisionView | null,
  recordedAt = new Date().toISOString()
): DecisionStateRecord {
  return {
    decision,
    recordedAt
  };
}

export function parseDecisionStateRecord(value: unknown): DecisionStateRecord | null {
  return isDecisionStateRecord(value) ? value : null;
}

export function buildChangeIntelligence(
  previousRecord: DecisionStateRecord | null,
  currentDecision: DecisionView | null,
  currentRecordedAt = new Date().toISOString()
): ChangeIntelligenceView {
  if (!previousRecord) {
    return buildInitialChange(currentDecision, currentRecordedAt);
  }

  if (!previousRecord.decision || !currentDecision) {
    if (
      previousRecord.decision?.dedupeSignature === currentDecision?.dedupeSignature ||
      (!previousRecord.decision && !currentDecision)
    ) {
      return buildNoChange(previousRecord, currentDecision, currentRecordedAt);
    }

    return buildDecisionPresenceChange(
      previousRecord.decision,
      currentDecision,
      previousRecord.recordedAt,
      currentRecordedAt
    );
  }

  if (previousRecord.decision.dedupeSignature === currentDecision.dedupeSignature) {
    return buildNoChange(previousRecord, currentDecision, currentRecordedAt);
  }

  const changedFields = new Set<DecisionChangedField>();
  const changeReasons = new Set<ChangeReasonCode>();

  if (previousRecord.decision.recommendation !== currentDecision.recommendation) {
    addField(changedFields, "recommendation");
    addReason(
      changeReasons,
      RECOMMENDATION_WEIGHT[currentDecision.recommendation] > RECOMMENDATION_WEIGHT[previousRecord.decision.recommendation]
        ? "recommendation_upgraded"
        : "recommendation_downgraded"
    );
  }

  if (previousRecord.decision.priority !== currentDecision.priority) {
    addField(changedFields, "priority");
    addReason(
      changeReasons,
      PRIORITY_WEIGHT[currentDecision.priority] > PRIORITY_WEIGHT[previousRecord.decision.priority]
        ? "priority_upgraded"
        : "priority_downgraded"
    );
  }

  if (previousRecord.decision.actionState !== currentDecision.actionState) {
    addField(changedFields, "action_state");
    addReason(changeReasons, getActionShiftReason(currentDecision));
  }

  if (previousRecord.decision.timingState !== currentDecision.timingState) {
    addField(changedFields, "timing_state");
    addReason(
      changeReasons,
      currentDecision.timingState === "WINDOW_OPEN"
        ? "timing_became_live"
        : PASSIVE_TIMING_STATES.has(currentDecision.timingState)
          ? "timing_became_passive"
          : "timing_became_passive"
    );
  }

  if (previousRecord.decision.confidenceTier !== currentDecision.confidenceTier) {
    addField(changedFields, "confidence_tier");
    addReason(
      changeReasons,
      CONFIDENCE_WEIGHT[currentDecision.confidenceTier] > CONFIDENCE_WEIGHT[previousRecord.decision.confidenceTier]
        ? "confidence_improved"
        : "confidence_weakened"
    );
  }

  const previousFlags = new Set(previousRecord.decision.trapFlags);
  const currentFlags = new Set(currentDecision.trapFlags);
  const addedFlags = currentDecision.trapFlags.filter((flag) => !previousFlags.has(flag));
  const removedFlags = previousRecord.decision.trapFlags.filter((flag) => !currentFlags.has(flag));
  if (addedFlags.length || removedFlags.length) {
    addField(changedFields, "trap_flags");
    if (addedFlags.length) {
      addReason(changeReasons, "trap_flag_added");
    }
    if (removedFlags.length) {
      addReason(changeReasons, "trap_flag_cleared");
    }
  }

  if (previousRecord.decision.alert.eligible !== currentDecision.alert.eligible) {
    addField(changedFields, "alert_eligibility");
    addReason(
      changeReasons,
      currentDecision.alert.eligible ? "alert_eligibility_gained" : "alert_eligibility_lost"
    );
  }

  const previousLimited = previousRecord.decision.staleFlag;
  const currentLimited = currentDecision.staleFlag;
  if (previousLimited !== currentLimited) {
    addField(changedFields, "staleness");
    addReason(changeReasons, currentLimited ? "stale_data_detected" : "stale_data_cleared");
  }

  const previousSourceLimited = previousRecord.decision.sourceHealthState !== HEALTHY_SOURCE_STATE;
  const currentSourceLimited = currentDecision.sourceHealthState !== HEALTHY_SOURCE_STATE;
  if (previousSourceLimited !== currentSourceLimited) {
    addField(changedFields, "source_health");
    addReason(
      changeReasons,
      currentSourceLimited ? "source_health_weakened" : "source_health_recovered"
    );
  }

  const directionScore = getDirectionScore(previousRecord.decision, currentDecision);
  const changeDirection: ChangeDirection =
    directionScore.upgraded > 0 && directionScore.downgraded === 0
      ? "upgraded"
      : directionScore.downgraded > 0 && directionScore.upgraded === 0
        ? "downgraded"
        : directionScore.upgraded > 0 || directionScore.downgraded > 0
          ? "mixed"
          : "unchanged";

  const fieldCount = changedFields.size;
  const majorReasons =
    changeReasons.has("decision_appeared") ||
    changeReasons.has("decision_lost") ||
    changeReasons.has("recommendation_upgraded") ||
    changeReasons.has("recommendation_downgraded") ||
    changeReasons.has("action_shifted_to_bet_now") ||
    changeReasons.has("action_shifted_to_pass") ||
    changeReasons.has("alert_eligibility_gained") ||
    changeReasons.has("alert_eligibility_lost");

  const changeSeverity: ChangeSeverity =
    fieldCount === 0
      ? "none"
      : majorReasons
        ? "major"
        : fieldCount >= 3 || changeReasons.has("trap_flag_added")
          ? "moderate"
          : "minor";

  const alertWorthyChange =
    changeSeverity === "major" ||
    changeReasons.has("trap_flag_added") ||
    changeReasons.has("alert_eligibility_gained") ||
    changeReasons.has("alert_eligibility_lost");

  const noiseSuppressed = fieldCount === 0 || !alertWorthyChange;
  const reasonsList = Array.from(changeReasons);

  return {
    previousDecisionAvailable: true,
    currentDecisionAvailable: true,
    changeSeverity,
    changeDirection,
    changedFields: Array.from(changedFields),
    changeReasons: reasonsList,
    shortExplanation: buildExplanation(reasonsList, changeDirection),
    alertWorthyChange,
    noiseSuppressed,
    stableChangeSignature: buildStableChangeSignature(
      previousRecord.decision,
      currentDecision,
      changeSeverity,
      changeDirection,
      Array.from(changedFields),
      reasonsList
    ),
    previousRecordedAt: previousRecord.recordedAt,
    currentRecordedAt
  };
}

export function shouldAlertForChange(change: ChangeIntelligenceView | null) {
  if (!change) {
    return false;
  }

  return change.alertWorthyChange && !change.noiseSuppressed;
}

export function isChangeIntelligenceView(value: unknown): value is ChangeIntelligenceView {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.previousDecisionAvailable === "boolean" &&
    typeof candidate.currentDecisionAvailable === "boolean" &&
    includesLiteral(CHANGE_SEVERITIES, candidate.changeSeverity) &&
    includesLiteral(CHANGE_DIRECTIONS, candidate.changeDirection) &&
    Array.isArray(candidate.changedFields) &&
    candidate.changedFields.every((field) => includesLiteral(DECISION_CHANGED_FIELDS, field)) &&
    Array.isArray(candidate.changeReasons) &&
    candidate.changeReasons.every((reason) => includesLiteral(CHANGE_REASON_CODES, reason)) &&
    typeof candidate.shortExplanation === "string" &&
    typeof candidate.alertWorthyChange === "boolean" &&
    typeof candidate.noiseSuppressed === "boolean" &&
    typeof candidate.stableChangeSignature === "string" &&
    (candidate.previousRecordedAt === null || typeof candidate.previousRecordedAt === "string") &&
    typeof candidate.currentRecordedAt === "string"
  );
}
