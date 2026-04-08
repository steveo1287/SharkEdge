import type {
  FairPriceMethod,
  LeagueKey,
  MarketPathBookRole,
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

export type OpportunityExecutionContextView = {
  status: "HISTORICAL" | "NO_EXECUTION_DATA";
  classification: OpportunityExecutionClassification;
  executionScore: number | null;
  entryQualityLabel: string;
  bestAvailableOddsAmerican: number | null;
  actualOddsAmerican: number | null;
  actualLine: number | null;
  closingOddsAmerican: number | null;
  closingLine: number | null;
  slippageAmerican: number | null;
  clvPct: number | null;
  timeToCloseMinutes: number | null;
  staleCopyCaptured: boolean | null;
  missedEdge: boolean;
  timingCorrectness: OpportunityTimingCorrectness;
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
  marketPath: number;
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
  marketPathRole: MarketPathBookRole;
  sharpBookPresent: boolean;
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
  microstructureSummary: string | null;
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
  sourceQuality: OpportunitySourceQuality;
  edgeDecay: OpportunityEdgeDecayView;
  marketMicrostructure: OpportunityMarketMicrostructureView;
  sizing: PositionSizingGuidance;
  executionContext: OpportunityExecutionContextView | null;
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
