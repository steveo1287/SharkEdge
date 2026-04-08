import type { ReasonAttributionView } from "@/lib/types/domain";
import type {
  MarketEfficiencyClass,
  OpportunityBookLeadershipView,
  OpportunityCloseDestinationView,
  OpportunityEdgeDecayView,
  OpportunityExecutionCapacityView,
  OpportunityExecutionContextView,
  OpportunityMarketMicrostructureView,
  OpportunityReasonCalibrationView,
  OpportunitySourceQuality,
  OpportunityTimingReplayView,
  OpportunityTrapFlag,
  OpportunityTruthCalibrationView,
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

function describeCalibration(calibration: OpportunityTruthCalibrationView) {
  if (calibration.status === "APPLIED") {
    const parts = [
      `Historical close truth is nudging the lane ${calibration.scoreDelta >= 0 ? "+" : ""}${calibration.scoreDelta} score`,
      calibration.timingDelta !== 0
        ? `with ${calibration.timingDelta >= 0 ? "+" : ""}${calibration.timingDelta} timing`
        : null,
      calibration.sourceWeightDelta !== 0
        ? `and ${calibration.sourceWeightDelta >= 0 ? "+" : ""}${calibration.sourceWeightDelta.toFixed(2)} source weight`
        : null
    ].filter(Boolean);

    return `${parts.join(" ")} from qualified close samples`;
  }

  if (calibration.status === "SKIPPED_INSUFFICIENT_SAMPLE") {
    return "Calibration is parked because similar spots have not closed enough samples yet";
  }

  if (calibration.status === "SKIPPED_NEUTRAL") {
    return "Close history for similar spots is flat enough that calibration stayed neutral";
  }

  return "No matching close-history lane was strong enough to change this call";
}

function describeReasonCalibration(calibration: OpportunityReasonCalibrationView) {
  if (calibration.status === "APPLIED") {
    const appliedLabels = calibration.applied
      .slice(0, 2)
      .map((item) => item.label)
      .join(", ");

    return `Reason-level truth nudged the setup ${calibration.scoreDelta >= 0 ? "+" : ""}${calibration.scoreDelta} score and ${calibration.timingDelta >= 0 ? "+" : ""}${calibration.timingDelta} timing from ${appliedLabels}.`;
  }

  if (calibration.status === "SKIPPED_INSUFFICIENT_SAMPLE") {
    return "Reason-level truth stayed neutral because the exact explanation lanes do not have enough closed history yet.";
  }

  if (calibration.status === "SKIPPED_NEUTRAL") {
    return "Reason-level truth qualified but stayed neutral because similar explanation lanes are close to flat.";
  }

  return "Reason-level truth is neutral because this exact explanation pattern does not have useful close history yet.";
}

function describeTimingReplay(timingReplay: OpportunityTimingReplayView) {
  if (timingReplay.status !== "APPLIED") {
    return timingReplay.summary;
  }

  if (timingReplay.bias === "STRENGTHEN_BET_NOW") {
    return "Replay truth supports betting now because similar spots beat close or die fast too often to watch passively.";
  }

  if (timingReplay.bias === "STRENGTHEN_WAIT") {
    return "Replay truth supports waiting because similar spots improve before close often enough to avoid forcing entry.";
  }

  if (timingReplay.bias === "DEMOTE_WATCH") {
    return "Replay truth says watch posture is too passive here because similar spots miss the window too often.";
  }

  return "Replay truth stayed near neutral for this timing lane.";
}

function describeMicrostructure(microstructure: OpportunityMarketMicrostructureView) {
  if (microstructure.status !== "APPLIED") {
    return microstructure.summary;
  }

  if (microstructure.regime === "STALE_COPY") {
    return `Market path reads as stale copy with ${microstructure.staleCopyConfidence}% confidence and roughly ${microstructure.estimatedHalfLifeMinutes ?? "n/a"}m half-life`;
  }

  if (microstructure.regime === "LEADER_CONFIRMED") {
    return `Leader-confirmed move with urgency ${microstructure.urgencyScore} and repricing likelihood ${microstructure.repricingLikelihood}%`;
  }

  if (microstructure.decayRiskBucket === "IMPROVEMENT_PRONE") {
    return `Path looks improvement-prone, so waiting carries ${microstructure.waitImprovementLikelihood}% pullback likelihood`;
  }

  return microstructure.summary;
}

function describeBookLeadership(bookLeadership: OpportunityBookLeadershipView) {
  if (bookLeadership.status !== "APPLIED") {
    return bookLeadership.notes[0] ?? "Book lane history stayed neutral.";
  }

  if (bookLeadership.role === "LEADER" || bookLeadership.role === "CONFIRMER") {
    return `Lane history says this book matters here: ${bookLeadership.role.toLowerCase()} behavior with ${bookLeadership.surfaced}/${bookLeadership.closed} qualified samples.`;
  }

  if (bookLeadership.role === "LAGGER") {
    return `Lane history treats this book as a lagger, so the price can be executable even when it is not a signal source.`;
  }

  if (bookLeadership.role === "OUTLIER") {
    return "Lane history treats this book as noisy in this market, so source trust stays capped.";
  }

  return bookLeadership.notes[0] ?? "Lane history is present but not decisive.";
}

function describeCloseDestination(closeDestination: OpportunityCloseDestinationView) {
  if (closeDestination.status !== "APPLIED") {
    return closeDestination.notes[0] ?? "Close destination stayed neutral.";
  }

  return `Close destination reads ${closeDestination.label.toLowerCase().replace(/_/g, " ")} with ${closeDestination.confidence.toLowerCase()} confidence.`;
}

function describeExecutionCapacity(executionCapacity: OpportunityExecutionCapacityView) {
  return `Execution capacity looks ${executionCapacity.label.toLowerCase().replace(/_/g, " ")} with score ${executionCapacity.capacityScore}.`;
}

function describeSizing(sizing: PositionSizingGuidance) {
  if (sizing.recommendedStake <= 0) {
    return sizing.reasonCodes.includes("ACTION_WAIT_NO_ALLOCATION")
      ? "Capital stays uncommitted because the desk posture is wait, not hit."
      : "Allocator keeps stake at zero because the edge is too fragile after risk controls.";
  }

  const parts = [
    `${sizing.label} stake at ${sizing.bankrollPct.toFixed(2)}% of bankroll`,
    `Kelly cut from ${(sizing.baseKellyFraction * 100).toFixed(2)}% to ${(sizing.adjustedKellyFraction * 100).toFixed(2)}%`
  ];

  if (sizing.correlationPenalty < 0.99) {
    parts.push(`correlation clipped size to ${(sizing.correlationPenalty * 100).toFixed(0)}%`);
  }

  if (sizing.competitionPenalty < 0.99) {
    parts.push(`better capital use elsewhere clipped size to ${(sizing.competitionPenalty * 100).toFixed(0)}%`);
  }

  return `${parts.join("; ")}.`;
}

function describeExecution(executionContext: OpportunityExecutionContextView | null | undefined) {
  if (!executionContext || executionContext.status !== "HISTORICAL") {
    return "Execution history is neutral here, so size leans on current edge quality rather than prior fills.";
  }

  if (executionContext.classification === "EXCELLENT_ENTRY") {
    return `Historical execution has been strong here: ${executionContext.entryQualityLabel.toLowerCase()} with score ${executionContext.executionScore}.`;
  }

  if (executionContext.classification === "MISSED_OPPORTUNITY") {
    return "Similar entries have missed the best price before, so execution quality is a real risk on this lane.";
  }

  return `Historical execution is ${executionContext.entryQualityLabel.toLowerCase()} with score ${executionContext.executionScore}.`;
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
  executionContext?: OpportunityExecutionContextView | null;
  truthCalibration: OpportunityTruthCalibrationView;
  reasonCalibration: OpportunityReasonCalibrationView;
  marketMicrostructure: OpportunityMarketMicrostructureView;
  bookLeadership: OpportunityBookLeadershipView;
  closeDestination: OpportunityCloseDestinationView;
  executionCapacity: OpportunityExecutionCapacityView;
  timingReplay: OpportunityTimingReplayView;
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
  const calibrationLine = describeCalibration(args.truthCalibration);
  const reasonCalibrationLine = describeReasonCalibration(args.reasonCalibration);
  const microstructureLine = describeMicrostructure(args.marketMicrostructure);
  const bookLeadershipLine = describeBookLeadership(args.bookLeadership);
  const closeDestinationLine = describeCloseDestination(args.closeDestination);
  const executionCapacityLine = describeExecutionCapacity(args.executionCapacity);
  const timingReplayLine = describeTimingReplay(args.timingReplay);
  const sizingLine = describeSizing(args.sizing);
  const executionLine = describeExecution(args.executionContext);
  const reasonDetails = getReasonDetail(args.reasons);

  const whyItShows = [
    marketProblem,
    whyNumberExists,
    confirmation,
    microstructureLine,
    bookLeadershipLine,
    closeDestinationLine,
    executionCapacityLine,
    calibrationLine,
    reasonCalibrationLine,
    timingReplayLine,
    sizingLine,
    executionLine,
    decayLine,
    ...reasonDetails
  ].filter(Boolean);

  const whatCouldKillIt = [
    ...args.trapFlags.slice(0, 2).map((flag) => `${formatTrap(flag)}.`),
    args.truthCalibration.trapEscalation
      ? "Historical close results are weak for this pattern, so the trap posture is tighter than normal."
      : null,
    args.reasonCalibration.trapEscalation
      ? "Reason-level truth says this exact explanation stack underperforms, so the trap posture is tighter than normal."
      : null,
    args.marketMicrostructure.trapEscalation
      ? "Market-path structure looks noisy enough that the trap gate is tighter than the static heuristics alone."
      : null,
    args.closeDestination.status === "APPLIED" &&
    args.closeDestination.label === "MOSTLY_PRICED"
      ? "Close-destination guidance says most of the edge is already priced, so chasing this number is dangerous."
      : null,
    args.closeDestination.status === "APPLIED" &&
    args.closeDestination.label === "IMPROVE"
      ? "Replay and destination guidance say better entry often develops later in this lane."
      : null,
    args.timingReplay.status === "APPLIED" &&
    args.timingReplay.bias === "DEMOTE_WATCH"
      ? "Replay truth says sitting in watch mode usually misses this window."
      : null,
    args.executionCapacity.label === "SCREEN_VALUE_ONLY"
      ? "Displayed edge looks more like screen value than a scalable bet."
      : null,
    args.executionCapacity.label === "FRAGILE_STALE"
      ? "Execution window is real but fragile, so size has to stay small even if the path is right."
      : null,
    args.sizing.correlationPenalty < 0.99
      ? "Existing exposure in the same risk cluster is already large enough to force a smaller size."
      : null,
    args.sizing.competitionPenalty < 0.99
      ? "Better capital efficiency exists elsewhere on the board, so this gets downsized before it gets crowded."
      : null,
    args.executionContext?.status === "HISTORICAL" && args.executionContext.missedEdge
      ? "Past fills on similar spots missed the best screen, so execution discipline matters as much as selection."
      : null,
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
    `${args.sizing.label} sizing at ${args.sizing.bankrollPct.toFixed(2)}%`,
    formatTimingLabel(args.timingState),
    args.marketMicrostructure.status === "APPLIED"
      ? `${args.marketMicrostructure.regime.toLowerCase().replace(/_/g, " ")}`
      : null,
    args.closeDestination.status === "APPLIED"
      ? `destination ${args.closeDestination.label.toLowerCase().replace(/_/g, " ")}`
      : null,
    args.executionCapacity.status === "APPLIED"
      ? `${args.executionCapacity.label.toLowerCase().replace(/_/g, " ")}`
      : null,
    args.truthCalibration.status === "APPLIED"
      ? `calibrated ${args.truthCalibration.scoreDelta >= 0 ? "+" : ""}${args.truthCalibration.scoreDelta}`
      : null,
    args.reasonCalibration.status === "APPLIED"
      ? `reason truth ${args.reasonCalibration.scoreDelta >= 0 ? "+" : ""}${args.reasonCalibration.scoreDelta}`
      : null,
    args.timingReplay.status === "APPLIED"
      ? `replay ${args.timingReplay.bias.toLowerCase().replace(/_/g, " ")}`
      : null
  ]
    .filter((item): item is string => Boolean(item))
    .join(". ");

  return {
    whyItShows: whyItShows.slice(0, 3).map((item) => shorten(item, 88)),
    whatCouldKillIt: whatCouldKillIt.slice(0, 3).map((item) => shorten(item, 92)),
    reasonSummary: `${summary}.`
  };
}
