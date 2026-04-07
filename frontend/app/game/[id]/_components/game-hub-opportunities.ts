import type { OpportunityView } from "@/lib/types/opportunity";
import { getMatchupDetail } from "@/services/matchups/matchup-service";
import {
  buildBetSignalOpportunity,
  buildPropOpportunity,
  rankOpportunities
} from "@/services/opportunities/opportunity-service";

function shouldSurfaceOpportunity(opportunity: OpportunityView) {
  if (opportunity.actionState === "PASS") {
    return false;
  }

  if (opportunity.staleFlag) {
    return false;
  }

  if (opportunity.sourceHealth.state === "OFFLINE") {
    return false;
  }

  if (opportunity.trapFlags.includes("LOW_PROVIDER_HEALTH")) {
    return false;
  }

  if (opportunity.trapFlags.includes("STALE_EDGE")) {
    return false;
  }

  if (opportunity.opportunityScore >= 75) {
    return true;
  }

  if (
    opportunity.opportunityScore >= 68 &&
    opportunity.actionState === "BET_NOW" &&
    opportunity.confidenceTier !== "D"
  ) {
    return true;
  }

  return false;
}

export function buildForYouOpportunities(
  routeId: string,
  detail: Awaited<ReturnType<typeof getMatchupDetail>>
) {
  if (!detail) {
    return [];
  }

  const signalOpportunities = detail.betSignals.map((signal) =>
    buildBetSignalOpportunity(signal, detail.league.key, detail.providerHealth)
  );

  const propOpportunities = detail.props.slice(0, 6).map((prop) =>
    buildPropOpportunity(prop, detail.providerHealth)
  );

  return rankOpportunities<OpportunityView>([
    ...signalOpportunities,
    ...propOpportunities
  ])
    .filter(shouldSurfaceOpportunity)
    .map((opportunity) => ({
      ...opportunity,
      eventId: routeId
    }))
    .slice(0, 2);
}