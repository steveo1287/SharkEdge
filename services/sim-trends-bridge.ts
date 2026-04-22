import type { ActivationState, RankedTrendPlay } from "@/services/trends/play-types";
import type {
  GameSimVerdict,
  MarketVerdict,
  VerdictConfidence,
  VerdictSide
} from "@/services/simulation/sim-verdict-engine";
import type { TrendTimingPhase } from "@/services/trends/types";
import type {
  OpportunityActionState,
  OpportunityConfidenceTier,
  OpportunityTimingState
} from "@/lib/types/opportunity";

export type OpportunitySimAlignment = "AGREE" | "DISAGREE" | "NEUTRAL";

export type OpportunitySimVerdictMatch = {
  verdict: MarketVerdict;
  alignment: OpportunitySimAlignment;
};

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

function inferOpportunitySide(selectionLabel: string): VerdictSide {
  const normalized = selectionLabel.toLowerCase();
  if (normalized.includes("over") || normalized.startsWith("o ")) return "OVER";
  if (normalized.includes("under") || normalized.startsWith("u ")) return "UNDER";
  if (normalized.includes("home")) return "HOME";
  if (normalized.includes("away")) return "AWAY";
  return "NONE";
}

function normalizeMarketType(marketType: string): MarketVerdict["market"] | null {
  const lower = marketType.toLowerCase();
  if (lower.includes("moneyline") || lower === "ml") return "moneyline";
  if (lower.includes("spread")) return "spread";
  if (lower.includes("total") || lower.includes("over") || lower.includes("under")) return "total";
  if (lower.includes("prop")) return "player_prop";
  return null;
}

export function matchSimVerdictToOpportunity(
  gameVerdict: GameSimVerdict,
  opportunity: { marketType: string; selectionLabel: string }
): OpportunitySimVerdictMatch | null {
  const market = normalizeMarketType(opportunity.marketType);
  if (!market) return null;

  const candidates = gameVerdict.verdicts.filter((v) => v.market === market);
  if (!candidates.length) return null;

  const oppSide = inferOpportunitySide(opportunity.selectionLabel);

  const sameSide = candidates.find((v) => v.side === oppSide && v.side !== "NONE");
  if (sameSide) {
    return { verdict: sameSide, alignment: "AGREE" };
  }

  const opposite: Partial<Record<VerdictSide, VerdictSide>> = {
    HOME: "AWAY",
    AWAY: "HOME",
    OVER: "UNDER",
    UNDER: "OVER"
  };
  const opp = opposite[oppSide];
  const oppositeSideVerdict = opp ? candidates.find((v) => v.side === opp) : undefined;
  if (oppositeSideVerdict) {
    return { verdict: oppositeSideVerdict, alignment: "DISAGREE" };
  }

  return { verdict: candidates[0], alignment: "NEUTRAL" };
}
