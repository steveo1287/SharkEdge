import type { DecisionView } from "@/lib/types/decision";

export const CHANGE_SEVERITIES = ["major", "moderate", "minor", "none"] as const;
export const CHANGE_DIRECTIONS = ["upgraded", "downgraded", "mixed", "unchanged"] as const;
export const DECISION_CHANGED_FIELDS = [
  "decision_presence",
  "recommendation",
  "priority",
  "action_state",
  "timing_state",
  "confidence_tier",
  "trap_flags",
  "alert_eligibility",
  "staleness",
  "source_health"
] as const;
export const CHANGE_REASON_CODES = [
  "initial_state_recorded",
  "semantic_state_unchanged",
  "decision_appeared",
  "decision_lost",
  "recommendation_upgraded",
  "recommendation_downgraded",
  "priority_upgraded",
  "priority_downgraded",
  "action_shifted_to_bet_now",
  "action_shifted_to_wait",
  "action_shifted_to_watch",
  "action_shifted_to_pass",
  "timing_became_live",
  "timing_became_passive",
  "confidence_improved",
  "confidence_weakened",
  "trap_flag_added",
  "trap_flag_cleared",
  "alert_eligibility_gained",
  "alert_eligibility_lost",
  "stale_data_detected",
  "stale_data_cleared",
  "source_health_weakened",
  "source_health_recovered"
] as const;

export type ChangeSeverity = (typeof CHANGE_SEVERITIES)[number];
export type ChangeDirection = (typeof CHANGE_DIRECTIONS)[number];
export type DecisionChangedField = (typeof DECISION_CHANGED_FIELDS)[number];
export type ChangeReasonCode = (typeof CHANGE_REASON_CODES)[number];

export type DecisionStateRecord = {
  decision: DecisionView | null;
  recordedAt: string;
};

export type ChangeIntelligenceView = {
  previousDecisionAvailable: boolean;
  currentDecisionAvailable: boolean;
  changeSeverity: ChangeSeverity;
  changeDirection: ChangeDirection;
  changedFields: DecisionChangedField[];
  changeReasons: ChangeReasonCode[];
  shortExplanation: string;
  alertWorthyChange: boolean;
  noiseSuppressed: boolean;
  stableChangeSignature: string;
  previousRecordedAt: string | null;
  currentRecordedAt: string;
};
