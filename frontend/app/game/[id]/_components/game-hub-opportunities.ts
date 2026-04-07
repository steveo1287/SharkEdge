import type { OpportunityView } from "@/lib/types/opportunity";
import { getMatchupDetail } from "@/services/matchups/matchup-service";
import {
  buildBetSignalOpportunity,
  buildPropOpportunity,
  rankOpportunities
} from "@/services/opportunities/opportunity-service";

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
    .map((opportunity) => ({
      ...opportunity,
      eventId: routeId
    }))
    .slice(0, 4);
}