import type {
  OpportunitySnapshotView,
  OpportunityView
} from "@/lib/types/opportunity";
import { buildOpportunityBookLeadershipSummary } from "@/services/opportunities/opportunity-book-leadership";
import { buildOpportunityCloseDestinationSummary } from "@/services/opportunities/opportunity-close-destination";
import { buildOpportunityExecutionCapacitySummary } from "@/services/opportunities/opportunity-execution-capacity";

export function buildOpportunitySnapshot(
  opportunity: OpportunityView | null | undefined
): OpportunitySnapshotView | null {
  if (!opportunity) {
    return null;
  }

  return {
    id: opportunity.id,
    opportunityScore: opportunity.opportunityScore,
    confidenceTier: opportunity.confidenceTier,
    actionState: opportunity.actionState,
    timingState: opportunity.timingState,
    trapFlags: [...opportunity.trapFlags],
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
    typeof candidate.actionState === "string" &&
    typeof candidate.confidenceTier === "string" &&
    Array.isArray(candidate.trapFlags)
  );
}
