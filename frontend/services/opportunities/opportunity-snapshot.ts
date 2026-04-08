import type {
  OpportunitySnapshotView,
  OpportunityView
} from "@/lib/types/opportunity";

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
    microstructureSummary: opportunity.marketMicrostructure.summary
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
