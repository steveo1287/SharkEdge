import type {
  FairPriceMethod,
  LeagueKey,
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
};

export type OpportunityScoreComponents = {
  priceEdge: number;
  expectedValue: number;
  marketValidation: number;
  timingQuality: number;
  freshness: number;
  support: number;
  personalization: number;
  penalties: number;
};

export type OpportunitySourceHealth = {
  state: ProviderHealthState;
  freshnessMinutes: number | null;
  warnings: string[];
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
};

export type OpportunityHomeSnapshot = {
  boardTop: OpportunityView[];
  propsTop: OpportunityView[];
  traps: OpportunityView[];
  timingWindows: OpportunityView[];
};
