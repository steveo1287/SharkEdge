import type { ReasonAttributionView } from "@/lib/types/domain";
import type {
  MarketEfficiencyClass,
  OpportunityEdgeDecayView,
  OpportunitySourceQuality,
  OpportunityTrapFlag,
  OpportunityView,
  PositionSizingGuidance
} from "@/lib/types/opportunity";

function shorten(text: string, max = 96) {
  const trimmed = text.replace(/\s+/g, " ").trim().replace(/\.$/, "");
  if (trimmed.length <= max) {
    return trimmed;
  }

  return `${trimmed.slice(0, max - 3).trimEnd()}...`;
}

function formatTrap(flag: OpportunityTrapFlag) {
  switch (flag) {
    case "STALE_EDGE":
      return "screen is stale";
    case "LOW_PROVIDER_HEALTH":
      return "feed health is not strong enough";
    case "THIN_MARKET":
      return "market depth is thin";
    case "ONE_BOOK_OUTLIER":
      return "edge may be a one-book outlier";
    case "HIGH_MARKET_DISAGREEMENT":
      return "books disagree too much";
    case "LOW_CONFIDENCE_FAIR_PRICE":
      return "fair price confidence is weak";
    case "FAKE_MOVE_RISK":
      return "move is not confirmed by enough market depth";
    case "MODEL_MARKET_CONFLICT":
      return "model and market are fighting each other";
    case "INJURY_UNCERTAINTY":
      return "injury uncertainty can reprice the number";
  }
}

function formatTimingLabel(timingState: OpportunityView["timingState"]) {
  switch (timingState) {
    case "WINDOW_OPEN":
      return "window open";
    case "WAIT_FOR_PULLBACK":
      return "wait for pullback";
    case "WAIT_FOR_CONFIRMATION":
      return "wait for confirmation";
    case "MONITOR_ONLY":
      return "monitor only";
    default:
      return "pass on price";
  }
}

function describeFairGap(fairLineGap: number | null) {
  if (typeof fairLineGap !== "number") {
    return null;
  }

  const gap = Math.abs(fairLineGap);
  if (gap >= 12) {
    return `Market is still off fair by ${fairLineGap > 0 ? "+" : ""}${fairLineGap} cents`;
  }

  if (gap >= 6) {
    return "Market is still leaving a measurable gap to fair";
  }

  return null;
}

function describeEv(expectedValuePct: number | null) {
  if (typeof expectedValuePct !== "number" || expectedValuePct <= 0) {
    return null;
  }

  return `EV still grades at +${expectedValuePct.toFixed(2)}%`;
}

function describeMarketProblem(args: {
  fairLineGap: number | null;
  expectedValuePct: number | null;
  bestPriceFlag: boolean;
}) {
  return (
    describeFairGap(args.fairLineGap) ??
    describeEv(args.expectedValuePct) ??
    (args.bestPriceFlag ? "Best available price is still mispriced versus the desk number" : null) ??
    "No clean market dislocation is confirmed"
  );
}

function describeWhyNumberExists(args: {
  marketEfficiency: MarketEfficiencyClass;
  sourceQuality: OpportunitySourceQuality;
  bookCount: number;
  bestPriceFlag: boolean;
  marketDisagreementScore: number | null;
}) {
  if (args.marketEfficiency === "FRAGMENTED_PROP") {
    return "Number likely exists because prop liquidity is fragmented across books";
  }

  if (args.marketEfficiency === "THIN_SPECIALTY") {
    return "Number likely exists because this specialty market is thin and slower to normalize";
  }

  if (!args.bestPriceFlag) {
    return "Number may already be gone at the best book, so do not chase without confirmation";
  }

  if ((args.marketDisagreementScore ?? 0) >= 0.14) {
    return "Number exists because the board has not converged yet";
  }

  if (args.sourceQuality.influenceTier === "MAJOR_RETAIL") {
    return "Number is sitting at a retail book while the market-maker signal is lighter";
  }

  if (args.bookCount < 4) {
    return "Number exists in a shallow comparison set, so sizing has to stay capped";
  }

  return "Number exists because the edge has not fully closed into consensus yet";
}

function describeConfirmation(args: {
  sourceQuality: OpportunitySourceQuality;
  bookCount: number;
  freshnessMinutes: number | null;
  lineMovement: number | null;
  bestPriceFlag: boolean;
}) {
  if (args.sourceQuality.sharpBookPresent && args.bookCount >= 4) {
    return "Sharp-book source quality and market depth both confirm the setup";
  }

  if (args.bestPriceFlag && args.freshnessMinutes !== null && args.freshnessMinutes <= 8) {
    return "Best price is fresh enough to act if the sizing gate clears";
  }

  if (Math.abs(args.lineMovement ?? 0) >= 10 && args.bookCount >= 4) {
    return "Move has enough book depth to treat as real pressure";
  }

  return args.sourceQuality.notes[0] ?? "Confirmation is limited, so the posture stays conservative";
}

function describeDecay(edgeDecay: OpportunityEdgeDecayView) {
  if (edgeDecay.label === "COMPRESSED") {
    return "Edge is compressing; another tick against entry invalidates the bet-now case";
  }

  if (edgeDecay.label === "STALE" || edgeDecay.label === "DECAYING") {
    return "Edge is decaying; require a fresh snapshot before acting";
  }

  if (edgeDecay.label === "AGING") {
    return "Edge is aging but not dead yet";
  }

  return "Edge is fresh enough for the current timing posture";
}

function getReasonDetail(reasons: ReasonAttributionView[]) {
  return reasons
    .slice(0, 2)
    .map((reason) => shorten(reason.detail, 86))
    .filter(Boolean);
}

export function buildOpportunityExplanation(args: {
  eventLabel: string;
  selectionLabel: string;
  expectedValuePct: number | null;
  fairLineGap: number | null;
  bestPriceFlag: boolean;
  bookCount: number;
  lineMovement: number | null;
  marketDisagreementScore: number | null;
  freshnessMinutes: number | null;
  pricingMethod: string | null;
  confidenceScore: number;
  reasons: ReasonAttributionView[];
  trapFlags: OpportunityTrapFlag[];
  actionState: OpportunityView["actionState"];
  timingState: OpportunityView["timingState"];
  marketEfficiency: MarketEfficiencyClass;
  sourceQuality: OpportunitySourceQuality;
  edgeDecay: OpportunityEdgeDecayView;
  sizing: PositionSizingGuidance;
}) {
  const marketProblem = describeMarketProblem({
    fairLineGap: args.fairLineGap,
    expectedValuePct: args.expectedValuePct,
    bestPriceFlag: args.bestPriceFlag
  });
  const whyNumberExists = describeWhyNumberExists({
    marketEfficiency: args.marketEfficiency,
    sourceQuality: args.sourceQuality,
    bookCount: args.bookCount,
    bestPriceFlag: args.bestPriceFlag,
    marketDisagreementScore: args.marketDisagreementScore
  });
  const confirmation = describeConfirmation({
    sourceQuality: args.sourceQuality,
    bookCount: args.bookCount,
    freshnessMinutes: args.freshnessMinutes,
    lineMovement: args.lineMovement,
    bestPriceFlag: args.bestPriceFlag
  });
  const decayLine = describeDecay(args.edgeDecay);
  const reasonDetails = getReasonDetail(args.reasons);

  const whyItShows = [
    marketProblem,
    whyNumberExists,
    confirmation,
    decayLine,
    ...reasonDetails
  ].filter(Boolean);

  const whatCouldKillIt = [
    ...args.trapFlags.slice(0, 2).map((flag) => `${formatTrap(flag)}.`),
    args.edgeDecay.compressed
      ? "If the best price disappears or the fair gap compresses, the edge is gone."
      : null,
    typeof args.marketDisagreementScore === "number" &&
    args.marketDisagreementScore >= 0.14
      ? "If books stay split, this should not size beyond a token position."
      : null,
    args.freshnessMinutes === null || args.freshnessMinutes > 20
      ? "If the feed is not refreshed, treat the number as stale."
      : null
  ].filter(Boolean) as string[];

  const summary = [
    shorten(marketProblem, 82),
    `${args.sizing.label} sizing`,
    formatTimingLabel(args.timingState)
  ].join(". ");

  return {
    whyItShows: whyItShows.slice(0, 3).map((item) => shorten(item, 88)),
    whatCouldKillIt: whatCouldKillIt.slice(0, 3).map((item) => shorten(item, 92)),
    reasonSummary: `${summary}.`
  };
}
