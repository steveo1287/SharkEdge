import type { OpportunityView } from "@/lib/types/opportunity";
import { getMatchupDetail } from "@/services/matchups/matchup-service";
import {
  buildBetSignalOpportunity,
  buildPropOpportunity,
  rankOpportunities
} from "@/services/opportunities/opportunity-service";

type MatchupDetail = NonNullable<Awaited<ReturnType<typeof getMatchupDetail>>>;

export type GameHubPresentation = {
  forYou: OpportunityView[];
  headline: OpportunityView | null;
  postureLabel: string;
  contextNotes: string[];
};

function formatGameHubAction(actionState: OpportunityView["actionState"]) {
  if (actionState === "BET_NOW") {
    return "Bet now";
  }

  if (actionState === "WAIT") {
    return "Wait";
  }

  if (actionState === "WATCH") {
    return "Watch";
  }

  return "Pass";
}

function buildForYouOpportunities(detail: MatchupDetail) {
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
      eventId: detail.routeId
    }))
    .slice(0, 4);
}

export function buildGameHubPresentation(detail: MatchupDetail): GameHubPresentation {
  const forYou = buildForYouOpportunities(detail);
  const headline = forYou[0] ?? null;
  const postureLabel = headline
    ? formatGameHubAction(headline.actionState)
    : "No qualified edge";

  const contextNotes = [
    detail.supportNote,
    detail.propsSupport.note,
    ...(detail.providerHealth.warnings ?? []),
    ...(detail.notes ?? [])
  ].filter((note): note is string => Boolean(note));

  return {
    forYou,
    headline,
    postureLabel,
    contextNotes
  };
}