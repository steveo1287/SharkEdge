import type { MarketPathExecutionHint } from "@/lib/types/domain";
import type {
  MarketEfficiencyClass,
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
  marketEfficiency?: MarketEfficiencyClass;
  edgeDecayPenalty?: number;
  truthTimingDelta?: number;
  calibrationTrapEscalation?: boolean;
  marketPathTimingDelta?: number;
  marketPathExecutionHint?: MarketPathExecutionHint;
  marketPathStaleCopyConfidence?: number;
  marketPathRepricingLikelihood?: number;
  marketPathWaitImprovementLikelihood?: number;
  marketPathTrapEscalation?: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hasAnyTrap(
  trapFlags: OpportunityTrapFlag[],
  candidates: OpportunityTrapFlag[]
) {
  return candidates.some((flag) => trapFlags.includes(flag));
}

function buildFreshnessPenalty(freshnessMinutes: number | null) {
  if (freshnessMinutes === null) {
    return 6;
  }

  if (freshnessMinutes <= 3) {
    return 0;
  }

  if (freshnessMinutes <= 8) {
    return 4;
  }

  if (freshnessMinutes <= 15) {
    return 9;
  }

  if (freshnessMinutes <= 30) {
    return 16;
  }

  if (freshnessMinutes <= 60) {
    return 24;
  }

  return 34;
}

function buildDisagreementPenalty(disagreementScore: number | null) {
  return clamp(Math.round((disagreementScore ?? 0) * 36), 0, 18);
}

function buildMovementState(lineMovement: number | null) {
  const movementMagnitude = Math.abs(lineMovement ?? 0);

  if (movementMagnitude >= 20) {
    return "violent" as const;
  }

  if (movementMagnitude >= 10) {
    return "strong" as const;
  }

  if (movementMagnitude >= 4) {
    return "active" as const;
  }

  return "stable" as const;
}

export function buildOpportunityTiming(
  args: BuildOpportunityTimingArgs
): {
  actionState: OpportunityActionState;
  timingState: OpportunityTimingState;
  timingQuality: number;
} {
  const severeTrap = hasAnyTrap(args.trapFlags, [
    "STALE_EDGE",
    "LOW_PROVIDER_HEALTH",
    "ONE_BOOK_OUTLIER"
  ]);

  const cautionTrap = hasAnyTrap(args.trapFlags, [
    "FAKE_MOVE_RISK",
    "HIGH_MARKET_DISAGREEMENT",
    "LOW_CONFIDENCE_FAIR_PRICE",
    "MODEL_MARKET_CONFLICT",
    "INJURY_UNCERTAINTY"
  ]);

  const freshnessPenalty = buildFreshnessPenalty(args.freshnessMinutes);
  const disagreementPenalty = buildDisagreementPenalty(args.disagreementScore);
  const movementState = buildMovementState(args.lineMovement);
  const marketEfficiency = args.marketEfficiency ?? "MID_EFFICIENCY";
  const edgeDecayPenalty = args.edgeDecayPenalty ?? 0;
  const truthTimingDelta = clamp(args.truthTimingDelta ?? 0, -8, 5);
  const calibrationTrapEscalation = args.calibrationTrapEscalation === true;
  const marketPathTimingDelta = clamp(args.marketPathTimingDelta ?? 0, -9, 8);
  const marketPathTrapEscalation = args.marketPathTrapEscalation === true;
  const marketPathExecutionHint = args.marketPathExecutionHint ?? "SUPPRESS";
  const marketPathStaleCopyConfidence = clamp(
    args.marketPathStaleCopyConfidence ?? 0,
    0,
    100
  );
  const marketPathRepricingLikelihood = clamp(
    args.marketPathRepricingLikelihood ?? 0,
    0,
    100
  );
  const marketPathWaitImprovementLikelihood = clamp(
    args.marketPathWaitImprovementLikelihood ?? 0,
    0,
    100
  );
  const isSharpSteam =
    Math.abs(args.lineMovement ?? 0) >= 10 &&
    args.bestPriceFlag &&
    (args.disagreementScore ?? 0) < 0.12;
  const fastStaleCopy =
    marketPathExecutionHint === "HIT_NOW" &&
    marketPathStaleCopyConfidence >= 70 &&
    args.bestPriceFlag;
  const matureBroadMove =
    marketPathRepricingLikelihood >= 74 &&
    marketPathExecutionHint !== "HIT_NOW" &&
    !args.bestPriceFlag;
  const waitImprovementLikely =
    marketPathWaitImprovementLikelihood >= 62 &&
    marketPathExecutionHint !== "HIT_NOW";
  const ev = args.expectedValuePct ?? 0;
  const decisionScore = clamp(
    Math.round(
      args.score +
        truthTimingDelta * 0.65 -
        (calibrationTrapEscalation ? 6 : 0) +
        marketPathTimingDelta * 0.8 -
        (marketPathTrapEscalation ? 5 : 0)
    ),
    0,
    100
  );

  let timingQuality = clamp(
    Math.round(
      args.score -
        freshnessPenalty -
        disagreementPenalty -
        (cautionTrap ? 10 : 0) -
        (severeTrap ? 26 : 0) +
        (args.bestPriceFlag ? 8 : 0) +
        (movementState === "stable" ? 4 : 0) -
        (movementState === "violent" ? 8 : 0) -
        edgeDecayPenalty * 0.4 -
        (calibrationTrapEscalation ? 6 : 0) +
        truthTimingDelta -
        (marketPathTrapEscalation ? 5 : 0) +
        marketPathTimingDelta +
        (marketEfficiency === "THIN_SPECIALTY" ? 8 : 0) -
        (marketEfficiency === "FRAGMENTED_PROP" ? 5 : 0)
    ),
    0,
    100
  );

  if (severeTrap || decisionScore < 55 || ev <= 0 || edgeDecayPenalty >= 34) {
    return {
      actionState: "PASS",
      timingState: "PASS_ON_PRICE",
      timingQuality
    };
  }

  if (
    args.freshnessMinutes !== null &&
    args.freshnessMinutes > 45 &&
    !args.bestPriceFlag
  ) {
    return {
      actionState: "PASS",
      timingState: "PASS_ON_PRICE",
      timingQuality
    };
  }

  if (
    fastStaleCopy &&
    decisionScore >= 70 &&
    ev >= 1 &&
    freshnessPenalty <= 16
  ) {
    timingQuality = Math.max(timingQuality, 82);

    return {
      actionState: "BET_NOW",
      timingState: "WINDOW_OPEN",
      timingQuality
    };
  }

  if (matureBroadMove && decisionScore < 84) {
    return {
      actionState: "WATCH",
      timingState: "MONITOR_ONLY",
      timingQuality
    };
  }

  if (waitImprovementLikely && decisionScore >= 68 && !cautionTrap) {
    return {
      actionState: "WAIT",
      timingState: "WAIT_FOR_PULLBACK",
      timingQuality
    };
  }

  if (cautionTrap && decisionScore < 78) {
    return {
      actionState: "WATCH",
      timingState: "MONITOR_ONLY",
      timingQuality
    };
  }

  if (
    decisionScore >= 84 &&
    ev >= 1.8 &&
    args.bestPriceFlag &&
    freshnessPenalty <= 9 &&
    (movementState === "stable" || isSharpSteam)
  ) {
    timingQuality = Math.max(timingQuality, 84);

    return {
      actionState: "BET_NOW",
      timingState: "WINDOW_OPEN",
      timingQuality
    };
  }

  if (
    decisionScore >= 78 &&
    ev >= 1.25 &&
    args.bestPriceFlag &&
    movementState === "stable"
  ) {
    timingQuality = Math.max(timingQuality, 76);

    return {
      actionState: "BET_NOW",
      timingState: "WINDOW_OPEN",
      timingQuality
    };
  }

  if (
    decisionScore >= 74 &&
    !args.bestPriceFlag &&
    (movementState === "active" || movementState === "strong")
  ) {
    return {
      actionState: "WAIT",
      timingState: "WAIT_FOR_PULLBACK",
      timingQuality
    };
  }

  if (
    decisionScore >= 70 &&
    args.bestPriceFlag &&
    movementState === "strong"
  ) {
    return {
      actionState: "WAIT",
      timingState: "WAIT_FOR_CONFIRMATION",
      timingQuality
    };
  }

  if (decisionScore >= 68) {
    return {
      actionState: "WATCH",
      timingState: "MONITOR_ONLY",
      timingQuality
    };
  }

  return {
    actionState: "PASS",
    timingState: "PASS_ON_PRICE",
    timingQuality
  };
}
