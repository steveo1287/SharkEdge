import type { OpportunityView } from "@/lib/types/opportunity";
import { getMatchupDetail } from "@/services/matchups/matchup-service";
import { recordSurfacedOpportunities } from "@/services/opportunities/opportunity-clv-service";
import { getOpportunityBookLeadershipResolver } from "@/services/opportunities/opportunity-book-leadership";
import { getOpportunityCloseDestinationResolver } from "@/services/opportunities/opportunity-close-destination";
import { getOpportunityMarketPathResolver } from "@/services/opportunities/opportunity-market-path";
import { getOpportunityPortfolioAllocator } from "@/services/opportunities/opportunity-portfolio";
import { getOpportunityReasonCalibrationResolver } from "@/services/opportunities/opportunity-reason-calibration";
import { getOpportunityTimingReplayResolver } from "@/services/opportunities/opportunity-timing-review";
import { getOpportunityTruthCalibrationResolver } from "@/services/opportunities/opportunity-truth-calibration";
import {
  buildBetSignalOpportunity,
  buildPropOpportunity,
  rankOpportunities
} from "@/services/opportunities/opportunity-service";
import { applyOpportunitySurfacing } from "@/services/opportunities/opportunity-surfacing";

export async function buildForYouOpportunities(
  routeId: string,
  detail: Awaited<ReturnType<typeof getMatchupDetail>>
) {
  if (!detail) {
    return [];
  }

  const [
    truthCalibrationResolver,
    marketPathResolver,
    bookLeadershipResolver,
    closeDestinationResolver,
    reasonCalibrationResolver,
    timingReplayResolver,
    portfolioAllocator
  ] = await Promise.all([
    getOpportunityTruthCalibrationResolver({
      league: detail.league.key
    }),
    getOpportunityMarketPathResolver({
      league: detail.league.key
    }),
    getOpportunityBookLeadershipResolver({
      league: detail.league.key
    }),
    getOpportunityCloseDestinationResolver({
      league: detail.league.key
    }),
    getOpportunityReasonCalibrationResolver({
      league: detail.league.key
    }),
    getOpportunityTimingReplayResolver({
      league: detail.league.key
    }),
    getOpportunityPortfolioAllocator()
  ]);
  const signalOpportunities = detail.betSignals.map((signal) =>
    buildBetSignalOpportunity(
      signal,
      detail.league.key,
      detail.providerHealth,
      null,
      truthCalibrationResolver,
      marketPathResolver,
      bookLeadershipResolver,
      closeDestinationResolver,
      reasonCalibrationResolver,
      timingReplayResolver
    )
  );

  const propOpportunities = detail.props.slice(0, 8).map((prop) =>
    buildPropOpportunity(
      prop,
      detail.providerHealth,
      null,
      truthCalibrationResolver,
      marketPathResolver,
      bookLeadershipResolver,
      closeDestinationResolver,
      reasonCalibrationResolver,
      timingReplayResolver
    )
  );

  const allocatedOpportunities = portfolioAllocator.apply(
    [...signalOpportunities, ...propOpportunities].map((opportunity) => ({
      ...opportunity,
      eventId: routeId
    }))
  );

  const surfacedOpportunities = allocatedOpportunities.map((opportunity) =>
    applyOpportunitySurfacing(opportunity, "matchup_for_you")
  );
  const opportunities = rankOpportunities<OpportunityView>(surfacedOpportunities)
    .filter((opportunity) => opportunity.surfacing?.status === "SURFACED")
    .slice(0, 2);

  await recordSurfacedOpportunities(opportunities, "matchup_for_you", {
    primaryCount: 1,
    metadata: {
      routeId,
      source: "game_hub_for_you"
    }
  }).catch(() => []);

  return opportunities;
}
