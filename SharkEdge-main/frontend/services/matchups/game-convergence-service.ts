import type { OpportunityView } from "@/lib/types/opportunity";
import { getMatchupDetail } from "@/services/matchups/matchup-service";
import type { GameHubPresentation } from "@/services/matchups/game-hub-presenter";
import type { EventSimulationView } from "@/services/simulation/simulation-view-service";

type MatchupDetail = NonNullable<Awaited<ReturnType<typeof getMatchupDetail>>>;

type ConvergenceState = "ALIGNED" | "PARTIAL" | "CONFLICTED" | "NO_SIM";

type ConvergenceJump = {
  href: string;
  label: string;
  emphasis?: boolean;
};

type ConvergenceCallout = {
  title: string;
  value: string;
  note: string;
  href: string;
};

export type GameConvergenceView = {
  state: ConvergenceState;
  stackScore: number;
  summary: string;
  quickJumps: ConvergenceJump[];
  notes: string[];
  primary: OpportunityView | null;
  trendSummary: {
    summary: string;
    reliabilityLabel: string;
    topAngle: string | null;
  };
  simulationSummary: {
    headline: string;
    detail: string;
    strengthLabel: string;
  } | null;
  marketCallout: ConvergenceCallout | null;
  propCallout: ConvergenceCallout | null;
  simulationCallout: ConvergenceCallout | null;
};

function round(value: number, digits = 0) {
  return Number(value.toFixed(digits));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getPrimaryCompositeScore(opportunity: OpportunityView | null) {
  if (!opportunity) {
    return 0;
  }

  return opportunity.ranking?.compositeScore ?? opportunity.opportunityScore ?? 0;
}

function getTrendReliability(opportunity: OpportunityView | null) {
  return opportunity?.trendIntelligence?.reliabilityScore ?? 0;
}

function getTopMarketOpportunity(presentation: GameHubPresentation) {
  const marketCandidates = [
    presentation.marketSupport.moneyline,
    presentation.marketSupport.spread,
    presentation.marketSupport.total,
    ...presentation.forYou
  ].filter(
    (value): value is OpportunityView =>
      value !== null && value.kind !== "prop"
  );

  const unique = new Map<string, OpportunityView>();
  for (const opportunity of marketCandidates) {
    unique.set(opportunity.id, opportunity);
  }

  return [...unique.values()].sort(
    (left, right) => getPrimaryCompositeScore(right) - getPrimaryCompositeScore(left)
  )[0] ?? null;
}

function getTopPropOpportunity(presentation: GameHubPresentation) {
  return presentation.forYou.find((opportunity) => opportunity.kind === "prop") ?? null;
}

function getHeadlineParticipant(detail: MatchupDetail, role: "HOME" | "AWAY") {
  return detail.participants.find((participant) => participant.role === role) ?? null;
}

function pickSimulationSide(simulation: EventSimulationView | null, detail: MatchupDetail) {
  if (!simulation?.eventBetComparisons.length) {
    return null;
  }

  const home = getHeadlineParticipant(detail, "HOME");
  const away = getHeadlineParticipant(detail, "AWAY");

  const comparison = [...simulation.eventBetComparisons].sort(
    (left, right) => Math.abs(right.delta) - Math.abs(left.delta)
  )[0];

  if (!comparison) {
    return null;
  }

  if (comparison.marketType === "total") {
    const side = comparison.delta >= 0 ? "OVER" : "UNDER";
    return {
      marketType: "total" as const,
      side,
      strength: Math.abs(comparison.delta),
      headline: `Sim leans ${side} ${comparison.marketLine}`,
      detail: `Projection ${round(comparison.projected, 1)} versus market ${round(comparison.marketLine, 1)}.`
    };
  }

  const side = comparison.delta >= 0 ? "HOME" : "AWAY";
  const teamLabel = side === "HOME"
    ? home?.abbreviation ?? home?.name ?? "Home"
    : away?.abbreviation ?? away?.name ?? "Away";

  return {
    marketType: "spread" as const,
    side,
    strength: Math.abs(comparison.delta),
    headline: `Sim leans ${teamLabel} spread`,
    detail: `Projection ${round(comparison.projected, 1)} versus market ${round(comparison.marketLine, 1)}.`
  };
}

function inferOpportunityLean(opportunity: OpportunityView | null, detail: MatchupDetail) {
  if (!opportunity) {
    return null;
  }

  const selection = opportunity.selectionLabel.toUpperCase();
  const home = getHeadlineParticipant(detail, "HOME");
  const away = getHeadlineParticipant(detail, "AWAY");
  const homeTokens = [home?.name, home?.abbreviation].filter(
    (value): value is string => Boolean(value)
  ).map((value) => value.toUpperCase());
  const awayTokens = [away?.name, away?.abbreviation].filter(
    (value): value is string => Boolean(value)
  ).map((value) => value.toUpperCase());

  if (opportunity.marketType === "total" || opportunity.marketType.startsWith("player_")) {
    if (selection.includes("OVER")) {
      return "OVER";
    }

    if (selection.includes("UNDER")) {
      return "UNDER";
    }
  }

  if (opportunity.marketType === "spread" || opportunity.marketType === "moneyline") {
    if (homeTokens.some((token) => selection.includes(token))) {
      return "HOME";
    }

    if (awayTokens.some((token) => selection.includes(token))) {
      return "AWAY";
    }
  }

  return null;
}

function resolveConvergenceState(args: {
  primary: OpportunityView | null;
  simulation: EventSimulationView | null;
  detail: MatchupDetail;
}) {
  const simSide = pickSimulationSide(args.simulation, args.detail);
  if (!simSide) {
    return {
      state: "NO_SIM" as const,
      simulationSide: null
    };
  }

  const primaryLean = inferOpportunityLean(args.primary, args.detail);
  if (!args.primary || !primaryLean) {
    return {
      state: "PARTIAL" as const,
      simulationSide: simSide
    };
  }

  if (args.primary.marketType === "total" && simSide.marketType === "total") {
    return {
      state: primaryLean === simSide.side ? "ALIGNED" as const : "CONFLICTED" as const,
      simulationSide: simSide
    };
  }

  if (
    (args.primary.marketType === "spread" || args.primary.marketType === "moneyline") &&
    simSide.marketType === "spread"
  ) {
    return {
      state: primaryLean === simSide.side ? "ALIGNED" as const : "CONFLICTED" as const,
      simulationSide: simSide
    };
  }

  return {
    state: "PARTIAL" as const,
    simulationSide: simSide
  };
}

function getSimulationStrengthLabel(simulation: EventSimulationView | null) {
  const simSide = simulation
    ? [...simulation.eventBetComparisons].sort(
        (left, right) => Math.abs(right.delta) - Math.abs(left.delta)
      )[0] ?? null
    : null;

  const strength = simSide ? Math.abs(simSide.delta) : 0;

  if (strength >= 3) {
    return "Strong";
  }

  if (strength >= 1.5) {
    return "Usable";
  }

  if (strength > 0) {
    return "Thin";
  }

  return "Unavailable";
}

export function buildGameConvergenceView(args: {
  detail: MatchupDetail;
  presentation: GameHubPresentation;
  simulation: EventSimulationView | null;
}): GameConvergenceView {
  const primary = args.presentation.headline;
  const marketCalloutOpportunity = getTopMarketOpportunity(args.presentation);
  const propCalloutOpportunity = getTopPropOpportunity(args.presentation);
  const { state, simulationSide } = resolveConvergenceState({
    primary,
    simulation: args.simulation,
    detail: args.detail
  });

  const simulationStrength = simulationSide?.strength ?? 0;
  const trendReliability = getTrendReliability(primary);
  const primaryScore = getPrimaryCompositeScore(primary);
  const stackScore = clamp(
    round(primaryScore * 0.52 + trendReliability * 0.24 + Math.min(100, simulationStrength * 18) * 0.24),
    0,
    100
  );

  const quickJumps: ConvergenceJump[] = [
    { href: "#decision", label: "Decision", emphasis: true },
    { href: "#markets", label: "Markets" },
    args.simulation ? { href: "#simulation", label: "Sim" } : null,
    { href: "#props", label: `Props ${args.detail.props.length}` }
  ].filter((value): value is ConvergenceJump => value !== null);

  const trendSummary = {
    summary:
      primary?.trendIntelligence?.summary ??
      "Trend stack has not been joined deeply enough to add conviction yet.",
    reliabilityLabel: primary?.trendIntelligence
      ? `${primary.trendIntelligence.reliabilityScore} reliability`
      : "No trend grade",
    topAngle: primary?.trendIntelligence?.topAngle ?? null
  };

  const simulationSummary = simulationSide
    ? {
        headline: simulationSide.headline,
        detail: simulationSide.detail,
        strengthLabel: `${getSimulationStrengthLabel(args.simulation)} sim edge`
      }
    : null;

  const summary =
    state === "ALIGNED"
      ? "Primary angle, trend context, and simulation are pointing through the same window. This is the cleanest version of the matchup case."
      : state === "CONFLICTED"
        ? "The desk is split. Price may still be playable, but the sim is leaning against the current lead angle and should slow execution."
        : state === "NO_SIM"
          ? "The opportunity stack is being driven by price and trend context because the sim layer is not available on this matchup."
          : "Parts of the stack are useful, but they are not all saying the same thing yet. Treat this as a monitored setup, not a full green light.";

  const notes = [
    primary?.reasonSummary ?? null,
    trendSummary.topAngle,
    args.simulation?.projectionSummary?.leanSummary ?? null,
    propCalloutOpportunity?.reasonSummary ?? null
  ].filter((value): value is string => Boolean(value)).slice(0, 4);

  return {
    state,
    stackScore,
    summary,
    quickJumps,
    notes,
    primary,
    trendSummary,
    simulationSummary,
    marketCallout: marketCalloutOpportunity
      ? {
          title: "Best market",
          value: marketCalloutOpportunity.selectionLabel,
          note: `${marketCalloutOpportunity.sportsbookName ?? "Best book"} · ${getPrimaryCompositeScore(marketCalloutOpportunity)} composite`,
          href: "#markets"
        }
      : null,
    propCallout: propCalloutOpportunity
      ? {
          title: "Best attached prop",
          value: propCalloutOpportunity.selectionLabel,
          note: `${propCalloutOpportunity.sportsbookName ?? "Best book"} · ${getPrimaryCompositeScore(propCalloutOpportunity)} composite`,
          href: `#prop-${propCalloutOpportunity.id}`
        }
      : null,
    simulationCallout: simulationSummary
      ? {
          title: "Best sim angle",
          value: simulationSummary.headline,
          note: `${simulationSummary.strengthLabel} · ${simulationSummary.detail}`,
          href: "#simulation"
        }
      : null
  };
}
