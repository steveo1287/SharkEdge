import type {
  OpportunitySurfacingView,
  OpportunityTrapFlag,
  OpportunityView
} from "@/lib/types/opportunity";

export type OpportunitySurfacingContext = "home_command" | "matchup_for_you";

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function formatTrap(flag: OpportunityTrapFlag) {
  switch (flag) {
    case "STALE_EDGE":
      return "number looks stale without enough trusted path support";
    case "LOW_PROVIDER_HEALTH":
      return "provider health is weak";
    case "THIN_MARKET":
      return "market depth is thin";
    case "ONE_BOOK_OUTLIER":
      return "edge still looks too one-book";
    case "FAKE_MOVE_RISK":
      return "move structure is not convincing enough";
    case "LOW_CONFIDENCE_FAIR_PRICE":
      return "fair price confidence is weak";
    case "HIGH_MARKET_DISAGREEMENT":
      return "board disagreement is still elevated";
    case "MODEL_MARKET_CONFLICT":
      return "model and market still conflict";
    case "INJURY_UNCERTAINTY":
      return "injury uncertainty can reprice the market";
  }
}

function isTrustedStaleCopy(opportunity: OpportunityView) {
  return (
    opportunity.marketMicrostructure.status === "APPLIED" &&
    opportunity.marketMicrostructure.regime === "STALE_COPY" &&
    opportunity.marketMicrostructure.pathTrusted &&
    opportunity.marketMicrostructure.staleCopyConfidence >= 64
  );
}

function isHardSuppression(opportunity: OpportunityView) {
  if (opportunity.actionState === "PASS") {
    return "price is not actionable";
  }

  if (opportunity.sourceHealth.state === "OFFLINE") {
    return "provider state is unusable";
  }

  if (
    opportunity.staleFlag &&
    !isTrustedStaleCopy(opportunity)
  ) {
    return "stale number is not trusted enough to keep on screen";
  }

  if (
    opportunity.trapFlags.includes("STALE_EDGE") &&
    !isTrustedStaleCopy(opportunity)
  ) {
    return "stale-edge trap overrides the edge";
  }

  if (
    opportunity.trapFlags.includes("LOW_PROVIDER_HEALTH") &&
    opportunity.sourceHealth.state !== "HEALTHY"
  ) {
    return "provider health is too weak to trust the screen";
  }

  if (
    opportunity.trapFlags.includes("ONE_BOOK_OUTLIER") &&
    opportunity.marketMicrostructure.status !== "APPLIED"
  ) {
    return "one-book outlier has no trusted market-path confirmation";
  }

  if (
    opportunity.marketMicrostructure.status === "SKIPPED_WEAK_PATH" &&
    opportunity.trapFlags.includes("FAKE_MOVE_RISK") &&
    opportunity.bookCount <= 2
  ) {
    return "market path is too weak to separate stale copy from junk";
  }

  if (
    (opportunity.expectedValuePct ?? 0) <= 0 ||
    (opportunity.opportunityScore < 58 && (opportunity.sizing.capitalPriorityScore ?? 0) < 52)
  ) {
    return "edge quality is too weak after risk controls";
  }

  return null;
}

export function buildOpportunitySurfacing(
  opportunity: OpportunityView,
  context: OpportunitySurfacingContext
): OpportunitySurfacingView {
  const hardSuppression = isHardSuppression(opportunity);
  if (hardSuppression) {
    return {
      status: "SUPPRESSED",
      visibility: "HIDDEN",
      surfacedBecause: `Suppressed on ${context === "home_command" ? "home" : "matchup"}: ${hardSuppression}.`,
      cautionReasons: []
    };
  }

  const cautionReasons = unique([
    ...opportunity.trapFlags
      .filter((flag) => flag !== "STALE_EDGE" && flag !== "LOW_PROVIDER_HEALTH")
      .map(formatTrap),
    ...(opportunity.actionState === "WAIT"
      ? ["timing posture is wait, so capital stays uncommitted for now"]
      : []),
    ...(opportunity.actionState === "WATCH"
      ? ["timing posture is watch, so this is informational before it is tradable"]
      : []),
    ...(opportunity.sizing.recommendedStake <= 0 && opportunity.actionState === "BET_NOW"
      ? ["allocator could not justify a live stake after risk cuts"]
      : []),
    ...(opportunity.sizing.recommendation === "MICRO"
      ? ["allocator cut this down to micro size"]
      : []),
    ...(opportunity.sizing.reasonCodes.includes("CORRELATED_WITH_OPEN_EXPOSURE")
      ? ["existing exposure already overlaps this risk cluster"]
      : []),
    ...(opportunity.sizing.reasonCodes.includes("BETTER_CAPITAL_USE_EXISTS")
      ? ["better capital use exists elsewhere on the board"]
      : []),
    ...(opportunity.closeDestination.label === "IMPROVE"
      ? ["replay and destination guidance lean toward a better number later"]
      : []),
    ...(opportunity.closeDestination.label === "MOSTLY_PRICED"
      ? ["destination guidance says most of the edge is already priced"]
      : []),
    ...(opportunity.executionCapacity.label === "SCREEN_VALUE_ONLY"
      ? ["displayed edge looks more like screen value than deployable size"]
      : []),
    ...(opportunity.executionCapacity.label === "FRAGILE_STALE"
      ? ["execution window is real but fragile, so size stays clipped"]
      : []),
    ...(opportunity.marketMicrostructure.status === "APPLIED" &&
    opportunity.marketMicrostructure.decayRiskBucket === "FAST"
      ? ["edge half-life is short, so execution window is fragile"]
      : [])
  ]);

  const visibility =
    opportunity.actionState === "BET_NOW" &&
    opportunity.sizing.recommendedStake > 0 &&
    cautionReasons.length <= 1 &&
    opportunity.confidenceTier !== "D"
      ? "FULL"
      : "CAUTION";

  const surfacedBecause = isTrustedStaleCopy(opportunity)
    ? "Surfaced because a trusted stale-copy path still exists, even after risk cuts."
    : opportunity.sizing.recommendedStake > 0
      ? "Surfaced because edge quality and capital efficiency both survive the risk cuts."
      : "Surfaced because the edge still deserves monitoring even though the allocator kept size near zero.";

  return {
    status: "SURFACED",
    visibility,
    surfacedBecause,
    cautionReasons
  };
}

export function applyOpportunitySurfacing(
  opportunity: OpportunityView,
  context: OpportunitySurfacingContext
): OpportunityView {
  const surfacing = buildOpportunitySurfacing(opportunity, context);
  const rankingNotes = opportunity.ranking?.notes ?? [];
  const executionNote =
    opportunity.executionContext?.status === "HISTORICAL"
      ? `Execution review: ${opportunity.executionContext.entryQualityLabel.toLowerCase()} (${opportunity.executionContext.executionScore}).`
      : null;

  const whyItShows = unique(
    [
      surfacing.surfacedBecause,
      rankingNotes[0] ?? "Ranking leans on capital efficiency and edge quality before posture.",
      executionNote,
      ...opportunity.whyItShows
    ].filter((value): value is string => typeof value === "string" && value.length > 0)
  ).slice(0, 3);

  const whatCouldKillIt = unique(
    [
      ...(surfacing.cautionReasons.length
        ? [`Downsized instead of suppressed because ${surfacing.cautionReasons[0]}.`]
        : []),
      rankingNotes[1] ?? null,
      ...opportunity.whatCouldKillIt
    ].filter((value): value is string => typeof value === "string" && value.length > 0)
  ).slice(0, 3);

  const summaryParts = unique([
    surfacing.visibility === "CAUTION" ? "Caution surface" : "Full surface",
    rankingNotes[0]?.replace(/\.$/, "") ?? null,
    opportunity.sizing.recommendedStake > 0
      ? `${opportunity.sizing.label} stake at ${opportunity.sizing.bankrollPct.toFixed(2)}%`
      : "No live allocation yet"
  ].filter((value): value is string => typeof value === "string" && value.length > 0));

  return {
    ...opportunity,
    surfacing,
    whyItShows,
    whatCouldKillIt,
    reasonSummary: `${summaryParts.slice(0, 3).join(". ")}.`
  };
}
