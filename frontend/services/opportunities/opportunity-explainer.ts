import type { OpportunityTrapFlag, OpportunityView } from "@/lib/types/opportunity";
import type { ReasonAttributionView } from "@/lib/types/domain";

function formatTrap(flag: OpportunityTrapFlag) {
  return flag.replace(/_/g, " ").toLowerCase();
}

function shorten(text: string, max = 74) {
  const trimmed = text.replace(/\s+/g, " ").trim().replace(/\.$/, "");
  if (trimmed.length <= max) {
    return trimmed;
  }

  return `${trimmed.slice(0, max - 1).trimEnd()}...`;
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

  if (typeof args.fairLineGap === "number" && Math.abs(args.fairLineGap) >= 8) {
    whyItShows.push(`${args.fairLineGap > 0 ? "+" : ""}${args.fairLineGap}c versus fair still holds`);
  }

  if (typeof args.expectedValuePct === "number" && args.expectedValuePct > 0) {
    whyItShows.push(`EV still sits at +${args.expectedValuePct.toFixed(2)}%`);
  }

  if (args.bestPriceFlag && args.bookCount >= 2) {
    whyItShows.push(`Best number is still live at ${args.bookCount} books`);
  }

  if (typeof args.lineMovement === "number" && Math.abs(args.lineMovement) >= 0.5) {
    whyItShows.push("The move started but has not fully corrected");
  }

  if (typeof args.marketDisagreementScore === "number" && args.marketDisagreementScore <= 0.12) {
    whyItShows.push("Book disagreement is still contained");
  }

  if (typeof args.freshnessMinutes === "number" && args.freshnessMinutes <= 10) {
    whyItShows.push("Feed freshness is healthy");
  }

  for (const reason of args.reasons.slice(0, 2)) {
    whyItShows.push(shorten(reason.detail, 64));
  }

  for (const flag of args.trapFlags.slice(0, 2)) {
    whatCouldKillIt.push(`${shorten(formatTrap(flag), 28)} already lowers trust.`);
  }

  if (typeof args.fairLineGap === "number") {
    whatCouldKillIt.push("If the price closes back toward fair, the edge collapses");
  }

  if (typeof args.lineMovement === "number" && Math.abs(args.lineMovement) >= 0.5) {
    whatCouldKillIt.push("Another move against this entry turns timing weak fast");
  }

  if (typeof args.marketDisagreementScore === "number" && args.marketDisagreementScore >= 0.08) {
    whatCouldKillIt.push("Wider book disagreement drops this into watch-only territory");
  }

  if (args.freshnessMinutes === null || args.freshnessMinutes > 15) {
    whatCouldKillIt.push("If the feed keeps aging, this becomes a stale-edge setup");
  }

  const reasonSummary =
    whyItShows[0] ??
    `${args.selectionLabel} is still in the ${args.actionState.replace(/_/g, " ").toLowerCase()} lane.`;

  const timingLabel =
    args.timingState === "WINDOW_OPEN"
      ? "Bet now window"
      : args.timingState === "WAIT_FOR_PULLBACK"
        ? "Wait for a better number"
        : args.timingState === "WAIT_FOR_CONFIRMATION"
          ? "Wait for confirmation"
          : args.timingState === "MONITOR_ONLY"
            ? "Watch only"
            : "Pass on price";

  return {
    whyItShows: whyItShows.slice(0, 2).map((item) => shorten(item, 64)),
    whatCouldKillIt: whatCouldKillIt.slice(0, 2).map((item) => shorten(item, 68)),
    reasonSummary: `${shorten(reasonSummary, 72)}. ${timingLabel}.`
  };
}
