export const ATTENTION_TIERS = [
  "critical",
  "high",
  "medium",
  "low",
  "hidden"
] as const;

export const ATTENTION_DIRECTIONS = [
  "rising",
  "falling",
  "stable",
  "mixed"
] as const;

export const ATTENTION_REASON_CODES = [
  "recommendation_high_priority",
  "recommendation_monitor",
  "recommendation_hold",
  "meaningful_upgrade",
  "meaningful_downgrade",
  "alert_eligible_change",
  "strong_confidence_with_fresh_change",
  "stale_but_watchworthy",
  "trap_limited_visibility",
  "low_signal_hidden",
  "unchanged_low_priority",
  "unchanged_actionable",
  "freshness_aging",
  "freshness_stale"
] as const;

export const ATTENTION_FRESHNESS_BUCKETS = [
  "fresh",
  "aging",
  "stale",
  "unknown"
] as const;

export type AttentionTier = (typeof ATTENTION_TIERS)[number];
export type AttentionDirection = (typeof ATTENTION_DIRECTIONS)[number];
export type AttentionReasonCode = (typeof ATTENTION_REASON_CODES)[number];
export type AttentionFreshnessBucket = (typeof ATTENTION_FRESHNESS_BUCKETS)[number];

export type PrioritizationView = {
  attentionTier: AttentionTier;
  attentionDirection: AttentionDirection;
  surfaced: boolean;
  surfacedReasonCodes: AttentionReasonCode[];
  shortAttentionLabel: string;
  shortAttentionExplanation: string | null;
  stableAttentionSignature: string;
  sortWeight: number;
  freshnessBucket: AttentionFreshnessBucket;
};
