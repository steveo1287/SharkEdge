import type {
  OpportunityActionState,
  OpportunityConfidenceTier,
  OpportunitySnapshotView,
  OpportunityTimingState,
  OpportunityTrapFlag
} from "@/lib/types/opportunity";

export const DECISION_RECOMMENDATIONS = ["surface", "monitor", "hold", "suppress"] as const;
export const DECISION_PRIORITY_TIERS = ["high", "medium", "low"] as const;
export const DECISION_REASON_CODES = [
  "action_bet_now",
  "action_wait",
  "action_watch",
  "action_pass",
  "confidence_high",
  "confidence_medium",
  "confidence_low",
  "timing_window_open",
  "timing_pullback",
  "timing_confirmation",
  "timing_monitor_only",
  "timing_price_dead",
  "trap_flag_present",
  "trap_flag_multiple",
  "stale_or_incomplete",
  "provider_limited"
] as const;
export const DECISION_ALERT_BASES = [
  "surface_actionable",
  "monitor_window",
  "hold_for_entry",
  "suppressed_risk",
  "suppressed_passive"
] as const;

export type DecisionRecommendation = (typeof DECISION_RECOMMENDATIONS)[number];
export type DecisionPriorityTier = (typeof DECISION_PRIORITY_TIERS)[number];
export type DecisionReasonCode = (typeof DECISION_REASON_CODES)[number];
export type DecisionAlertBasis = (typeof DECISION_ALERT_BASES)[number];

export type DecisionView = {
  opportunityId: string;
  recommendation: DecisionRecommendation;
  priority: DecisionPriorityTier;
  reasons: DecisionReasonCode[];
  explanationFragments: string[];
  alert: {
    eligible: boolean;
    basis: DecisionAlertBasis;
  };
  dedupeSignature: string;
  actionState: OpportunityActionState;
  timingState: OpportunityTimingState;
  confidenceTier: OpportunityConfidenceTier;
  trapFlags: OpportunityTrapFlag[];
  trapCount: number;
  providerFreshnessMinutes: number | null;
  staleFlag: boolean;
  sourceHealthState: OpportunitySnapshotView["sourceHealthState"];
};
