import type { ActivationState, RankedTrendPlay } from "@/services/trends/play-types";
import type { VerdictConfidence } from "@/services/simulation/sim-verdict-engine";
import type { TrendTimingPhase } from "@/services/trends/types";
import type {
  OpportunityActionState,
  OpportunityConfidenceTier,
  OpportunityTimingState
} from "@/lib/types/opportunity";

export function activationStateToActionState(state: ActivationState): OpportunityActionState {
  switch (state) {
    case "LIVE_NOW":
      return "BET_NOW";
    case "BUILDING":
      return "WAIT";
    case "EARLY":
      return "WATCH";
    case "DEAD":
    case "PASS":
      return "PASS";
  }
}

export function verdictConfidenceToTier(confidence: VerdictConfidence): OpportunityConfidenceTier {
  switch (confidence) {
    case "HIGH":
      return "A";
    case "MEDIUM":
      return "B";
    case "LOW":
      return "C";
    case "INSUFFICIENT":
      return "D";
  }
}

export function trendTimingPhaseToTimingState(phase: TrendTimingPhase): OpportunityTimingState {
  switch (phase) {
    case "PEAK":
      return "WINDOW_OPEN";
    case "BUILDING":
      return "WAIT_FOR_PULLBACK";
    case "EARLY":
      return "WAIT_FOR_CONFIRMATION";
    case "LATE":
      return "MONITOR_ONLY";
    case "DEAD":
      return "PASS_ON_PRICE";
  }
}

export function matchTrendPlaysToOpportunity(
  plays: RankedTrendPlay[],
  opportunity: { eventId: string; marketType: string }
): RankedTrendPlay[] {
  const mkt = opportunity.marketType as "moneyline" | "spread" | "total";
  return plays.filter(
    (play) =>
      play.eventId === opportunity.eventId &&
      play.marketType === mkt &&
      play.activationState !== "DEAD" &&
      play.activationState !== "PASS"
  );
}
