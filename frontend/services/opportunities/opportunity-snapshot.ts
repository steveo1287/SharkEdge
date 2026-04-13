import type {
  OpportunityActionState,
  OpportunityConfidenceTier,
  OpportunitySnapshotView,
  OpportunityTimingState,
  OpportunityTrapFlag,
  OpportunityView
} from "@/lib/types/opportunity";
import { buildOpportunityBookLeadershipSummary } from "@/services/opportunities/opportunity-book-leadership";
import { buildOpportunityCloseDestinationSummary } from "@/services/opportunities/opportunity-close-destination";
import { buildOpportunityExecutionCapacitySummary } from "@/services/opportunities/opportunity-execution-capacity";

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

function includesLiteral<T extends string>(values: readonly T[], value: string): value is T {
  return values.some((entry) => entry === value);
}

function isOpportunityActionState(value: unknown): value is OpportunityActionState {
  return typeof value === "string" && includesLiteral(OPPORTUNITY_ACTION_STATES, value);
}

function isOpportunityTimingState(value: unknown): value is OpportunityTimingState {
  return typeof value === "string" && includesLiteral(OPPORTUNITY_TIMING_STATES, value);
}

function isOpportunityConfidenceTier(value: unknown): value is OpportunityConfidenceTier {
  return typeof value === "string" && includesLiteral(OPPORTUNITY_CONFIDENCE_TIERS, value);
}

function isOpportunityTrapFlag(value: unknown): value is OpportunityTrapFlag {
  return typeof value === "string" && includesLiteral(OPPORTUNITY_TRAP_FLAGS, value);
}

function toOpportunityConfidenceTier(value: unknown): OpportunityConfidenceTier {
  return isOpportunityConfidenceTier(value) ? value : "D";
}

function toOpportunityActionState(value: unknown): OpportunityActionState {
  return isOpportunityActionState(value) ? value : "WATCH";
}

function toOpportunityTimingState(value: unknown): OpportunityTimingState {
  return isOpportunityTimingState(value) ? value : "MONITOR_ONLY";
}

function toOpportunityTrapFlags(value: unknown): OpportunityTrapFlag[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isOpportunityTrapFlag);
}

export function buildOpportunitySnapshot(
  opportunity: OpportunityView | null | undefined
): OpportunitySnapshotView | null {
  if (!opportunity) {
    return null;
  }

  return {
    id: opportunity.id,
    opportunityScore: opportunity.opportunityScore,
    confidenceTier: toOpportunityConfidenceTier(opportunity.confidenceTier),
    actionState: toOpportunityActionState(opportunity.actionState),
    timingState: toOpportunityTimingState(opportunity.timingState),
    trapFlags: toOpportunityTrapFlags(opportunity.trapFlags),
    reasonSummary: opportunity.reasonSummary,
    triggerSummary: opportunity.whyItShows[0] ?? null,
    killSummary: opportunity.whatCouldKillIt[0] ?? null,
    providerFreshnessMinutes: opportunity.providerFreshnessMinutes,
    staleFlag: opportunity.staleFlag,
    sportsbookName: opportunity.sportsbookName,
    sourceHealthState: opportunity.sourceHealth.state,
    calibrationStatus: opportunity.truthCalibration.status,
    calibrationSummary: opportunity.truthCalibration.summary,
    reasonCalibrationSummary: opportunity.reasonCalibration.summary,
    microstructureSummary: opportunity.marketMicrostructure.summary,
    bookLeadershipSummary: buildOpportunityBookLeadershipSummary(opportunity.bookLeadership),
    destinationSummary: buildOpportunityCloseDestinationSummary(opportunity.closeDestination),
    capacitySummary: buildOpportunityExecutionCapacitySummary(opportunity.executionCapacity),
    timingReplaySummary: opportunity.timingReplay.summary,
    rankingSummary: opportunity.ranking?.notes[0] ?? null,
    surfacingSummary: opportunity.surfacing?.surfacedBecause ?? null
  };
}

export function isOpportunitySnapshot(value: unknown): value is OpportunitySnapshotView {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.opportunityScore === "number" &&
    isOpportunityActionState(candidate.actionState) &&
    isOpportunityTimingState(candidate.timingState) &&
    isOpportunityConfidenceTier(candidate.confidenceTier) &&
    Array.isArray(candidate.trapFlags) &&
    candidate.trapFlags.every(isOpportunityTrapFlag)
  );
}
