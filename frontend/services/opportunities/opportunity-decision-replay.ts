import type {
  OpportunityActionState,
  OpportunityTimingState,
  OpportunityView
} from "@/lib/types/opportunity";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

export type OpportunityDecisionReplayOutcome =
  | "CORRECT_AGGRESSIVE"
  | "CORRECT_PATIENT"
  | "CORRECT_PASS"
  | "LATE_ENTRY"
  | "MISSED_STALE_COPY"
  | "WAITED_THROUGH_EDGE"
  | "FALSE_URGENCY"
  | "OVERCAUTIOUS"
  | "INSUFFICIENT_REPLAY_DATA";

export type OpportunityDecisionReplayView = {
  status: "READY" | "INSUFFICIENT_DATA";
  outcome: OpportunityDecisionReplayOutcome;
  replayScore: number | null;
  expectedActionState: OpportunityActionState | null;
  actualActionState: OpportunityActionState;
  expectedTimingState: OpportunityTimingState | null;
  actualTimingState: OpportunityTimingState;
  clvPct: number | null;
  staleCopyConfidence: number | null;
  repricingLikelihood: number | null;
  waitImprovementLikelihood: number | null;
  minutesToClose: number | null;
  notes: string[];
};

export type BuildOpportunityDecisionReplayArgs = {
  actualActionState: OpportunityActionState;
  actualTimingState: OpportunityTimingState;
  clvPct?: number | null;
  staleCopyConfidence?: number | null;
  repricingLikelihood?: number | null;
  waitImprovementLikelihood?: number | null;
  bestPriceStillAvailableAfterMinutes?: number | null;
  minutesToClose?: number | null;
  staleCopyCaptured?: boolean | null;
};

function classifyExpectedAction(args: {
  clvPct: number | null;
  staleCopyConfidence: number;
  repricingLikelihood: number;
  waitImprovementLikelihood: number;
  bestPriceStillAvailableAfterMinutes: number | null;
}): {
  expectedActionState: OpportunityActionState | null;
  expectedTimingState: OpportunityTimingState | null;
  outcome: OpportunityDecisionReplayOutcome;
  baseScore: number | null;
  notes: string[];
} {
  const notes: string[] = [];
  const {
    clvPct,
    staleCopyConfidence,
    repricingLikelihood,
    waitImprovementLikelihood,
    bestPriceStillAvailableAfterMinutes
  } = args;

  if (
    clvPct === null &&
    staleCopyConfidence < 1 &&
    repricingLikelihood < 1 &&
    waitImprovementLikelihood < 1 &&
    bestPriceStillAvailableAfterMinutes === null
  ) {
    return {
      expectedActionState: null,
      expectedTimingState: null,
      outcome: "INSUFFICIENT_REPLAY_DATA",
      baseScore: null,
      notes: ["Replay needs at least CLV or path-quality evidence."]
    };
  }

  const fastExpiry =
    typeof bestPriceStillAvailableAfterMinutes === "number" &&
    bestPriceStillAvailableAfterMinutes <= 3;

  const slowExpiry =
    typeof bestPriceStillAvailableAfterMinutes === "number" &&
    bestPriceStillAvailableAfterMinutes >= 15;

  if (
    staleCopyConfidence >= 70 &&
    (clvPct === null || clvPct >= 0.5 || repricingLikelihood >= 65 || fastExpiry)
  ) {
    notes.push("Replay sees a high-confidence stale-copy window that favored immediate execution.");
    return {
      expectedActionState: "BET_NOW",
      expectedTimingState: "WINDOW_OPEN",
      outcome: "MISSED_STALE_COPY",
      baseScore: 84,
      notes
    };
  }

  if (
    clvPct !== null &&
    clvPct >= 1.25 &&
    (repricingLikelihood >= 60 || fastExpiry)
  ) {
    notes.push("Replay sees a strong positive close path that rewarded immediate entry.");
    return {
      expectedActionState: "BET_NOW",
      expectedTimingState: "WINDOW_OPEN",
      outcome: "LATE_ENTRY",
      baseScore: 80,
      notes
    };
  }

  if (
    waitImprovementLikelihood >= 62 &&
    (clvPct === null || clvPct <= 0.4) &&
    slowExpiry
  ) {
    notes.push("Replay sees a patient entry profile where waiting was likely the better posture.");
    return {
      expectedActionState: "WAIT",
      expectedTimingState: "WAIT_FOR_PULLBACK",
      outcome: "FALSE_URGENCY",
      baseScore: 76,
      notes
    };
  }

  if (
    clvPct !== null &&
    clvPct <= -1.25 &&
    waitImprovementLikelihood >= 55
  ) {
    notes.push("Replay sees negative close performance and enough pullback tendency to justify waiting.");
    return {
      expectedActionState: "WAIT",
      expectedTimingState: "WAIT_FOR_PULLBACK",
      outcome: "FALSE_URGENCY",
      baseScore: 72,
      notes
    };
  }

  if (
    clvPct !== null &&
    clvPct <= -1.5 &&
    repricingLikelihood < 45 &&
    waitImprovementLikelihood < 40
  ) {
    notes.push("Replay sees weak close behavior without urgency support.");
    return {
      expectedActionState: "WATCH",
      expectedTimingState: "MONITOR_ONLY",
      outcome: "OVERCAUTIOUS",
      baseScore: 64,
      notes
    };
  }

  if (
    clvPct !== null &&
    clvPct <= -2.25 &&
    repricingLikelihood < 35 &&
    waitImprovementLikelihood < 30
  ) {
    notes.push("Replay sees a lane that should likely have been passed.");
    return {
      expectedActionState: "PASS",
      expectedTimingState: "PASS_ON_PRICE",
      outcome: "CORRECT_PASS",
      baseScore: 78,
      notes
    };
  }

  notes.push("Replay evidence is mixed and supports a monitor-first posture.");
  return {
    expectedActionState: "WATCH",
    expectedTimingState: "MONITOR_ONLY",
    outcome: "WAITED_THROUGH_EDGE",
    baseScore: 66,
    notes
  };
}

function compareDecision(args: {
  actualActionState: OpportunityActionState;
  actualTimingState: OpportunityTimingState;
  expectedActionState: OpportunityActionState | null;
  expectedTimingState: OpportunityTimingState | null;
  clvPct: number | null;
  staleCopyCaptured: boolean | null;
  notes: string[];
}): {
  outcome: OpportunityDecisionReplayOutcome;
  replayScore: number | null;
  notes: string[];
} {
  const notes = [...args.notes];

  if (!args.expectedActionState || !args.expectedTimingState) {
    return {
      outcome: "INSUFFICIENT_REPLAY_DATA",
      replayScore: null,
      notes
    };
  }

  let score = 60;
  let outcome: OpportunityDecisionReplayOutcome = "INSUFFICIENT_REPLAY_DATA";

  const actionMatches = args.actualActionState === args.expectedActionState;
  const timingMatches = args.actualTimingState === args.expectedTimingState;

  if (actionMatches) {
    score += 18;
    notes.push("Action state matched replay expectation.");
  } else {
    score -= 18;
    notes.push(
      `Action mismatch: replay expected ${args.expectedActionState}, got ${args.actualActionState}.`
    );
  }

  if (timingMatches) {
    score += 10;
    notes.push("Timing state matched replay expectation.");
  } else {
    score -= 10;
    notes.push(
      `Timing mismatch: replay expected ${args.expectedTimingState}, got ${args.actualTimingState}.`
    );
  }

  if (typeof args.clvPct === "number") {
    score += clamp(args.clvPct * 6, -18, 18);
    notes.push(
      args.clvPct >= 0
        ? `Replay includes +${round(args.clvPct)}% CLV support.`
        : `Replay includes ${round(args.clvPct)}% CLV drag.`
    );
  }

  if (args.staleCopyCaptured === true) {
    score += 8;
    notes.push("Historical fill suggests the stale-copy window was captured cleanly.");
  } else if (args.staleCopyCaptured === false) {
    score -= 8;
    notes.push("Historical fill suggests the stale-copy window was missed.");
  }

  score = clamp(Math.round(score), 0, 100);

  if (
    args.expectedActionState === "BET_NOW" &&
    args.actualActionState === "BET_NOW"
  ) {
    outcome = "CORRECT_AGGRESSIVE";
  } else if (
    args.expectedActionState === "WAIT" &&
    args.actualActionState === "WAIT"
  ) {
    outcome = "CORRECT_PATIENT";
  } else if (
    args.expectedActionState === "PASS" &&
    args.actualActionState === "PASS"
  ) {
    outcome = "CORRECT_PASS";
  } else if (
    args.expectedActionState === "BET_NOW" &&
    args.actualActionState === "WAIT"
  ) {
    outcome = "WAITED_THROUGH_EDGE";
  } else if (
    args.expectedActionState === "BET_NOW" &&
    args.actualActionState !== "BET_NOW"
  ) {
    outcome = "LATE_ENTRY";
  } else if (
    args.expectedActionState === "WAIT" &&
    args.actualActionState === "BET_NOW"
  ) {
    outcome = "FALSE_URGENCY";
  } else if (
    args.expectedActionState === "WATCH" &&
    args.actualActionState === "PASS"
  ) {
    outcome = "OVERCAUTIOUS";
  } else {
    outcome = "INSUFFICIENT_REPLAY_DATA";
  }

  if (
    args.expectedActionState === "BET_NOW" &&
    args.staleCopyCaptured === false
  ) {
    outcome = "MISSED_STALE_COPY";
  }

  return {
    outcome,
    replayScore: score,
    notes: notes.slice(0, 5)
  };
}

export function buildOpportunityDecisionReplay(
  args: BuildOpportunityDecisionReplayArgs
): OpportunityDecisionReplayView {
  const clvPct =
    typeof args.clvPct === "number" && Number.isFinite(args.clvPct)
      ? args.clvPct
      : null;

  const staleCopyConfidence = clamp(
    typeof args.staleCopyConfidence === "number" && Number.isFinite(args.staleCopyConfidence)
      ? args.staleCopyConfidence
      : 0,
    0,
    100
  );

  const repricingLikelihood = clamp(
    typeof args.repricingLikelihood === "number" && Number.isFinite(args.repricingLikelihood)
      ? args.repricingLikelihood
      : 0,
    0,
    100
  );

  const waitImprovementLikelihood = clamp(
    typeof args.waitImprovementLikelihood === "number" && Number.isFinite(args.waitImprovementLikelihood)
      ? args.waitImprovementLikelihood
      : 0,
    0,
    100
  );

  const expected = classifyExpectedAction({
    clvPct,
    staleCopyConfidence,
    repricingLikelihood,
    waitImprovementLikelihood,
    bestPriceStillAvailableAfterMinutes:
      typeof args.bestPriceStillAvailableAfterMinutes === "number"
        ? args.bestPriceStillAvailableAfterMinutes
        : null
  });

  const compared = compareDecision({
    actualActionState: args.actualActionState,
    actualTimingState: args.actualTimingState,
    expectedActionState: expected.expectedActionState,
    expectedTimingState: expected.expectedTimingState,
    clvPct,
    staleCopyCaptured:
      typeof args.staleCopyCaptured === "boolean" ? args.staleCopyCaptured : null,
    notes: expected.notes
  });

  return {
    status: expected.expectedActionState ? "READY" : "INSUFFICIENT_DATA",
    outcome: expected.expectedActionState
      ? compared.outcome
      : "INSUFFICIENT_REPLAY_DATA",
    replayScore: expected.expectedActionState ? compared.replayScore : null,
    expectedActionState: expected.expectedActionState,
    actualActionState: args.actualActionState,
    expectedTimingState: expected.expectedTimingState,
    actualTimingState: args.actualTimingState,
    clvPct,
    staleCopyConfidence: staleCopyConfidence || null,
    repricingLikelihood: repricingLikelihood || null,
    waitImprovementLikelihood: waitImprovementLikelihood || null,
    minutesToClose:
      typeof args.minutesToClose === "number" && Number.isFinite(args.minutesToClose)
        ? args.minutesToClose
        : null,
    notes: expected.expectedActionState ? compared.notes : expected.notes
  };
}

export function buildOpportunityDecisionReplayFromView(
  opportunity: OpportunityView
): OpportunityDecisionReplayView {
  return buildOpportunityDecisionReplay({
    actualActionState: opportunity.actionState,
    actualTimingState: opportunity.timingState,
    clvPct: opportunity.executionContext?.clvPct ?? null,
    staleCopyConfidence:
      opportunity.marketMicrostructure.status === "APPLIED"
        ? opportunity.marketMicrostructure.staleCopyConfidence
        : opportunity.marketPath?.staleCopyConfidence ?? null,
    repricingLikelihood:
      opportunity.marketMicrostructure.status === "APPLIED"
        ? opportunity.marketMicrostructure.repricingLikelihood
        : null,
    waitImprovementLikelihood:
      opportunity.marketMicrostructure.status === "APPLIED"
        ? opportunity.marketMicrostructure.waitImprovementLikelihood
        : null,
    minutesToClose: opportunity.executionContext?.timeToCloseMinutes ?? null,
    staleCopyCaptured: opportunity.executionContext?.staleCopyCaptured ?? null
  });
}