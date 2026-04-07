import { formatAmericanOdds } from "@/lib/formatters/odds";
import type { OpportunityView } from "@/lib/types/opportunity";
import { getMatchupDetail } from "@/services/matchups/matchup-service";
import {
  buildBetSignalOpportunity,
  buildPropOpportunity,
  rankOpportunities
} from "@/services/opportunities/opportunity-service";

type MatchupDetail = NonNullable<Awaited<ReturnType<typeof getMatchupDetail>>>;

export type MatchupDecisionTargetView =
  | {
      kind: "market";
      href: string;
      label: string;
      marketType: "spread" | "moneyline" | "total";
      sportsbookName: string | null;
    }
  | {
      kind: "prop";
      href: string;
      label: string;
      propId: string;
    };

export type MatchupDecisionModuleView = {
  headline: OpportunityView | null;
  marketPriceLabel: string;
  fairPriceLabel: string;
  edgeGapLabel: string;
  timingLabel: string;
  confidenceLabel: string;
  freshnessLabel: string;
  changeSummary: string;
  executionNote: string;
  whyNow: string[];
  killSwitches: string[];
  focusTarget: MatchupDecisionTargetView | null;
};

export type GameHubPresentation = {
  forYou: OpportunityView[];
  headline: OpportunityView | null;
  postureLabel: string;
  contextNotes: string[];
  decisionModule: MatchupDecisionModuleView;
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

function formatTimingLabel(timingState: OpportunityView["timingState"]) {
  if (timingState === "WINDOW_OPEN") {
    return "Window open";
  }

  if (timingState === "WAIT_FOR_PULLBACK") {
    return "Wait for pullback";
  }

  if (timingState === "WAIT_FOR_CONFIRMATION") {
    return "Wait for confirmation";
  }

  if (timingState === "MONITOR_ONLY") {
    return "Monitor only";
  }

  return "Pass on price";
}

function formatDeltaLabel(value: number | null) {
  if (typeof value !== "number") {
    return "N/A";
  }

  return `${value > 0 ? "+" : ""}${value}`;
}

function formatMovementLabel(value: number | null) {
  if (typeof value !== "number") {
    return "No tracked move";
  }

  const digits = Math.abs(value) >= 10 ? 0 : 1;
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
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

function getMarketTargetType(
  marketType: string
): "spread" | "moneyline" | "total" | null {
  if (marketType === "spread") {
    return "spread";
  }

  if (marketType === "moneyline") {
    return "moneyline";
  }

  if (marketType === "total") {
    return "total";
  }

  return null;
}

function buildDecisionTarget(
  headline: OpportunityView | null
): MatchupDecisionTargetView | null {
  if (!headline) {
    return null;
  }

  if (headline.kind === "prop") {
    return {
      kind: "prop",
      href: `#prop-${headline.id}`,
      label: "Jump to target prop",
      propId: headline.id
    };
  }

  const marketType = getMarketTargetType(headline.marketType);

  if (!marketType) {
    return {
      kind: "market",
      href: "#markets",
      label: "Jump to target market",
      marketType: "spread",
      sportsbookName: headline.sportsbookName ?? null
    };
  }

  return {
    kind: "market",
    href: "#market-target",
    label: headline.sportsbookName
      ? `Jump to ${headline.sportsbookName} entry`
      : "Jump to target market",
    marketType,
    sportsbookName: headline.sportsbookName ?? null
  };
}

function buildDecisionModule(headline: OpportunityView | null): MatchupDecisionModuleView {
  if (!headline) {
    return {
      headline: null,
      marketPriceLabel: "N/A",
      fairPriceLabel: "N/A",
      edgeGapLabel: "N/A",
      timingLabel: "No qualified edge",
      confidenceLabel: "Unrated",
      freshnessLabel: "Unknown freshness",
      changeSummary: "No market or prop angle has cleared the current threshold on this matchup.",
      executionNote: "Pass for now and wait for a cleaner signal.",
      whyNow: [],
      killSwitches: [],
      focusTarget: null
    };
  }

  const marketPriceLabel =
    typeof headline.displayOddsAmerican === "number"
      ? formatAmericanOdds(headline.displayOddsAmerican)
      : "N/A";

  const fairPriceLabel =
    typeof headline.fairPriceAmerican === "number"
      ? formatAmericanOdds(headline.fairPriceAmerican)
      : "N/A";

  const freshnessLabel =
    typeof headline.providerFreshnessMinutes === "number"
      ? `${headline.providerFreshnessMinutes}m old`
      : headline.sourceHealth.state.replace(/_/g, " ").toLowerCase();

  const changeSummary =
    typeof headline.lineMovement === "number" && Math.abs(headline.lineMovement) > 0
      ? `Market has moved ${formatMovementLabel(
          headline.lineMovement
        )} since the opening snapshot.`
      : headline.staleFlag
        ? "Current view is stale. Confirm the number before entry."
        : typeof headline.providerFreshnessMinutes === "number" &&
            headline.providerFreshnessMinutes > 15
          ? `Market feed is aging at ${headline.providerFreshnessMinutes}m old. Confirm before entry.`
          : "No major movement pressure is distorting the current number right now.";

  const executionNote =
    headline.actionState === "BET_NOW"
      ? `Current price${headline.sportsbookName ? ` at ${headline.sportsbookName}` : ""} is inside the acceptable entry window.`
      : headline.actionState === "WAIT"
        ? "Angle is alive, but the price or timing still wants patience."
        : headline.actionState === "WATCH"
          ? "Keep this on the desk until movement or confirmation improves the entry."
          : "Current number does not justify exposure.";

  return {
    headline,
    marketPriceLabel,
    fairPriceLabel,
    edgeGapLabel: formatDeltaLabel(headline.marketDeltaAmerican),
    timingLabel: formatTimingLabel(headline.timingState),
    confidenceLabel: `${headline.confidenceTier} confidence`,
    freshnessLabel,
    changeSummary,
    executionNote,
    whyNow: headline.whyItShows.slice(0, 3),
    killSwitches: headline.whatCouldKillIt.slice(0, 3),
    focusTarget: buildDecisionTarget(headline)
  };
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
    contextNotes,
    decisionModule: buildDecisionModule(headline)
  };
}