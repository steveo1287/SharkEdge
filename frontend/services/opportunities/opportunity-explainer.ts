import type { ReasonAttributionView } from "@/lib/types/domain";
import type { OpportunityTrapFlag, OpportunityView } from "@/lib/types/opportunity";

function shorten(text: string, max = 84) {
  const trimmed = text.replace(/\s+/g, " ").trim().replace(/\.$/, "");
  if (trimmed.length <= max) {
    return trimmed;
  }

  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

function formatTrap(flag: OpportunityTrapFlag) {
  switch (flag) {
    case "STALE_EDGE":
      return "the price is getting stale";
    case "LOW_PROVIDER_HEALTH":
      return "the feed is not healthy enough";
    case "THIN_MARKET":
      return "the market is too thin";
    case "ONE_BOOK_OUTLIER":
      return "the number may only be a one-book outlier";
    case "HIGH_MARKET_DISAGREEMENT":
      return "books are too far apart";
    case "LOW_CONFIDENCE_FAIR_PRICE":
      return "the fair price model is not confident";
    case "FAKE_MOVE_RISK":
      return "the move can still be fake";
    case "MODEL_MARKET_CONFLICT":
      return "the model and market are not aligned";
    case "INJURY_UNCERTAINTY":
      return "injury uncertainty still hangs over it";
    default:
      return flag.replace(/_/g, " ").toLowerCase();
  }
}

function formatTimingLabel(timingState: OpportunityView["timingState"]) {
  switch (timingState) {
    case "WINDOW_OPEN":
      return "Bet now window";
    case "WAIT_FOR_PULLBACK":
      return "Wait for a better number";
    case "WAIT_FOR_CONFIRMATION":
      return "Wait for confirmation";
    case "MONITOR_ONLY":
      return "Watch only";
    default:
      return "Pass on price";
  }
}

function describeMovement(lineMovement: number | null) {
  const movement = Math.abs(lineMovement ?? 0);

  if (movement >= 20) {
    return "The market already moved hard";
  }

  if (movement >= 10) {
    return "The market has already moved";
  }

  if (movement >= 4) {
    return "The number is starting to move";
  }

  return null;
}

function describeFairGap(fairLineGap: number | null) {
  if (typeof fairLineGap !== "number") {
    return null;
  }

  if (Math.abs(fairLineGap) >= 12) {
    return `${fairLineGap > 0 ? "+" : ""}${fairLineGap}c versus fair still holds`;
  }

  if (Math.abs(fairLineGap) >= 6) {
    return `There is still a measurable gap to fair price`;
  }

  return null;
}

function describeEv(expectedValuePct: number | null) {
  if (typeof expectedValuePct !== "number" || expectedValuePct <= 0) {
    return null;
  }

  if (expectedValuePct >= 3) {
    return `EV still sits at +${expectedValuePct.toFixed(2)}%`;
  }

  return `Positive EV still remains`;
}

function describeMarketShape(args: {
  bestPriceFlag: boolean;
  bookCount: number;
  marketDisagreementScore: number | null;
}) {
  if (args.bestPriceFlag && args.bookCount >= 3) {
    return `Best price is still available across a real market`;
  }

  if (
    typeof args.marketDisagreementScore === "number" &&
    args.marketDisagreementScore <= 0.08 &&
    args.bookCount >= 2
  ) {
    return `Books are relatively aligned around this number`;
  }

  return null;
}

function describeFreshness(freshnessMinutes: number | null) {
  if (freshnessMinutes === null) {
    return null;
  }

  if (freshnessMinutes <= 5) {
    return "Feed freshness is strong";
  }

  if (freshnessMinutes <= 15) {
    return "Feed freshness is still acceptable";
  }

  return null;
}

function getReasonDetail(reasons: ReasonAttributionView[]) {
  return reasons
    .slice(0, 2)
    .map((reason) => shorten(reason.detail, 76))
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
}) {
  const whyItShows: string[] = [];
  const whatCouldKillIt: string[] = [];

  const fairGapLine = describeFairGap(args.fairLineGap);
  const evLine = describeEv(args.expectedValuePct);
  const movementLine = describeMovement(args.lineMovement);
  const marketShapeLine = describeMarketShape({
    bestPriceFlag: args.bestPriceFlag,
    bookCount: args.bookCount,
    marketDisagreementScore: args.marketDisagreementScore
  });
  const freshnessLine = describeFreshness(args.freshnessMinutes);

  if (fairGapLine) whyItShows.push(fairGapLine);
  if (evLine) whyItShows.push(evLine);
  if (marketShapeLine) whyItShows.push(marketShapeLine);
  if (freshnessLine) whyItShows.push(freshnessLine);

  for (const detail of getReasonDetail(args.reasons)) {
    if (!whyItShows.includes(detail)) {
      whyItShows.push(detail);
    }
  }

  for (const flag of args.trapFlags.slice(0, 2)) {
    whatCouldKillIt.push(`${formatTrap(flag)}.`);
  }

  if (typeof args.fairLineGap === "number" && Math.abs(args.fairLineGap) >= 6) {
    whatCouldKillIt.push("If the line closes back toward fair, the edge disappears.");
  }

  if (typeof args.lineMovement === "number" && Math.abs(args.lineMovement) >= 4) {
    whatCouldKillIt.push("Another move against this entry will damage timing quickly.");
  }

  if (
    typeof args.marketDisagreementScore === "number" &&
    args.marketDisagreementScore >= 0.12
  ) {
    whatCouldKillIt.push("If books stay far apart, this should remain watch-only.");
  }

  if (args.freshnessMinutes === null || args.freshnessMinutes > 20) {
    whatCouldKillIt.push("If the feed gets older, this becomes a stale setup.");
  }

  const primaryReason =
    whyItShows[0] ??
    `${args.selectionLabel} is still grading as ${args.actionState
      .replace(/_/g, " ")
      .toLowerCase()}.`;

  const timingLabel = formatTimingLabel(args.timingState);

  return {
    whyItShows: whyItShows.slice(0, 2).map((item) => shorten(item, 76)),
    whatCouldKillIt: whatCouldKillIt.slice(0, 2).map((item) => shorten(item, 82)),
    reasonSummary: `${shorten(primaryReason, 92)}. ${timingLabel}.`
  };
}