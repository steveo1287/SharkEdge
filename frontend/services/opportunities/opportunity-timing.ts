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
    return "violent";
  }

  if (movementMagnitude >= 10) {
    return "strong";
  }

  if (movementMagnitude >= 4) {
    return "active";
  }

  return "stable";
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
  const ev = args.expectedValuePct ?? 0;

  let timingQuality = clamp(
    Math.round(
      args.score -
        freshnessPenalty -
        disagreementPenalty -
        (cautionTrap ? 10 : 0) -
        (severeTrap ? 26 : 0) +
        (args.bestPriceFlag ? 8 : 0) +
        (movementState === "stable" ? 4 : 0) -
        (movementState === "violent" ? 8 : 0)
    ),
    0,
    100
  );

  if (severeTrap || args.score < 55 || ev <= 0) {
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

  if (cautionTrap && args.score < 78) {
    return {
      actionState: "WATCH",
      timingState: "MONITOR_ONLY",
      timingQuality
    };
  }

  if (
    args.score >= 86 &&
    ev >= 2 &&
    args.bestPriceFlag &&
    movementState !== "violent" &&
    freshnessPenalty <= 9
  ) {
    timingQuality = Math.max(timingQuality, 84);

    return {
      actionState: "BET_NOW",
      timingState: "WINDOW_OPEN",
      timingQuality
    };
  }

  if (
    args.score >= 78 &&
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
    args.score >= 74 &&
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
    args.score >= 70 &&
    args.bestPriceFlag &&
    movementState === "strong"
  ) {
    return {
      actionState: "WAIT",
      timingState: "WAIT_FOR_CONFIRMATION",
      timingQuality
    };
  }

  if (args.score >= 68) {
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