import type {
  FairPriceMethod,
  LeagueKey,
  MarketPathBookRole,
  MarketPathSynchronizationState,
  MarketPathRegime,
  MarketPathView,
  MarketTruthClassification,
  ProviderHealthState
} from "@/lib/types/domain";

export type OpportunityKind = "game_side" | "game_total" | "moneyline" | "prop";

export type OpportunityConfidenceTier = "A" | "B" | "C" | "D";

export type OpportunityActionState = "BET_NOW" | "WAIT" | "WATCH" | "PASS";

export type OpportunityTimingState =
  | "WINDOW_OPEN"
  | "WAIT_FOR_PULLBACK"
  | "WAIT_FOR_CONFIRMATION"
  | "MONITOR_ONLY"
  | "PASS_ON_PRICE";

export type MarketEfficiencyClass =
  | "HIGH_EFFICIENCY"
  | "MID_EFFICIENCY"
  | "LOW_EFFICIENCY"
  | "FRAGMENTED_PROP"
  | "THIN_SPECIALTY";

export type BookInfluenceTier =
  | "MARKET_MAKER"
  | "MAJOR_RETAIL"
  | "LOW_SIGNAL"
  | "UNKNOWN";

export type PositionSizeRecommendation =
  | "NO_BET"
  | "MICRO"
  | "SMALL"
  | "STANDARD"
  | "AGGRESSIVE";

export type BankrollRiskTolerance =
  | "CONSERVATIVE"
  | "BALANCED"
  | "AGGRESSIVE";

export type OpportunityTrapFlag =
  | "STALE_EDGE"
  | "THIN_MARKET"
  | "ONE_BOOK_OUTLIER"
  | "FAKE_MOVE_RISK"
  | "LOW_CONFIDENCE_FAIR_PRICE"
  | "INJURY_UNCERTAINTY"
  | "HIGH_MARKET_DISAGREEMENT"
  | "LOW_PROVIDER_HEALTH"
  | "MODEL_MARKET_CONFLICT";

export type OpportunityEvidence = {
  label: string;
  detail: string;
};

export type OpportunityPersonalizationAdjustment = {
  kind: "league" | "market" | "sportsbook" | "timing";
  delta: number;
  note: string;
  sampleSize: number | null;
  qualityGate: "PASSED" | "WEAK_SAMPLE" | "BLOCKED";
};

export type TruthCalibrationDimension =
  | "league"
  | "market"
  | "sportsbook"
  | "timing"
  | "action"
  | "confidence"
  | "trap_flag"
  | "source_health";

export type TruthCalibrationSampleState = "INSUFFICIENT_SAMPLE" | "QUALIFIED";

export type TruthCalibrationStatus =
  | "APPLIED"
  | "SKIPPED_NO_DATA"
  | "SKIPPED_INSUFFICIENT_SAMPLE"
  | "SKIPPED_NEUTRAL";

export type TruthCalibrationTrapHint =
  | "ESCALATE"
  | "DE_ESCALATE"
  | "NEUTRAL";

export type OpportunityMicrostructureStatus =
  | "APPLIED"
  | "SKIPPED_NO_PATH"
  | "SKIPPED_WEAK_PATH";

export type OpportunityDecayRiskBucket =
  | "FAST"
  | "ELEVATED"
  | "MODERATE"
  | "SLOW"
  | "IMPROVEMENT_PRONE"
  | "UNKNOWN";

export type OpportunitySizingConfidence = "HIGH" | "MEDIUM" | "LOW";

export type OpportunitySizingReasonCode =
  | "NO_ACTIONABLE_WINDOW"
  | "NO_FAIR_PRICE"
  | "NO_MARKET_PRICE"
  | "KELLY_ZERO"
  | "BEST_PRICE_UNCONFIRMED"
  | "HIGH_MARKET_DISAGREEMENT"
  | "LOW_SOURCE_QUALITY"
  | "HIGH_EFFICIENCY_CAP"
  | "FRAGMENTED_MARKET_CAP"
  | "FAST_DECAY_CAP"
  | "STALE_COPY_CONFIRMED"
  | "EXECUTION_RISK_CAP"
  | "TRAP_CAPPED"
  | "ACTION_WAIT_NO_ALLOCATION"
  | "ACTION_WATCH_NO_ALLOCATION"
  | "ACTION_PASS_NO_ALLOCATION"
  | "DESTINATION_IMPROVE_CAP"
  | "DESTINATION_MOSTLY_PRICED_CAP"
  | "EXECUTION_CAPACITY_SCREEN_ONLY"
  | "EXECUTION_CAPACITY_FRAGILE"
  | "DESTINATION_DECAY_SUPPORT"
  | "PORTFOLIO_BANKROLL_CAP"
  | "PORTFOLIO_EVENT_CAP"
  | "PORTFOLIO_MARKET_CAP"
  | "CORRELATED_WITH_OPEN_EXPOSURE"
  | "BETTER_CAPITAL_USE_EXISTS"
  | "PORTFOLIO_INCLUDED"
  | "PORTFOLIO_EXCLUDED";

export type OpportunityExposureCategory =
  | "PORTFOLIO"
  | "EVENT"
  | "MARKET"
  | "DIRECTION"
  | "LEAGUE";

export type OpportunityExposureDiagnostic = {
  category: OpportunityExposureCategory;
  label: string;
  currentStake: number;
  currentBankrollPct: number;
  capBankrollPct: number | null;
  penaltyFactor: number;
  note: string;
  relatedIds: string[];
};

export type OpportunityExecutionClassification =
  | "EXCELLENT_ENTRY"
  | "ACCEPTABLE"
  | "POOR_ENTRY"
  | "MISSED_OPPORTUNITY"
  | "NO_EXECUTION_DATA";

export type OpportunityTimingCorrectness =
  | "CORRECT"
  | "EARLY"
  | "LATE"
  | "MISSED"
  | "UNKNOWN";

export type OpportunityTimingReviewClassification =
  | "HIT_NOW_CORRECT"
  | "WAIT_WAS_BETTER"
  | "WINDOW_HELD"
  | "EDGE_DIED_FAST"
  | "STALE_COPY_CAPTURE_WINDOW"
  | "NO_REPLAY_CONFIDENCE";

export type OpportunityTimingReviewVerdict =
  | "VALIDATED"
  | "CONTRADICTED"
  | "NEUTRAL"
  | "UNKNOWN";

export type OpportunityTimingReplayBias =
  | "STRENGTHEN_BET_NOW"
  | "STRENGTHEN_WAIT"
  | "DEMOTE_WATCH"
  | "NEUTRAL";

export type OpportunityTimingReplayStatus =
  | "APPLIED"
  | "SKIPPED_NO_HISTORY"
  | "SKIPPED_INSUFFICIENT_SAMPLE"
  | "SKIPPED_LOW_CONFIDENCE";

export type OpportunityReasonLaneCategory =
  | "path_regime"
  | "price_confirmation"
  | "destination"
  | "capacity"
  | "market_efficiency"
  | "source_quality"
  | "trap"
  | "timing"
  | "action";

export type OpportunityCloseDestinationLabel =
  | "IMPROVE"
  | "HOLD"
  | "DECAY"
  | "MOSTLY_PRICED";

export type OpportunityCloseDestinationConfidence = "HIGH" | "MEDIUM" | "LOW";

export type OpportunityExecutionCapacityLabel =
  | "FULLY_ACTIONABLE"
  | "MODERATELY_ACTIONABLE"
  | "SCREEN_VALUE_ONLY"
  | "FRAGILE_STALE";

export type OpportunityExecutionCapacityConfidence = "HIGH" | "MEDIUM" | "LOW";

export type OpportunityReasonLaneView = {
  key: string;
  category: OpportunityReasonLaneCategory;
  label: string;
  description: string;
};

export type OpportunityDecisionSnapshotView = {
  surfaceKey: string | null;
  surfaceContext: string | null;
  surfacedAt: string | null;
  displayedOddsAmerican: number | null;
  displayedLine: number | null;
  bestAvailableOddsAmerican: number | null;
  bestAvailableLine: number | null;
  bestPriceTiedSportsbookKeys: string[];
  bestPriceTiedSportsbookNames: string[];
  marketPathRegime: MarketPathRegime | "NO_PATH";
  leaderCandidates: string[];
  confirmerBooks: string[];
  followerBooks: string[];
  laggingBooks: string[];
  outlierBooks: string[];
  offeredBookRole: MarketPathBookRole;
  staleCopyConfidence: number | null;
  confirmationCount: number | null;
  confirmationQuality: number | null;
  leaderFollowerConfidence: number | null;
  moveCoherenceScore: number | null;
  synchronizationState: MarketPathSynchronizationState | "NO_PATH" | null;
  providerFreshnessMinutes: number | null;
  sourceHealthState: ProviderHealthState;
  actionState: OpportunityActionState;
  timingState: OpportunityTimingState;
  opportunityScore: number;
  confidenceTier: OpportunityConfidenceTier;
  recommendedStake: number | null;
  bankrollPct: number | null;
  capitalPriorityScore: number | null;
  reasonLanes: OpportunityReasonLaneView[];
  closeDestinationLabel: OpportunityCloseDestinationLabel | null;
  closeDestinationConfidence: OpportunityCloseDestinationConfidence | null;
  executionCapacityLabel: OpportunityExecutionCapacityLabel | null;
  executionCapacityConfidence: OpportunityExecutionCapacityConfidence | null;
  executionCapacityScore: number | null;
};

export type OpportunityExecutionContextView = {
  status: "HISTORICAL" | "NO_EXECUTION_DATA";
  classification: OpportunityExecutionClassification;
  executionScore: number | null;
  entryQualityLabel: string;
  surfaceKey: string | null;
  decisionSnapshotUsed: boolean;
  decisionSnapshot: OpportunityDecisionSnapshotView | null;
  bestAvailableOddsAmerican: number | null;
  bestAvailableLine: number | null;
  actualOddsAmerican: number | null;
  actualLine: number | null;
  closingOddsAmerican: number | null;
  closingLine: number | null;
  slippageAmerican: number | null;
  slippageVsCloseAmerican: number | null;
  clvPct: number | null;
  timeToCloseMinutes: number | null;
  staleCopyCaptured: boolean | null;
  missedEdge: boolean;
  timingCorrectness: OpportunityTimingCorrectness;
  reasonCodes: string[];
  reasons: string[];
};

export type OpportunityBankrollSettings = {
  bankroll: number;
  availableBankroll: number;
  unitSize: number;
  riskTolerance: BankrollRiskTolerance;
  baseKellyFraction: number;
  maxSingleBetPct: number;
  maxOpenExposurePct: number;
  maxEventExposurePct: number;
  maxMarketExposurePct: number;
};

export type OpportunityCalibrationTrace = {
  groupBy: TruthCalibrationDimension;
  label: string;
  sampleState: TruthCalibrationSampleState;
  surfaced: number;
  closed: number;
  beatClosePct: number | null;
  averageTruthScore: number | null;
  applied: boolean;
  scoreDelta: number;
  timingDelta: number;
  sourceWeightDelta: number;
  trapHint: TruthCalibrationTrapHint;
  note: string;
};

export type OpportunityReasonCalibrationTrace = {
  key: string;
  category: OpportunityReasonLaneCategory;
  label: string;
  sampleState: TruthCalibrationSampleState;
  surfaced: number;
  closed: number;
  beatClosePct: number | null;
  averageTruthScore: number | null;
  applied: boolean;
  scoreDelta: number;
  timingDelta: number;
  sourceWeightDelta: number;
  trapHint: TruthCalibrationTrapHint;
  note: string;
};

export type OpportunityTruthCalibrationView = {
  status: TruthCalibrationStatus;
  scoreDelta: number;
  timingDelta: number;
  sourceWeightDelta: number;
  trapEscalation: boolean;
  trapDeEscalation: boolean;
  baseScore: number;
  calibratedScore: number;
  baseTimingQuality: number;
  calibratedTimingQuality: number;
  sampleGate: {
    requiredSurfaced: number;
    requiredClosed: number;
    qualifiedSignals: number;
    insufficientSignals: number;
  };
  summary: string;
  applied: OpportunityCalibrationTrace[];
  skipped: OpportunityCalibrationTrace[];
};

export type OpportunityReasonCalibrationView = {
  status: TruthCalibrationStatus;
  reasonLanes: OpportunityReasonLaneView[];
  scoreDelta: number;
  timingDelta: number;
  sourceWeightDelta: number;
  trapEscalation: boolean;
  trapDeEscalation: boolean;
  baseScore: number;
  calibratedScore: number;
  baseTimingQuality: number;
  calibratedTimingQuality: number;
  sampleGate: {
    requiredSurfaced: number;
    requiredClosed: number;
    qualifiedSignals: number;
    insufficientSignals: number;
  };
  summary: string;
  applied: OpportunityReasonCalibrationTrace[];
  skipped: OpportunityReasonCalibrationTrace[];
};

export type OpportunityTimingReplayView = {
  status: OpportunityTimingReplayStatus;
  laneKey: string | null;
  laneLabel: string | null;
  bias: OpportunityTimingReplayBias;
  confidence: OpportunityCloseDestinationConfidence;
  surfaced: number;
  replayQualified: number;
  requiredSurfaced: number;
  requiredQualified: number;
  hitNowCorrectPct: number | null;
  waitWasBetterPct: number | null;
  edgeDiedFastPct: number | null;
  averageTimingReviewScore: number | null;
  averageClvPct: number | null;
  timingDelta: number;
  trapEscalation: boolean;
  summary: string;
  reasonCodes: string[];
  notes: string[];
};

export type OpportunityTimingReviewView = {
  status: "QUALIFIED" | "NO_REPLAY_CONFIDENCE";
  surfaceKey: string;
  surfacedAt: string;
  surfaceContext: string | null;
  classification: OpportunityTimingReviewClassification;
  verdict: OpportunityTimingReviewVerdict;
  timingReviewScore: number | null;
  actionStateAtSurface: OpportunityActionState | null;
  timingStateAtSurface: OpportunityTimingState | null;
  marketPathRegimeAtSurface: MarketPathRegime | "NO_PATH";
  reasonLanes: OpportunityReasonLaneView[];
  staleCopyExpected: boolean;
  closeDestinationLabelAtSurface: OpportunityCloseDestinationLabel | null;
  executionCapacityLabelAtSurface: OpportunityExecutionCapacityLabel | null;
  clvPct: number | null;
  normalizedTruthScore: number | null;
  timeToCloseMinutes: number | null;
  validatedOriginalAction: boolean | null;
  reasonCodes: string[];
  reasons: string[];
};

export type OpportunityPostCloseReviewView = {
  surfaceKey: string;
  surfacedAt: string;
  surfaceContext: string | null;
  surfacedOpportunityId: string;
  eventId: string;
  league: LeagueKey;
  marketType: string;
  selectionLabel: string;
  sportsbookKey: string | null;
  sportsbookName: string | null;
  displayedOddsAmerican: number | null;
  displayedLine: number | null;
  closeOddsAmerican: number | null;
  closeLine: number | null;
  clvPct: number | null;
  clvResult: string | null;
  normalizedTruthScore: number | null;
  finalOutcome: string | null;
  decisionSnapshot: OpportunityDecisionSnapshotView | null;
  reasonLanes: OpportunityReasonLaneView[];
  timingReview: OpportunityTimingReviewView;
  executionContext: OpportunityExecutionContextView | null;
  summary: string;
};

export type OpportunityScoreComponents = {
  priceEdge: number;
  expectedValue: number;
  marketValidation: number;
  timingQuality: number;
  freshness: number;
  support: number;
  sourceQuality: number;
  marketEfficiency: number;
  edgeDecay: number;
  truthCalibration: number;
  reasonCalibration: number;
  marketPath: number;
  closeDestination: number;
  executionCapacity: number;
  personalization: number;
  penalties: number;
};

export type OpportunitySourceHealth = {
  state: ProviderHealthState;
  freshnessMinutes: number | null;
  warnings: string[];
};

export type OpportunitySourceQuality = {
  score: number;
  label: string;
  influenceTier: BookInfluenceTier;
  baseInfluenceWeight: number;
  influenceWeight: number;
  truthAdjustment: number;
  marketPathAdjustment: number;
  leadershipAdjustment: number;
  marketPathRole: MarketPathBookRole;
  sharpBookPresent: boolean;
  notes: string[];
};

export type OpportunityBookLeadershipView = {
  status: "APPLIED" | "SKIPPED_NO_HISTORY" | "SKIPPED_INSUFFICIENT_SAMPLE";
  laneKey: string | null;
  laneLabel: string | null;
  sportsbookIdentity: string | null;
  role: MarketPathBookRole;
  surfaced: number;
  closed: number;
  requiredSurfaced: number;
  requiredClosed: number;
  leaderFrequency: number | null;
  confirmerFrequency: number | null;
  lagFrequency: number | null;
  staleCopyFrequency: number | null;
  beatClosePct: number | null;
  averageTruthScore: number | null;
  influenceAdjustment: number;
  pathConfidenceAdjustment: number;
  staleCopyConfidenceAdjustment: number;
  notes: string[];
};

export type OpportunityCloseDestinationView = {
  status: "APPLIED" | "SKIPPED_NO_HISTORY" | "SKIPPED_LOW_CONFIDENCE";
  label: OpportunityCloseDestinationLabel;
  confidence: OpportunityCloseDestinationConfidence;
  confidenceScore: number;
  surfaced: number;
  closed: number;
  requiredSurfaced: number;
  requiredClosed: number;
  timingDelta: number;
  scoreDelta: number;
  sizingMultiplier: number;
  reasonCodes: string[];
  notes: string[];
};

export type OpportunityExecutionCapacityView = {
  status: "APPLIED" | "SKIPPED_LOW_CONFIDENCE";
  label: OpportunityExecutionCapacityLabel;
  confidence: OpportunityExecutionCapacityConfidence;
  capacityScore: number;
  stakeMultiplier: number;
  rankingDelta: number;
  timingDelta: number;
  reasonCodes: string[];
  notes: string[];
};

export type OpportunityMarketMicrostructureView = {
  status: OpportunityMicrostructureStatus;
  regime: MarketPathRegime | "NO_PATH";
  pathTrusted: boolean;
  historyQualified: boolean;
  staleCopyConfidence: number;
  decayRiskBucket: OpportunityDecayRiskBucket;
  estimatedHalfLifeMinutes: number | null;
  urgencyScore: number;
  repricingLikelihood: number;
  waitImprovementLikelihood: number;
  scoreDelta: number;
  timingDelta: number;
  sourceWeightDelta: number;
  trapEscalation: boolean;
  adjustments: {
    pathScoreDelta: number;
    historyScoreDelta: number;
    pathTimingDelta: number;
    historyTimingDelta: number;
    pathSourceWeightDelta: number;
    historySourceWeightDelta: number;
  };
  sampleGate: {
    requiredClosed: number;
    qualifiedSignals: number;
    insufficientSignals: number;
  };
  summary: string;
  reasons: string[];
};

export type OpportunityEdgeDecayView = {
  score: number;
  penalty: number;
  label: "FRESH" | "AGING" | "DECAYING" | "COMPRESSED" | "STALE";
  minutesSinceDetection: number | null;
  minutesSinceSnapshot: number | null;
  compressed: boolean;
  notes: string[];
};

export type PositionSizingGuidance = {
  recommendation: PositionSizeRecommendation;
  units: number;
  label: string;
  rationale: string;
  riskFlags: string[];
  bankroll: number;
  availableBankroll: number;
  unitSize: number;
  bankrollPct: number;
  baseKellyFraction: number;
  adjustedKellyFraction: number;
  baseStake: number;
  adjustedStake: number;
  exposureAdjustedStake: number;
  competitionAdjustedStake: number;
  recommendedStake: number;
  destinationSizingMultiplier: number;
  executionCapacityMultiplier: number;
  exposureAdjustment: number;
  correlationPenalty: number;
  competitionPenalty: number;
  capitalPriorityScore: number;
  includeInPortfolio: boolean;
  riskTolerance: BankrollRiskTolerance;
  sizingConfidence: OpportunitySizingConfidence;
  reasonCodes: OpportunitySizingReasonCode[];
  exposureDiagnostics: OpportunityExposureDiagnostic[];
};

export type OpportunitySnapshotView = {
  id: string;
  opportunityScore: number;
  confidenceTier: OpportunityConfidenceTier;
  actionState: OpportunityActionState;
  timingState: OpportunityTimingState;
  trapFlags: OpportunityTrapFlag[];
  reasonSummary: string;
  triggerSummary: string | null;
  killSummary: string | null;
  providerFreshnessMinutes: number | null;
  staleFlag: boolean;
  sportsbookName: string | null;
  sourceHealthState: ProviderHealthState;
  calibrationStatus: OpportunityTruthCalibrationView["status"];
  calibrationSummary: string | null;
  reasonCalibrationSummary: string | null;
  microstructureSummary: string | null;
  bookLeadershipSummary: string | null;
  destinationSummary: string | null;
  capacitySummary: string | null;
  timingReplaySummary: string | null;
  rankingSummary: string | null;
  surfacingSummary: string | null;
};

export type OpportunityRankingView = {
  compositeScore: number;
  capitalEfficiencyScore: number;
  edgeQualityScore: number;
  destinationQualityScore: number;
  executionQualityScore: number;
  executionCapacityScore: number;
  marketPathQualityScore: number;
  portfolioFitScore: number;
  actionModifier: number;
  notes: string[];
};

export type OpportunitySurfacingVisibility = "FULL" | "CAUTION" | "HIDDEN";

export type OpportunitySurfacingView = {
  status: "SURFACED" | "SUPPRESSED";
  visibility: OpportunitySurfacingVisibility;
  surfacedBecause: string;
  cautionReasons: string[];
};

export type OpportunityView = {
  id: string;
  kind: OpportunityKind;
  league: LeagueKey;
  eventId: string;
  eventLabel: string;
  marketType: string;
  selectionLabel: string;
  sportsbookKey: string | null;
  sportsbookName: string | null;
  displayOddsAmerican: number | null;
  displayLine: string | number | null;
  fairPriceAmerican: number | null;
  fairPriceMethod: FairPriceMethod | null;
  expectedValuePct: number | null;
  marketDeltaAmerican: number | null;
  consensusImpliedProbability: number | null;
  marketDisagreementScore: number | null;
  providerFreshnessMinutes: number | null;
  staleFlag: boolean;
  bookCount: number;
  lineMovement: number | null;
  marketPath: MarketPathView | null;
  marketEfficiency: MarketEfficiencyClass;
  reasonLanes: OpportunityReasonLaneView[];
  sourceQuality: OpportunitySourceQuality;
  edgeDecay: OpportunityEdgeDecayView;
  marketMicrostructure: OpportunityMarketMicrostructureView;
  bookLeadership: OpportunityBookLeadershipView;
  closeDestination: OpportunityCloseDestinationView;
  executionCapacity: OpportunityExecutionCapacityView;
  sizing: PositionSizingGuidance;
  executionContext: OpportunityExecutionContextView | null;
  reasonCalibration: OpportunityReasonCalibrationView;
  timingReplay: OpportunityTimingReplayView;
  postCloseReview?: OpportunityPostCloseReviewView | null;
  ranking?: OpportunityRankingView | null;
  surfacing?: OpportunitySurfacingView | null;
  edgeScore: number;
  opportunityScore: number;
  confidenceTier: OpportunityConfidenceTier;
  actionState: OpportunityActionState;
  timingState: OpportunityTimingState;
  trapFlags: OpportunityTrapFlag[];
  whyItShows: string[];
  whatCouldKillIt: string[];
  reasonSummary: string;
  personalizationAdjustments: OpportunityPersonalizationAdjustment[];
  sourceHealth: OpportunitySourceHealth;
  sourceNote: string;
  scoreComponents: OpportunityScoreComponents;
  truthCalibration: OpportunityTruthCalibrationView;
  truthClassification: MarketTruthClassification | null;
};

export type OpportunityProfile = {
  preferredLeagues: Set<LeagueKey>;
  weakLeagues: Set<LeagueKey>;
  preferredMarkets: Set<string>;
  weakMarkets: Set<string>;
  preferredSportsbooks: Set<string>;
  weakSportsbooks: Set<string>;
  preferredTimingLabels: Set<string>;
  weakTimingLabels: Set<string>;
  sampleSizes: {
    leagues: Map<string, number>;
    markets: Map<string, number>;
    sportsbooks: Map<string, number>;
    timing: Map<string, number>;
  };
};

export type OpportunityHomeSnapshot = {
  boardTop: OpportunityView[];
  propsTop: OpportunityView[];
  traps: OpportunityView[];
  timingWindows: OpportunityView[];
};
