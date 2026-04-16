import type {
  BetSignalView,
  BoardMarketView,
  GameCardView,
  MarketPathView,
  PropCardView,
  ProviderHealthView,
  ReasonAttributionView
} from "@/lib/types/domain";
import type { PerformanceDashboardView } from "@/lib/types/ledger";
import type {
  OpportunityConfidenceTier,
  OpportunityHomeSnapshot,
  OpportunityKind,
  OpportunityProfile,
  OpportunityView
} from "@/lib/types/opportunity";
import {
  buildOpportunityBookLeadershipSummary,
  createOpportunityBookLeadershipResolver,
  type OpportunityBookLeadershipResolver
} from "@/services/opportunities/opportunity-book-leadership";
import {
  buildOpportunityCloseDestinationSummary,
  createOpportunityCloseDestinationResolver,
  type OpportunityCloseDestinationResolver
} from "@/services/opportunities/opportunity-close-destination";
import {
  buildOpportunityExecutionCapacity,
  buildOpportunityExecutionCapacitySummary
} from "@/services/opportunities/opportunity-execution-capacity";
import { buildOpportunityExplanation } from "@/services/opportunities/opportunity-explainer";
import { buildOpportunityEdgeDecay } from "@/services/opportunities/opportunity-edge-decay";
import {
  classifyMarketEfficiency,
  evaluateMarketSourceQuality,
  getMarketEfficiencyScore
} from "@/services/opportunities/opportunity-market-model";
import {
  createOpportunityMarketPathResolver,
  type OpportunityMarketPathResolver
} from "@/services/opportunities/opportunity-market-path";
import {
  buildOpportunityPersonalization,
  buildOpportunityProfile
} from "@/services/opportunities/opportunity-personalization";
import {
  createOpportunityPortfolioAllocator,
  type OpportunityPortfolioAllocator
} from "@/services/opportunities/opportunity-portfolio";
import {
  createOpportunityReasonCalibrationResolver,
  type OpportunityReasonCalibrationResolver
} from "@/services/opportunities/opportunity-reason-calibration";
import { buildOpportunityRanking } from "@/services/opportunities/opportunity-ranking";
import { buildOpportunityScore } from "@/services/opportunities/opportunity-scoring";
import { buildOpportunityProbabilityFusion } from "@/services/opportunities/opportunity-probability-fusion";
import { buildPositionSizingGuidance } from "@/services/opportunities/opportunity-sizing";
import { applyOpportunitySurfacing } from "@/services/opportunities/opportunity-surfacing";
import { buildOpportunityTiming } from "@/services/opportunities/opportunity-timing";
import {
  createOpportunityTimingReplayResolver,
  type OpportunityTimingReplayResolver
} from "@/services/opportunities/opportunity-timing-review";
import {
  createOpportunityTruthCalibrationResolver,
  type OpportunityTruthCalibrationResolver
} from "@/services/opportunities/opportunity-truth-calibration";
import { buildOpportunityTrapFlags } from "@/services/opportunities/opportunity-traps";
import { getMarketPathRole } from "@/services/market/market-path-service";

const neutralTruthCalibrationResolver = createOpportunityTruthCalibrationResolver();
const neutralMarketPathResolver = createOpportunityMarketPathResolver();
const neutralBookLeadershipResolver = createOpportunityBookLeadershipResolver();
const neutralCloseDestinationResolver = createOpportunityCloseDestinationResolver();
const neutralReasonCalibrationResolver = createOpportunityReasonCalibrationResolver();
const neutralTimingReplayResolver = createOpportunityTimingReplayResolver();
const neutralPortfolioAllocator = createOpportunityPortfolioAllocator();

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number | null | undefined, digits = 2) {
  return typeof value === "number" ? Number(value.toFixed(digits)) : null;
}

function getConfidenceTier(
  score: number,
  trapFlags: string[]
): OpportunityConfidenceTier {
  if (trapFlags.includes("STALE_EDGE") || trapFlags.includes("LOW_PROVIDER_HEALTH")) {
    return score >= 72 ? "B" : score >= 58 ? "C" : "D";
  }

  if (trapFlags.includes("ONE_BOOK_OUTLIER") || trapFlags.includes("FAKE_MOVE_RISK")) {
    return score >= 86 ? "B" : score >= 70 ? "C" : "D";
  }

  if (score >= 88) {
    return "A";
  }

  if (score >= 74) {
    return "B";
  }

  if (score >= 60) {
    return "C";
  }

  return "D";
}

function supportScoreFromReasons(args: {
  reasons: ReasonAttributionView[];
  bestPriceFlag: boolean;
  bookCount: number;
  marketDisagreementScore: number | null;
  freshnessMinutes: number | null;
  sourceQualityScore: number;
}) {
  let total = args.reasons.slice(0, 3).reduce((score, reason) => {
    if (reason.category === "market_edge" || reason.category === "trend_support") {
      return score + 4;
    }

    if (reason.category === "model_edge" || reason.category === "momentum_edge") {
      return score + 3;
    }

    return score + 1;
  }, 0);

  total += clamp(args.sourceQualityScore * 0.08, 0, 6);

  if (
    args.bestPriceFlag &&
    args.bookCount >= 4 &&
    (args.marketDisagreementScore ?? 0) <= 0.08
  ) {
    total += 2;
  }

  if (args.freshnessMinutes !== null && args.freshnessMinutes <= 8) {
    total += 1;
  }

  return total;
}

function getProviderFreshnessMinutes(args: {
  providerHealth?: ProviderHealthView | null;
  snapshotAgeSeconds?: number | null;
}) {
  if (typeof args.snapshotAgeSeconds === "number") {
    return Math.round(args.snapshotAgeSeconds / 60);
  }

  return args.providerHealth?.freshnessMinutes ?? null;
}

function getConfidencePriority(confidenceTier: OpportunityConfidenceTier) {
  if (confidenceTier === "A") {
    return 4;
  }

  if (confidenceTier === "B") {
    return 3;
  }

  if (confidenceTier === "C") {
    return 2;
  }

  return 1;
}

type BaseOpportunityArgs = {
  id: string;
  kind: OpportunityKind;
  league: OpportunityView["league"];
  eventId: string;
  eventLabel: string;
  marketType: string;
  selectionLabel: string;
  sportsbookKey: string | null;
  sportsbookName: string | null;
  displayOddsAmerican: number | null;
  displayLine: string | number | null;
  fairPriceAmerican: number | null;
  fairPriceMethod: OpportunityView["fairPriceMethod"];
  expectedValuePct: number | null;
  marketDeltaAmerican: number | null;
  consensusImpliedProbability: number | null;
  marketDisagreementScore: number | null;
  providerHealth?: ProviderHealthView | null;
  snapshotAgeSeconds?: number | null;
  staleFlag: boolean;
  bookCount: number;
  lineMovement: number | null;
  edgeScore: number;
  confidenceScore: number;
  qualityScore: number;
  fairLineGap: number | null;
  bestPriceFlag: boolean;
  reasons: ReasonAttributionView[];
  sourceNote: string;
  truthClassification: OpportunityView["truthClassification"];
  marketPath?: MarketPathView | null;
  profile?: OpportunityProfile | null;
  truthCalibrationResolver?: OpportunityTruthCalibrationResolver | null;
  marketPathResolver?: OpportunityMarketPathResolver | null;
  bookLeadershipResolver?: OpportunityBookLeadershipResolver | null;
  closeDestinationResolver?: OpportunityCloseDestinationResolver | null;
  reasonCalibrationResolver?: OpportunityReasonCalibrationResolver | null;
  timingReplayResolver?: OpportunityTimingReplayResolver | null;
  conflictSignal?: boolean;
};

function buildOpportunity(args: BaseOpportunityArgs): OpportunityView {
  const truthCalibrationResolver =
    args.truthCalibrationResolver ?? neutralTruthCalibrationResolver;
  const marketPathResolver = args.marketPathResolver ?? neutralMarketPathResolver;
  const bookLeadershipResolver =
    args.bookLeadershipResolver ?? neutralBookLeadershipResolver;
  const closeDestinationResolver =
    args.closeDestinationResolver ?? neutralCloseDestinationResolver;
  const reasonCalibrationResolver =
    args.reasonCalibrationResolver ?? neutralReasonCalibrationResolver;
  const timingReplayResolver =
    args.timingReplayResolver ?? neutralTimingReplayResolver;
  const providerFreshnessMinutes = getProviderFreshnessMinutes({
    providerHealth: args.providerHealth,
    snapshotAgeSeconds: args.snapshotAgeSeconds
  });
  const offeredMarketPathRole = getMarketPathRole(
    args.marketPath ?? null,
    args.sportsbookKey
  );
  const marketEfficiency = classifyMarketEfficiency({
    league: args.league,
    marketType: args.marketType,
    bookCount: args.bookCount,
    disagreementScore: args.marketDisagreementScore,
    lineMovement: args.lineMovement,
    sportsbookKey: args.sportsbookKey,
    sportsbookName: args.sportsbookName
  });
  const baseSourceQuality = evaluateMarketSourceQuality({
    league: args.league,
    marketType: args.marketType,
    sportsbookKey: args.sportsbookKey,
    sportsbookName: args.sportsbookName,
    bookCount: args.bookCount,
    disagreementScore: args.marketDisagreementScore,
    bestPriceFlag: args.bestPriceFlag,
    freshnessMinutes: providerFreshnessMinutes,
    marketPathRole: offeredMarketPathRole,
    marketPathNote: args.marketPath?.notes[0] ?? null
  });
  const edgeDecay = buildOpportunityEdgeDecay({
    expectedValuePct: args.expectedValuePct,
    fairLineGap: args.fairLineGap,
    providerFreshnessMinutes,
    snapshotAgeSeconds: args.snapshotAgeSeconds,
    lineMovement: args.lineMovement,
    bestPriceFlag: args.bestPriceFlag,
    marketEfficiency
  });

  const trapFlags = buildOpportunityTrapFlags({
    fairPrice: args.fairPriceMethod
      ? ({
          pricingConfidenceScore: args.confidenceScore
        } as any)
      : null,
    marketIntelligence: {
      staleFlag: args.staleFlag,
      marketDisagreementScore: args.marketDisagreementScore ?? 0,
      bestPriceFlag: args.bestPriceFlag
    } as any,
    marketTruth: {
      bookCount: args.bookCount,
      stale: args.staleFlag,
      disagreementPct:
        typeof args.marketDisagreementScore === "number"
          ? args.marketDisagreementScore * 100
          : null,
      movementStrength: args.lineMovement === null ? null : Math.abs(args.lineMovement),
      classification: args.truthClassification
    } as any,
    providerHealth: args.providerHealth,
    marketPath: args.marketPath ?? null,
    bookCount: args.bookCount,
    lineMovement: args.lineMovement,
    conflictSignal: args.conflictSignal
  });

  const provisionalTiming = buildOpportunityTiming({
    score: clamp(args.edgeScore, 0, 100),
    expectedValuePct: args.expectedValuePct,
    lineMovement: args.lineMovement,
    bestPriceFlag: args.bestPriceFlag,
    freshnessMinutes: providerFreshnessMinutes,
    trapFlags,
    disagreementScore: args.marketDisagreementScore,
    marketEfficiency,
    edgeDecayPenalty: edgeDecay.penalty
  });

  const personalizationAdjustments = buildOpportunityPersonalization({
    opportunity: {
      league: args.league,
      marketType: args.marketType,
      sportsbookName: args.sportsbookName,
      timingState: provisionalTiming.timingState
    } as OpportunityView,
    profile: args.profile
  });

  const personalizationDelta = personalizationAdjustments.reduce(
    (total, item) => total + item.delta,
    0
  );

  const baseSupportScore = supportScoreFromReasons({
    reasons: args.reasons,
    bestPriceFlag: args.bestPriceFlag,
    bookCount: args.bookCount,
    marketDisagreementScore: args.marketDisagreementScore,
    freshnessMinutes: providerFreshnessMinutes,
    sourceQualityScore: baseSourceQuality.score
  });

  const baseScoring = buildOpportunityScore({
    expectedValuePct: args.expectedValuePct,
    fairLineGap: args.fairLineGap,
    edgeScore: args.edgeScore,
    confidenceScore: args.confidenceScore,
    qualityScore: args.qualityScore,
    disagreementScore: args.marketDisagreementScore,
    freshnessMinutes: providerFreshnessMinutes,
    bookCount: args.bookCount,
    timingQuality: provisionalTiming.timingQuality,
    supportScore: baseSupportScore,
    sourceQualityScore: baseSourceQuality.score,
    marketEfficiencyScore: getMarketEfficiencyScore(marketEfficiency),
    edgeDecayPenalty: edgeDecay.penalty,
    truthCalibrationScoreDelta: 0,
    marketPathScoreDelta: 0,
    closeDestinationScoreDelta: 0,
    executionCapacityScoreDelta: 0,
    posteriorEdgePct: null,
    uncertaintyPenalty: null,
    trapFlags,
    personalizationDelta
  });

  const baseTiming = buildOpportunityTiming({
    score: baseScoring.score,
    expectedValuePct: args.expectedValuePct,
    lineMovement: args.lineMovement,
    bestPriceFlag: args.bestPriceFlag,
    freshnessMinutes: providerFreshnessMinutes,
    trapFlags,
    disagreementScore: args.marketDisagreementScore,
    marketEfficiency,
    edgeDecayPenalty: edgeDecay.penalty
  });
  const baseConfidenceTier = getConfidenceTier(baseScoring.score, trapFlags);
  const truthCalibration = truthCalibrationResolver.resolve({
    league: args.league,
    marketType: args.marketType,
    sportsbookKey: args.sportsbookKey,
    sportsbookName: args.sportsbookName,
    timingState: baseTiming.timingState,
    actionState: baseTiming.actionState,
    confidenceTier: baseConfidenceTier,
    trapFlags,
    sourceHealthState: args.providerHealth?.state ?? "HEALTHY",
    baseScore: baseScoring.score,
    baseTimingQuality: baseTiming.timingQuality
  });
  const marketMicrostructure = marketPathResolver.resolve({
    league: args.league,
    marketType: args.marketType,
    sportsbookKey: args.sportsbookKey,
    sportsbookName: args.sportsbookName,
    actionState: baseTiming.actionState,
    timingState: baseTiming.timingState,
    marketEfficiency,
    bookCount: args.bookCount,
    bestPriceFlag: args.bestPriceFlag,
    marketDisagreementScore: args.marketDisagreementScore,
    providerFreshnessMinutes,
    lineMovement: args.lineMovement,
    trapFlags,
    marketPath: args.marketPath ?? null
  });
  const bookLeadership = bookLeadershipResolver.resolve({
    league: args.league,
    marketType: args.marketType,
    marketEfficiency,
    sportsbookKey: args.sportsbookKey,
    sportsbookName: args.sportsbookName,
    marketPath: args.marketPath ?? null
  });
  const sourceQuality = evaluateMarketSourceQuality({
    league: args.league,
    marketType: args.marketType,
    sportsbookKey: args.sportsbookKey,
    sportsbookName: args.sportsbookName,
    bookCount: args.bookCount,
    disagreementScore: args.marketDisagreementScore,
    bestPriceFlag: args.bestPriceFlag,
    freshnessMinutes: providerFreshnessMinutes,
    truthAdjustment: truthCalibration.sourceWeightDelta,
    marketPathAdjustment: marketMicrostructure.sourceWeightDelta,
    leadershipAdjustment: bookLeadership.influenceAdjustment,
    marketPathRole: offeredMarketPathRole,
    marketPathNote: marketMicrostructure.reasons[0] ?? args.marketPath?.notes[0] ?? null
  });
  const closeDestination = closeDestinationResolver.resolve({
    league: args.league,
    marketType: args.marketType,
    marketEfficiency,
    bestPriceFlag: args.bestPriceFlag,
    marketDisagreementScore: args.marketDisagreementScore,
    providerFreshnessMinutes,
    sourceHealthState: args.providerHealth?.state ?? "HEALTHY",
    marketPath: args.marketPath ?? null,
    marketMicrostructure,
    bookLeadership
  });
  const executionCapacity = buildOpportunityExecutionCapacity({
    marketType: args.marketType,
    marketEfficiency,
    bookCount: args.bookCount,
    bestPriceFlag: args.bestPriceFlag,
    providerFreshnessMinutes,
    sourceHealthState: args.providerHealth?.state ?? "HEALTHY",
    marketDisagreementScore: args.marketDisagreementScore,
    sourceQualityScore: sourceQuality.score,
    marketMicrostructure,
    bookLeadership,
    closeDestination
  });
  const supportScore = supportScoreFromReasons({
    reasons: args.reasons,
    bestPriceFlag: args.bestPriceFlag,
    bookCount: args.bookCount,
    marketDisagreementScore: args.marketDisagreementScore,
    freshnessMinutes: providerFreshnessMinutes,
    sourceQualityScore: sourceQuality.score
  });
  const preReasonScoring = buildOpportunityScore({
    expectedValuePct: args.expectedValuePct,
    fairLineGap: args.fairLineGap,
    edgeScore: args.edgeScore,
    confidenceScore: args.confidenceScore,
    qualityScore: args.qualityScore,
    disagreementScore: args.marketDisagreementScore,
    freshnessMinutes: providerFreshnessMinutes,
    bookCount: args.bookCount,
    timingQuality: provisionalTiming.timingQuality,
    supportScore,
    sourceQualityScore: sourceQuality.score,
    marketEfficiencyScore: getMarketEfficiencyScore(marketEfficiency),
    edgeDecayPenalty: edgeDecay.penalty,
    truthCalibrationScoreDelta: truthCalibration.scoreDelta,
    reasonCalibrationScoreDelta: 0,
    marketPathScoreDelta: marketMicrostructure.scoreDelta,
    closeDestinationScoreDelta: closeDestination.scoreDelta,
    executionCapacityScoreDelta: executionCapacity.rankingDelta,
    posteriorEdgePct: null,
    uncertaintyPenalty: null,
    trapFlags,
    personalizationDelta
  });
  const preReasonTiming = buildOpportunityTiming({
    score: preReasonScoring.score,
    expectedValuePct: args.expectedValuePct,
    lineMovement: args.lineMovement,
    bestPriceFlag: args.bestPriceFlag,
    freshnessMinutes: providerFreshnessMinutes,
    trapFlags,
    disagreementScore: args.marketDisagreementScore,
    marketEfficiency,
    edgeDecayPenalty: edgeDecay.penalty,
    truthTimingDelta: truthCalibration.timingDelta,
    calibrationTrapEscalation: truthCalibration.trapEscalation,
    marketPathTimingDelta: marketMicrostructure.timingDelta,
    marketPathExecutionHint: args.marketPath?.executionHint,
    marketPathStaleCopyConfidence: args.marketPath?.staleCopyConfidence,
    marketPathRepricingLikelihood: marketMicrostructure.repricingLikelihood,
    marketPathWaitImprovementLikelihood: marketMicrostructure.waitImprovementLikelihood,
    marketPathTrapEscalation: marketMicrostructure.trapEscalation,
    closeDestinationLabel: closeDestination.label,
    closeDestinationConfidence: closeDestination.confidence,
    closeDestinationTimingDelta: closeDestination.timingDelta,
    executionCapacityLabel: executionCapacity.label,
    executionCapacityTimingDelta: executionCapacity.timingDelta
  });
  const preReasonConfidenceTier = getConfidenceTier(preReasonScoring.score, trapFlags);
  const reasonCalibration = reasonCalibrationResolver.resolve({
    league: args.league,
    marketType: args.marketType,
    marketEfficiency,
    bestPriceFlag: args.bestPriceFlag,
    bookCount: args.bookCount,
    marketDisagreementScore: args.marketDisagreementScore,
    sourceQualityScore: sourceQuality.score,
    trapFlags,
    actionState: preReasonTiming.actionState,
    timingState: preReasonTiming.timingState,
    marketPathRegime: args.marketPath?.regime ?? marketMicrostructure.regime,
    staleCopyConfidence:
      args.marketPath?.staleCopyConfidence ?? marketMicrostructure.staleCopyConfidence,
    closeDestinationLabel: closeDestination.label,
    executionCapacityLabel: executionCapacity.label,
    baseScore: preReasonScoring.score,
    baseTimingQuality: preReasonTiming.timingQuality
  });
  const calibratedSourceQuality = evaluateMarketSourceQuality({
    league: args.league,
    marketType: args.marketType,
    sportsbookKey: args.sportsbookKey,
    sportsbookName: args.sportsbookName,
    bookCount: args.bookCount,
    disagreementScore: args.marketDisagreementScore,
    bestPriceFlag: args.bestPriceFlag,
    freshnessMinutes: providerFreshnessMinutes,
    truthAdjustment: truthCalibration.sourceWeightDelta + reasonCalibration.sourceWeightDelta,
    marketPathAdjustment: marketMicrostructure.sourceWeightDelta,
    leadershipAdjustment: bookLeadership.influenceAdjustment,
    marketPathRole: offeredMarketPathRole,
    marketPathNote: marketMicrostructure.reasons[0] ?? args.marketPath?.notes[0] ?? null
  });
  const calibratedSupportScore = supportScoreFromReasons({
    reasons: args.reasons,
    bestPriceFlag: args.bestPriceFlag,
    bookCount: args.bookCount,
    marketDisagreementScore: args.marketDisagreementScore,
    freshnessMinutes: providerFreshnessMinutes,
    sourceQualityScore: calibratedSourceQuality.score
  });
  const timingReplay = timingReplayResolver.resolve({
    league: args.league,
    marketType: args.marketType,
    marketPathRegime: args.marketPath?.regime ?? marketMicrostructure.regime,
    staleCopyConfidence:
      args.marketPath?.staleCopyConfidence ?? marketMicrostructure.staleCopyConfidence,
    actionState: preReasonTiming.actionState,
    timingState: preReasonTiming.timingState,
    confidenceTier: preReasonConfidenceTier,
    reasonLanes: reasonCalibration.reasonLanes
  });
  const probabilityFusion = buildOpportunityProbabilityFusion({
    fairPriceAmerican: args.fairPriceAmerican,
    marketProbability: args.consensusImpliedProbability,
    expectedValuePct: args.expectedValuePct,
    reasons: args.reasons,
    trapFlags,
    confidenceScore: args.confidenceScore,
    marketEfficiency,
    truthCalibrationScoreDelta: truthCalibration.scoreDelta,
    reasonCalibrationScoreDelta: reasonCalibration.scoreDelta,
    marketPathScoreDelta: marketMicrostructure.scoreDelta
  });

  const scoring = buildOpportunityScore({
    expectedValuePct: args.expectedValuePct,
    fairLineGap: args.fairLineGap,
    edgeScore: args.edgeScore,
    confidenceScore: args.confidenceScore,
    qualityScore: args.qualityScore,
    disagreementScore: args.marketDisagreementScore,
    freshnessMinutes: providerFreshnessMinutes,
    bookCount: args.bookCount,
    timingQuality: preReasonTiming.timingQuality,
    supportScore: calibratedSupportScore,
    sourceQualityScore: calibratedSourceQuality.score,
    marketEfficiencyScore: getMarketEfficiencyScore(marketEfficiency),
    edgeDecayPenalty: edgeDecay.penalty,
    truthCalibrationScoreDelta: truthCalibration.scoreDelta,
    reasonCalibrationScoreDelta: reasonCalibration.scoreDelta,
    marketPathScoreDelta: marketMicrostructure.scoreDelta,
    closeDestinationScoreDelta: closeDestination.scoreDelta,
    executionCapacityScoreDelta: executionCapacity.rankingDelta,
    posteriorEdgePct: probabilityFusion.posteriorEdgePct,
    uncertaintyPenalty: probabilityFusion.confidencePenalty,
    trapFlags,
    personalizationDelta
  });
  const timing = buildOpportunityTiming({
    score: scoring.score,
    expectedValuePct: args.expectedValuePct,
    lineMovement: args.lineMovement,
    bestPriceFlag: args.bestPriceFlag,
    freshnessMinutes: providerFreshnessMinutes,
    trapFlags,
    disagreementScore: args.marketDisagreementScore,
    marketEfficiency,
    edgeDecayPenalty: edgeDecay.penalty,
    truthTimingDelta: truthCalibration.timingDelta,
    calibrationTrapEscalation:
      truthCalibration.trapEscalation || reasonCalibration.trapEscalation,
    reasonTimingDelta: reasonCalibration.timingDelta,
    reasonTrapEscalation: reasonCalibration.trapEscalation,
    marketPathTimingDelta: marketMicrostructure.timingDelta,
    marketPathExecutionHint: args.marketPath?.executionHint,
    marketPathStaleCopyConfidence: args.marketPath?.staleCopyConfidence,
    marketPathRepricingLikelihood: marketMicrostructure.repricingLikelihood,
    marketPathWaitImprovementLikelihood: marketMicrostructure.waitImprovementLikelihood,
    marketPathTrapEscalation: marketMicrostructure.trapEscalation,
    closeDestinationLabel: closeDestination.label,
    closeDestinationConfidence: closeDestination.confidence,
    closeDestinationTimingDelta: closeDestination.timingDelta,
    executionCapacityLabel: executionCapacity.label,
    executionCapacityTimingDelta: executionCapacity.timingDelta,
    timingReplayDelta: timingReplay.timingDelta,
    timingReplayBias: timingReplay.bias
  });
  const confidenceTier = getConfidenceTier(scoring.score, trapFlags);
  const appliedTruthCalibration = {
    ...truthCalibration,
    calibratedScore: scoring.score,
    calibratedTimingQuality: timing.timingQuality
  };
  const appliedReasonCalibration = {
    ...reasonCalibration,
    calibratedScore: scoring.score,
    calibratedTimingQuality: timing.timingQuality
  };
  const sizing = buildPositionSizingGuidance({
    opportunityScore: scoring.score,
    confidenceTier,
    trapFlags,
    bookCount: args.bookCount,
    providerFreshnessMinutes,
    marketDisagreementScore: args.marketDisagreementScore,
    marketEfficiency,
    bestPriceFlag: args.bestPriceFlag,
    edgeDecay,
    expectedValuePct: args.expectedValuePct,
    fairPriceAmerican: args.fairPriceAmerican,
    displayOddsAmerican: args.displayOddsAmerican,
    actionState: timing.actionState,
    sourceQualityScore: calibratedSourceQuality.score,
    sourceHealthState: args.providerHealth?.state ?? "HEALTHY",
    truthCalibrationScoreDelta: truthCalibration.scoreDelta,
    marketMicrostructure,
    closeDestination,
    executionCapacity
  });

  const explanation = buildOpportunityExplanation({
    eventLabel: args.eventLabel,
    selectionLabel: args.selectionLabel,
    expectedValuePct: args.expectedValuePct,
    fairLineGap: args.fairLineGap,
    bestPriceFlag: args.bestPriceFlag,
    bookCount: args.bookCount,
    lineMovement: args.lineMovement,
    marketDisagreementScore: args.marketDisagreementScore,
    freshnessMinutes: providerFreshnessMinutes,
    pricingMethod: args.fairPriceMethod,
    confidenceScore: args.confidenceScore,
    reasons: args.reasons,
    trapFlags,
    actionState: timing.actionState,
    timingState: timing.timingState,
    marketEfficiency,
    sourceQuality: calibratedSourceQuality,
    edgeDecay,
    sizing,
    executionContext: null,
    truthCalibration: appliedTruthCalibration,
    reasonCalibration: appliedReasonCalibration,
    marketMicrostructure,
    bookLeadership,
    closeDestination,
    executionCapacity,
    timingReplay
  });

  const opportunityBase: OpportunityView = {
    id: args.id,
    kind: args.kind,
    league: args.league,
    eventId: args.eventId,
    eventLabel: args.eventLabel,
    marketType: args.marketType,
    selectionLabel: args.selectionLabel,
    sportsbookKey: args.sportsbookKey,
    sportsbookName: args.sportsbookName,
    displayOddsAmerican: args.displayOddsAmerican,
    displayLine: args.displayLine,
    fairPriceAmerican: args.fairPriceAmerican,
    fairPriceMethod: args.fairPriceMethod,
    expectedValuePct: round(args.expectedValuePct),
    marketDeltaAmerican: round(args.marketDeltaAmerican),
    consensusImpliedProbability:
      typeof args.consensusImpliedProbability === "number"
        ? Number((args.consensusImpliedProbability * 100).toFixed(2))
        : null,
    marketDisagreementScore: round(args.marketDisagreementScore, 3),
    providerFreshnessMinutes,
    staleFlag: args.staleFlag,
    bookCount: args.bookCount,
    lineMovement: round(args.lineMovement),
    marketPath: args.marketPath ?? null,
    marketEfficiency,
    probabilityFusion,
    reasonLanes: reasonCalibration.reasonLanes,
    sourceQuality: calibratedSourceQuality,
    edgeDecay,
    marketMicrostructure,
    bookLeadership,
    closeDestination,
    executionCapacity,
    sizing,
    executionContext: null,
    reasonCalibration: appliedReasonCalibration,
    timingReplay,
    postCloseReview: null,
    edgeScore: Math.round(args.edgeScore),
    opportunityScore: scoring.score,
    confidenceTier,
    actionState: timing.actionState,
    timingState: timing.timingState,
    trapFlags,
    whyItShows: explanation.whyItShows,
    whatCouldKillIt: explanation.whatCouldKillIt,
    reasonSummary: explanation.reasonSummary,
    personalizationAdjustments,
    sourceHealth: {
      state: args.providerHealth?.state ?? "HEALTHY",
      freshnessMinutes: providerFreshnessMinutes,
      warnings: args.providerHealth?.warnings ?? []
    },
    sourceNote: args.sourceNote,
    scoreComponents: scoring.components,
    truthCalibration: appliedTruthCalibration,
    truthClassification: args.truthClassification
  };

  return {
    ...opportunityBase,
    ranking: buildOpportunityRanking(opportunityBase),
    surfacing: null
  };
}

function marketLabelToKind(
  marketType: "spread" | "moneyline" | "total"
): OpportunityKind {
  if (marketType === "moneyline") {
    return "moneyline";
  }

  if (marketType === "total") {
    return "game_total";
  }

  return "game_side";
}

export function buildGameMarketOpportunity(
  game: GameCardView,
  marketType: "spread" | "moneyline" | "total",
  providerHealth?: ProviderHealthView | null,
  profile?: OpportunityProfile | null,
  truthCalibrationResolver?: OpportunityTruthCalibrationResolver | null,
  marketPathResolver?: OpportunityMarketPathResolver | null,
  bookLeadershipResolver?: OpportunityBookLeadershipResolver | null,
  closeDestinationResolver?: OpportunityCloseDestinationResolver | null,
  reasonCalibrationResolver?: OpportunityReasonCalibrationResolver | null,
  timingReplayResolver?: OpportunityTimingReplayResolver | null
): OpportunityView {
  const market: BoardMarketView = game[marketType];
  const eventLabel = `${game.awayTeam.name} @ ${game.homeTeam.name}`;
  const fairGap = market.evProfile?.fairLineGap ?? market.marketTruth?.sharpGapAmerican ?? null;
  const offeredOdds = market.bestOdds && market.bestOdds !== 0 ? market.bestOdds : null;

  return buildOpportunity({
    id: `${game.id}:${marketType}`,
    kind: marketLabelToKind(marketType),
    league: game.leagueKey,
    eventId: game.id,
    eventLabel,
    marketType,
    selectionLabel: market.label,
    sportsbookKey: market.marketIntelligence?.bestAvailableSportsbookKey ?? null,
    sportsbookName: market.bestBook !== "Unavailable" ? market.bestBook : null,
    displayOddsAmerican: offeredOdds,
    displayLine: market.lineLabel,
    fairPriceAmerican:
      market.fairPrice?.fairOddsAmerican ?? market.marketTruth?.fairOddsAmerican ?? null,
    fairPriceMethod: market.fairPrice?.pricingMethod ?? null,
    expectedValuePct: market.evProfile?.edgePct ?? null,
    marketDeltaAmerican:
      market.marketTruth?.consensusOddsAmerican && offeredOdds
        ? offeredOdds - market.marketTruth.consensusOddsAmerican
        : null,
    consensusImpliedProbability:
      market.marketIntelligence?.consensusImpliedProbability ?? null,
    marketDisagreementScore: market.marketIntelligence?.marketDisagreementScore ?? null,
    providerHealth,
    snapshotAgeSeconds: market.marketIntelligence?.snapshotAgeSeconds ?? null,
    staleFlag: market.marketIntelligence?.staleFlag ?? market.marketTruth?.stale ?? false,
    bookCount: market.marketTruth?.bookCount ?? game.bestBookCount,
    lineMovement: market.movement,
    edgeScore: Math.max(game.edgeScore.score, market.evProfile?.rankScore ?? 0),
    confidenceScore: market.confidenceScore ?? market.fairPrice?.pricingConfidenceScore ?? 0,
    qualityScore: market.marketTruth?.qualityScore ?? 0,
    fairLineGap: fairGap,
    bestPriceFlag: market.marketIntelligence?.bestPriceFlag ?? false,
    reasons: market.reasons ?? [],
    sourceNote: market.marketTruth?.note ?? providerHealth?.summary ?? "Market context only.",
    truthClassification: market.marketTruth?.classification ?? null,
    marketPath: market.marketPath ?? null,
    profile,
    truthCalibrationResolver,
    marketPathResolver,
    bookLeadershipResolver,
    closeDestinationResolver,
    reasonCalibrationResolver,
    timingReplayResolver
  });
}

export function buildPropOpportunity(
  prop: PropCardView,
  providerHealth?: ProviderHealthView | null,
  profile?: OpportunityProfile | null,
  truthCalibrationResolver?: OpportunityTruthCalibrationResolver | null,
  marketPathResolver?: OpportunityMarketPathResolver | null,
  bookLeadershipResolver?: OpportunityBookLeadershipResolver | null,
  closeDestinationResolver?: OpportunityCloseDestinationResolver | null,
  reasonCalibrationResolver?: OpportunityReasonCalibrationResolver | null,
  timingReplayResolver?: OpportunityTimingReplayResolver | null
): OpportunityView {
  const offeredOdds = prop.bestAvailableOddsAmerican ?? prop.oddsAmerican;
  const eventLabel = prop.gameLabel ?? `${prop.team.name} vs ${prop.opponent.name}`;

  return buildOpportunity({
    id: prop.id,
    kind: "prop",
    league: prop.leagueKey,
    eventId: prop.gameId,
    eventLabel,
    marketType: prop.marketType,
    selectionLabel: `${prop.player.name} ${prop.side} ${prop.line}`,
    sportsbookKey: prop.sportsbook.key,
    sportsbookName: prop.bestAvailableSportsbookName ?? prop.sportsbook.name,
    displayOddsAmerican: offeredOdds,
    displayLine: prop.line,
    fairPriceAmerican:
      prop.fairPrice?.fairOddsAmerican ?? prop.marketTruth?.fairOddsAmerican ?? null,
    fairPriceMethod: prop.fairPrice?.pricingMethod ?? null,
    expectedValuePct: prop.expectedValuePct ?? prop.evProfile?.edgePct ?? null,
    marketDeltaAmerican:
      typeof prop.marketDeltaAmerican === "number"
        ? prop.marketDeltaAmerican
        : typeof prop.averageOddsAmerican === "number"
          ? offeredOdds - prop.averageOddsAmerican
          : null,
    consensusImpliedProbability:
      prop.marketIntelligence?.consensusImpliedProbability ?? null,
    marketDisagreementScore: prop.marketIntelligence?.marketDisagreementScore ?? null,
    providerHealth,
    snapshotAgeSeconds: prop.marketIntelligence?.snapshotAgeSeconds ?? null,
    staleFlag: prop.marketIntelligence?.staleFlag ?? prop.marketTruth?.stale ?? false,
    bookCount: prop.marketTruth?.bookCount ?? prop.sportsbookCount ?? 1,
    lineMovement: prop.lineMovement ?? prop.marketIntelligence?.openToCurrentDelta ?? null,
    edgeScore: Math.max(prop.edgeScore.score, prop.evProfile?.rankScore ?? 0),
    confidenceScore: prop.confidenceScore ?? prop.fairPrice?.pricingConfidenceScore ?? 0,
    qualityScore: prop.marketTruth?.qualityScore ?? 0,
    fairLineGap: prop.evProfile?.fairLineGap ?? prop.marketTruth?.sharpGapAmerican ?? null,
    bestPriceFlag: prop.marketIntelligence?.bestPriceFlag ?? false,
    reasons: prop.reasons ?? [],
    sourceNote:
      prop.supportNote ?? prop.marketTruth?.note ?? providerHealth?.summary ?? "Prop context only.",
    truthClassification: prop.marketTruth?.classification ?? null,
    marketPath: prop.marketPath ?? null,
    profile,
    truthCalibrationResolver,
    marketPathResolver,
    bookLeadershipResolver,
    closeDestinationResolver,
    reasonCalibrationResolver,
    timingReplayResolver
  });
}

export function buildBetSignalOpportunity(
  signal: BetSignalView,
  league: OpportunityView["league"],
  providerHealth?: ProviderHealthView | null,
  profile?: OpportunityProfile | null,
  truthCalibrationResolver?: OpportunityTruthCalibrationResolver | null,
  marketPathResolver?: OpportunityMarketPathResolver | null,
  bookLeadershipResolver?: OpportunityBookLeadershipResolver | null,
  closeDestinationResolver?: OpportunityCloseDestinationResolver | null,
  reasonCalibrationResolver?: OpportunityReasonCalibrationResolver | null,
  timingReplayResolver?: OpportunityTimingReplayResolver | null
): OpportunityView {
  return buildOpportunity({
    id: signal.id,
    kind:
      signal.marketType === "moneyline"
        ? "moneyline"
        : signal.marketType === "total"
          ? "game_total"
          : signal.marketType.startsWith("player_") || signal.marketType === "fight_winner"
            ? "prop"
            : "game_side",
    league,
    eventId: signal.externalEventId ?? signal.id,
    eventLabel: signal.eventLabel,
    marketType: signal.marketType,
    selectionLabel: signal.selection,
    sportsbookKey: signal.sportsbookKey ?? null,
    sportsbookName: signal.sportsbookName ?? null,
    displayOddsAmerican: signal.oddsAmerican,
    displayLine: signal.line ?? signal.selection,
    fairPriceAmerican:
      signal.fairPrice?.fairOddsAmerican ?? signal.marketTruth?.fairOddsAmerican ?? null,
    fairPriceMethod: signal.fairPrice?.pricingMethod ?? null,
    expectedValuePct: signal.expectedValuePct ?? signal.evProfile?.edgePct ?? null,
    marketDeltaAmerican:
      typeof signal.marketDeltaAmerican === "number"
        ? signal.marketDeltaAmerican
        : signal.marketTruth?.sharpGapAmerican ?? null,
    consensusImpliedProbability:
      signal.marketIntelligence?.consensusImpliedProbability ?? null,
    marketDisagreementScore: signal.marketIntelligence?.marketDisagreementScore ?? null,
    providerHealth,
    snapshotAgeSeconds: signal.marketIntelligence?.snapshotAgeSeconds ?? null,
    staleFlag: signal.marketIntelligence?.staleFlag ?? signal.marketTruth?.stale ?? false,
    bookCount: signal.marketTruth?.bookCount ?? 1,
    lineMovement: signal.marketIntelligence?.openToCurrentDelta ?? null,
    edgeScore: Math.max(signal.edgeScore.score, signal.evProfile?.rankScore ?? 0),
    confidenceScore: signal.confidenceScore ?? signal.fairPrice?.pricingConfidenceScore ?? 0,
    qualityScore: signal.marketTruth?.qualityScore ?? 0,
    fairLineGap: signal.evProfile?.fairLineGap ?? signal.marketTruth?.sharpGapAmerican ?? null,
    bestPriceFlag: signal.marketIntelligence?.bestPriceFlag ?? false,
    reasons: signal.reasons ?? [],
    sourceNote:
      signal.supportNote ?? signal.marketTruth?.note ?? providerHealth?.summary ?? "Signal context only.",
    truthClassification: signal.marketTruth?.classification ?? null,
    marketPath: signal.marketPath ?? null,
    profile,
    truthCalibrationResolver,
    marketPathResolver,
    bookLeadershipResolver,
    closeDestinationResolver,
    reasonCalibrationResolver,
    timingReplayResolver
  });
}

export function rankOpportunities<T extends OpportunityView>(opportunities: T[]) {
  return [...opportunities].sort((a, b) => {
    const aDead =
      a.surfacing?.status === "SUPPRESSED" ||
      a.actionState === "PASS" ||
      a.sourceHealth.state === "OFFLINE";

    const bDead =
      b.surfacing?.status === "SUPPRESSED" ||
      b.actionState === "PASS" ||
      b.sourceHealth.state === "OFFLINE";

    if (aDead !== bDead) {
      return aDead ? 1 : -1;
    }

    const aRanking = a.ranking ?? buildOpportunityRanking(a);
    const bRanking = b.ranking ?? buildOpportunityRanking(b);

    const compositeDelta = bRanking.compositeScore - aRanking.compositeScore;
    if (compositeDelta !== 0) {
      return compositeDelta;
    }

    const capitalPriorityDelta =
      bRanking.capitalEfficiencyScore - aRanking.capitalEfficiencyScore;
    if (capitalPriorityDelta !== 0) {
      return capitalPriorityDelta;
    }

    const edgeQualityDelta = bRanking.edgeQualityScore - aRanking.edgeQualityScore;
    if (edgeQualityDelta !== 0) {
      return edgeQualityDelta;
    }

    const destinationDelta =
      bRanking.destinationQualityScore - aRanking.destinationQualityScore;
    if (destinationDelta !== 0) {
      return destinationDelta;
    }

    const capacityDelta =
      bRanking.executionCapacityScore - aRanking.executionCapacityScore;
    if (capacityDelta !== 0) {
      return capacityDelta;
    }

    const executionDelta =
      bRanking.executionQualityScore - aRanking.executionQualityScore;
    if (executionDelta !== 0) {
      return executionDelta;
    }

    const marketPathDelta =
      bRanking.marketPathQualityScore - aRanking.marketPathQualityScore;
    if (marketPathDelta !== 0) {
      return marketPathDelta;
    }

    const portfolioFitDelta =
      bRanking.portfolioFitScore - aRanking.portfolioFitScore;
    if (portfolioFitDelta !== 0) {
      return portfolioFitDelta;
    }

    const scoreDelta = b.opportunityScore - a.opportunityScore;
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    const confidenceDelta =
      getConfidencePriority(b.confidenceTier) -
      getConfidencePriority(a.confidenceTier);
    if (confidenceDelta !== 0) {
      return confidenceDelta;
    }

    return (b.expectedValuePct ?? -999) - (a.expectedValuePct ?? -999);
  });
}

export async function buildHomeOpportunitySnapshot(args: {
  games: GameCardView[];
  props: PropCardView[];
  providerHealth?: ProviderHealthView | null;
  performance?: PerformanceDashboardView | null;
  truthCalibrationResolver?: OpportunityTruthCalibrationResolver | null;
  marketPathResolver?: OpportunityMarketPathResolver | null;
  bookLeadershipResolver?: OpportunityBookLeadershipResolver | null;
  closeDestinationResolver?: OpportunityCloseDestinationResolver | null;
  reasonCalibrationResolver?: OpportunityReasonCalibrationResolver | null;
  timingReplayResolver?: OpportunityTimingReplayResolver | null;
  portfolioAllocator?: OpportunityPortfolioAllocator | null;
}): Promise<OpportunityHomeSnapshot> {
  const profile = buildOpportunityProfile(args.performance);
  const portfolioAllocator = args.portfolioAllocator ?? neutralPortfolioAllocator;

  const boardCandidates = args.games.flatMap((game) =>
    (["spread", "moneyline", "total"] as const).map((marketType) =>
      buildGameMarketOpportunity(
        game,
        marketType,
        args.providerHealth,
        profile,
        args.truthCalibrationResolver,
        args.marketPathResolver,
        args.bookLeadershipResolver,
        args.closeDestinationResolver,
        args.reasonCalibrationResolver,
        args.timingReplayResolver
      )
    )
  );

  const propCandidates = args.props.map((prop) =>
    buildPropOpportunity(
      prop,
      args.providerHealth,
      profile,
      args.truthCalibrationResolver,
      args.marketPathResolver,
      args.bookLeadershipResolver,
      args.closeDestinationResolver,
      args.reasonCalibrationResolver,
      args.timingReplayResolver
    )
  );

  const boardIds = new Set(boardCandidates.map((opportunity) => opportunity.id));
  const allocatedCandidates = portfolioAllocator.apply([
    ...boardCandidates,
    ...propCandidates
  ]);
  const allocatedBoardCandidates = allocatedCandidates.filter((opportunity) =>
    boardIds.has(opportunity.id)
  ).map((opportunity) => applyOpportunitySurfacing(opportunity, "home_command"));
  const allocatedPropCandidates = allocatedCandidates.filter(
    (opportunity) => !boardIds.has(opportunity.id)
  ).map((opportunity) => applyOpportunitySurfacing(opportunity, "home_command"));

  const boardTop = rankOpportunities(
    allocatedBoardCandidates.filter(
      (opportunity) => opportunity.surfacing?.status === "SURFACED"
    )
  ).slice(0, 5);

  const propsTop = rankOpportunities(
    allocatedPropCandidates.filter(
      (opportunity) => opportunity.surfacing?.status === "SURFACED"
    )
  ).slice(0, 5);

  const surfaced = [...boardTop, ...propsTop];

  const traps = rankOpportunities(
    surfaced.filter((opportunity) => opportunity.trapFlags.length)
  )
    .sort((left, right) => right.trapFlags.length - left.trapFlags.length)
    .slice(0, 3);

  const timingWindows = rankOpportunities(
    surfaced.filter((opportunity) => opportunity.actionState === "BET_NOW")
  ).slice(0, 4);

  return {
    boardTop,
    propsTop,
    traps,
    timingWindows
  };
}
