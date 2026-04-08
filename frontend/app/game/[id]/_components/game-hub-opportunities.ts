import type { OpportunityView } from "@/lib/types/opportunity";
import { getMatchupDetail } from "@/services/matchups/matchup-service";
import { recordSurfacedOpportunities } from "@/services/opportunities/opportunity-clv-service";
import { getOpportunityMarketPathResolver } from "@/services/opportunities/opportunity-market-path";
import { getOpportunityPortfolioAllocator } from "@/services/opportunities/opportunity-portfolio";
import { getOpportunityTruthCalibrationResolver } from "@/services/opportunities/opportunity-truth-calibration";
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

  if (
    opportunity.trapFlags.includes("LOW_PROVIDER_HEALTH") ||
    opportunity.trapFlags.includes("STALE_EDGE") ||
    opportunity.trapFlags.includes("ONE_BOOK_OUTLIER")
  ) {
    return false;
  }

  if (
    opportunity.actionState === "BET_NOW" &&
    opportunity.opportunityScore >= 78 &&
    opportunity.confidenceTier !== "D"
  ) {
    return true;
  }

  if (
    opportunity.actionState === "WAIT" &&
    opportunity.opportunityScore >= 82 &&
    opportunity.confidenceTier === "A"
  ) {
    return true;
  }

  if (
    opportunity.actionState === "WATCH" &&
    opportunity.opportunityScore >= 86 &&
    opportunity.confidenceTier === "A" &&
    !opportunity.trapFlags.includes("FAKE_MOVE_RISK")
  ) {
    return true;
  }

  return false;
}

export async function buildForYouOpportunities(
  routeId: string,
  detail: Awaited<ReturnType<typeof getMatchupDetail>>
) {
  if (!detail) {
    return [];
  }

  const [truthCalibrationResolver, marketPathResolver, portfolioAllocator] = await Promise.all([
    getOpportunityTruthCalibrationResolver({
      league: detail.league.key
    }),
    getOpportunityMarketPathResolver({
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
      marketPathResolver
    )
  );

  const propOpportunities = detail.props.slice(0, 8).map((prop) =>
    buildPropOpportunity(
      prop,
      detail.providerHealth,
      null,
      truthCalibrationResolver,
      marketPathResolver
    )
  );

  const allocatedOpportunities = portfolioAllocator.apply(
    [...signalOpportunities, ...propOpportunities].map((opportunity) => ({
      ...opportunity,
      eventId: routeId
    }))
  );

  const opportunities = rankOpportunities<OpportunityView>(allocatedOpportunities)
    .filter(shouldSurfaceOpportunity)
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
