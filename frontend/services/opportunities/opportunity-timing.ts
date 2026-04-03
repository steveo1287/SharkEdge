import type {
  OpportunityActionState,
  OpportunityTimingState,
  OpportunityTrapFlag
} from "@/lib/types/opportunity";

type BuildOpportunityTimingArgs = {
  score: number;
  expectedValuePct: number | null;
  lineMovement: number | null;
  bestPriceFlag: boolean;
  freshnessMinutes: number | null;
  trapFlags: OpportunityTrapFlag[];
  disagreementScore: number | null;
};

export function buildOpportunityTiming(args: BuildOpportunityTimingArgs): {
  actionState: OpportunityActionState;
  timingState: OpportunityTimingState;
  timingQuality: number;
} {
  const severeTrap =
    args.trapFlags.includes("STALE_EDGE") ||
    args.trapFlags.includes("LOW_PROVIDER_HEALTH") ||
    args.trapFlags.includes("ONE_BOOK_OUTLIER");
  const cautionTrap =
    args.trapFlags.includes("FAKE_MOVE_RISK") ||
    args.trapFlags.includes("HIGH_MARKET_DISAGREEMENT") ||
    args.trapFlags.includes("LOW_CONFIDENCE_FAIR_PRICE");
  const freshnessPenalty =
    args.freshnessMinutes === null ? 4 : args.freshnessMinutes > 20 ? 16 : args.freshnessMinutes > 8 ? 8 : 0;
  const movementMagnitude = Math.abs(args.lineMovement ?? 0);
  const disagreementPenalty = Math.min(12, Math.round((args.disagreementScore ?? 0) * 40));

  let timingQuality = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        args.score -
          freshnessPenalty -
          disagreementPenalty -
          (cautionTrap ? 12 : 0) -
          (severeTrap ? 30 : 0) +
          (args.bestPriceFlag ? 8 : 0)
      )
    )
  );

  if (severeTrap || args.score < 55 || (args.expectedValuePct ?? 0) <= 0) {
    return {
      actionState: "PASS",
      timingState: "PASS_ON_PRICE",
      timingQuality
    };
  }

  if (cautionTrap) {
    return {
      actionState: "WATCH",
      timingState: "MONITOR_ONLY",
      timingQuality
    };
  }

  if (args.score >= 85 && args.bestPriceFlag && movementMagnitude <= 12) {
    timingQuality = Math.max(timingQuality, 82);
    return {
      actionState: "BET_NOW",
      timingState: "WINDOW_OPEN",
      timingQuality
    };
  }

  if (args.score >= 70 && !args.bestPriceFlag && movementMagnitude >= 8) {
    return {
      actionState: "WAIT",
      timingState: "WAIT_FOR_PULLBACK",
      timingQuality
    };
  }

  if (args.score >= 70) {
    return {
      actionState: "WAIT",
      timingState: "WAIT_FOR_CONFIRMATION",
      timingQuality
    };
  }

  return {
    actionState: "WATCH",
    timingState: "MONITOR_ONLY",
    timingQuality
  };
}
