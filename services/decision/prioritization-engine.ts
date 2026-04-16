import type { ChangeIntelligenceView } from "@/lib/types/change-intelligence";
import type { DecisionMemorySummary } from "@/lib/types/decision-memory";
import type { DecisionView } from "@/lib/types/decision";
import type {
  AttentionDirection,
  AttentionFreshnessBucket,
  AttentionReasonCode,
  AttentionTier,
  PrioritizationView
} from "@/lib/types/prioritization";

function hasMeaningfulChange(
  change: ChangeIntelligenceView | null,
  summary: DecisionMemorySummary | null
) {
  if (change) {
    return change.changeSeverity !== "none" && change.shortExplanation.trim().length > 0;
  }

  if (summary) {
    return (
      summary.lastChangeSeverity !== null &&
      summary.lastChangeSeverity !== "none" &&
      summary.shortExplanation !== null &&
      summary.shortExplanation.trim().length > 0
    );
  }

  return false;
}

function getAttentionDirection(
  change: ChangeIntelligenceView | null,
  summary: DecisionMemorySummary | null
): AttentionDirection {
  const sourceDirection = change?.changeDirection ?? summary?.lastChangeDirection ?? null;

  switch (sourceDirection) {
    case "upgraded":
      return "rising";
    case "downgraded":
      return "falling";
    case "mixed":
      return "mixed";
    default:
      return "stable";
  }
}

function getFreshnessBucket(decision: DecisionView | null): AttentionFreshnessBucket {
  if (!decision) {
    return "unknown";
  }

  if (decision.staleFlag) {
    return "stale";
  }

  if (typeof decision.providerFreshnessMinutes !== "number") {
    return "unknown";
  }

  if (decision.providerFreshnessMinutes <= 10) {
    return "fresh";
  }

  if (decision.providerFreshnessMinutes <= 30) {
    return "aging";
  }

  return "stale";
}

function buildReasonCodes(args: {
  decision: DecisionView | null;
  change: ChangeIntelligenceView | null;
  summary: DecisionMemorySummary | null;
  direction: AttentionDirection;
  freshnessBucket: AttentionFreshnessBucket;
  meaningfulChange: boolean;
}) {
  const reasons = new Set<AttentionReasonCode>();
  const decision = args.decision;

  if (!decision) {
    reasons.add("low_signal_hidden");
    return Array.from(reasons);
  }

  if (decision.recommendation === "surface" && decision.priority === "high") {
    reasons.add("recommendation_high_priority");
  } else if (decision.recommendation === "monitor") {
    reasons.add("recommendation_monitor");
  } else if (decision.recommendation === "hold") {
    reasons.add("recommendation_hold");
  }

  if (args.direction === "rising" && args.meaningfulChange) {
    reasons.add("meaningful_upgrade");
  }

  if (args.direction === "falling" && args.meaningfulChange) {
    reasons.add("meaningful_downgrade");
  }

  if ((args.change?.alertWorthyChange ?? false) || args.change?.changeReasons.includes("alert_eligibility_gained")) {
    reasons.add("alert_eligible_change");
  }

  if (
    args.meaningfulChange &&
    args.direction === "rising" &&
    decision.confidenceTier === "A" &&
    args.freshnessBucket === "fresh"
  ) {
    reasons.add("strong_confidence_with_fresh_change");
  }

  if (decision.trapCount > 0) {
    reasons.add("trap_limited_visibility");
  }

  if (args.freshnessBucket === "aging") {
    reasons.add("freshness_aging");
  }

  if (args.freshnessBucket === "stale") {
    reasons.add(
      decision.recommendation === "surface" || decision.recommendation === "monitor" || decision.recommendation === "hold"
        ? "stale_but_watchworthy"
        : "freshness_stale"
    );
  }

  if (!args.meaningfulChange) {
    if (decision.recommendation === "surface") {
      reasons.add("unchanged_actionable");
    } else {
      reasons.add("unchanged_low_priority");
    }
  }

  if (decision.recommendation === "suppress" && !args.meaningfulChange) {
    reasons.add("low_signal_hidden");
  }

  return Array.from(reasons);
}

function getAttentionTier(args: {
  decision: DecisionView | null;
  direction: AttentionDirection;
  freshnessBucket: AttentionFreshnessBucket;
  meaningfulChange: boolean;
}) : AttentionTier {
  const decision = args.decision;

  if (!decision) {
    return "hidden";
  }

  if (
    decision.recommendation === "suppress" &&
    !args.meaningfulChange
  ) {
    return "hidden";
  }

  if (
    args.meaningfulChange &&
    args.direction === "rising" &&
    decision.recommendation === "surface" &&
    decision.priority === "high" &&
    args.freshnessBucket !== "stale"
  ) {
    return "critical";
  }

  if (
    args.meaningfulChange &&
    (args.direction === "rising" || args.direction === "falling" || args.direction === "mixed")
  ) {
    return "high";
  }

  if (decision.recommendation === "surface") {
    return "high";
  }

  if (decision.recommendation === "monitor" || decision.recommendation === "hold") {
    return args.freshnessBucket === "stale" ? "low" : "medium";
  }

  return "hidden";
}

function getShortAttentionLabel(
  tier: AttentionTier,
  direction: AttentionDirection,
  surfaced: boolean
) {
  if (!surfaced || tier === "hidden") {
    return "Hidden";
  }

  if (tier === "critical") {
    return "Now";
  }

  if (direction === "rising") {
    return "Rising";
  }

  if (direction === "falling") {
    return "Cooling";
  }

  if (direction === "mixed") {
    return "Mixed";
  }

  return tier === "high" ? "Active" : "Monitor";
}

function getShortAttentionExplanation(args: {
  decision: DecisionView | null;
  change: ChangeIntelligenceView | null;
  summary: DecisionMemorySummary | null;
  tier: AttentionTier;
  direction: AttentionDirection;
  freshnessBucket: AttentionFreshnessBucket;
  surfaced: boolean;
}) {
  if (!args.surfaced || args.tier === "hidden") {
    return null;
  }

  const semanticExplanation = args.change?.shortExplanation?.trim() || args.summary?.shortExplanation?.trim();
  if (semanticExplanation) {
    return semanticExplanation;
  }

  if (!args.decision) {
    return null;
  }

  if (args.direction === "rising" && args.decision.recommendation === "surface") {
    return "Actionable setup moved up the queue.";
  }

  if (args.direction === "falling") {
    return "Visible setup is cooling.";
  }

  if (args.freshnessBucket === "stale") {
    return "Signal is still visible, but freshness is degraded.";
  }

  if (args.decision.recommendation === "monitor") {
    return "Worth monitoring, not leading yet.";
  }

  if (args.decision.recommendation === "hold") {
    return "Worth keeping visible, but entry is not ready.";
  }

  return "Still worth attention.";
}

function buildSortWeight(args: {
  tier: AttentionTier;
  direction: AttentionDirection;
  decision: DecisionView | null;
  freshnessBucket: AttentionFreshnessBucket;
  meaningfulChange: boolean;
}) {
  const tierWeight = {
    critical: 400,
    high: 300,
    medium: 200,
    low: 100,
    hidden: 0
  } satisfies Record<AttentionTier, number>;
  const directionWeight = {
    rising: 40,
    falling: 30,
    mixed: 20,
    stable: 10
  } satisfies Record<AttentionDirection, number>;
  const freshnessWeight = {
    fresh: 15,
    aging: 5,
    stale: -20,
    unknown: 0
  } satisfies Record<AttentionFreshnessBucket, number>;
  const priorityWeight =
    args.decision?.priority === "high" ? 20 : args.decision?.priority === "medium" ? 10 : 0;

  return (
    tierWeight[args.tier] +
    directionWeight[args.direction] +
    freshnessWeight[args.freshnessBucket] +
    priorityWeight +
    (args.meaningfulChange ? 10 : 0) -
    ((args.decision?.trapCount ?? 0) * 5)
  );
}

export function buildPrioritizationView(args: {
  decision: DecisionView | null;
  change?: ChangeIntelligenceView | null;
  summary?: DecisionMemorySummary | null;
}): PrioritizationView {
  const decision = args.decision ?? null;
  const change = args.change ?? null;
  const summary = args.summary ?? null;
  const freshnessBucket = getFreshnessBucket(decision);
  const meaningfulChange = hasMeaningfulChange(change, summary);
  const direction = getAttentionDirection(change, summary);
  const attentionTier = getAttentionTier({
    decision,
    direction,
    freshnessBucket,
    meaningfulChange
  });
  const surfaced = attentionTier !== "hidden";
  const surfacedReasonCodes = buildReasonCodes({
    decision,
    change,
    summary,
    direction,
    freshnessBucket,
    meaningfulChange
  });
  const shortAttentionLabel = getShortAttentionLabel(attentionTier, direction, surfaced);
  const shortAttentionExplanation = getShortAttentionExplanation({
    decision,
    change,
    summary,
    tier: attentionTier,
    direction,
    freshnessBucket,
    surfaced
  });
  const stableAttentionSignature = JSON.stringify({
    attentionTier,
    direction,
    surfaced,
    reasons: [...surfacedReasonCodes].sort(),
    decisionSignature: decision?.dedupeSignature ?? null,
    changeSignature: change?.stableChangeSignature ?? null,
    summarySignature: summary?.latestChangeSignature ?? null,
    freshnessBucket
  });

  return {
    attentionTier,
    attentionDirection: direction,
    surfaced,
    surfacedReasonCodes,
    shortAttentionLabel,
    shortAttentionExplanation,
    stableAttentionSignature,
    sortWeight: buildSortWeight({
      tier: attentionTier,
      direction,
      decision,
      freshnessBucket,
      meaningfulChange
    }),
    freshnessBucket
  };
}

export function rankPrioritizationViews<T extends { prioritization: PrioritizationView }>(items: T[]) {
  return [...items].sort((left, right) => {
    const weightDelta = right.prioritization.sortWeight - left.prioritization.sortWeight;
    if (weightDelta !== 0) {
      return weightDelta;
    }

    return right.prioritization.stableAttentionSignature.localeCompare(
      left.prioritization.stableAttentionSignature
    );
  });
}
