import type {
  BetSignalContext,
  LeakSignal
} from "@/lib/types/bet-intelligence";

export const SPORT_CODES = [
  "BASKETBALL",
  "BASEBALL",
  "HOCKEY",
  "FOOTBALL",
  "MMA",
  "BOXING",
  "OTHER"
] as const;

export const LEAGUE_KEYS = [
  "NBA",
  "NCAAB",
  "MLB",
  "NHL",
  "NFL",
  "NCAAF",
  "UFC",
  "BOXING"
] as const;

export const LEDGER_MARKET_TYPES = [
  "spread",
  "moneyline",
  "total",
  "team_total",
  "player_points",
  "player_rebounds",
  "player_assists",
  "player_threes",
  "fight_winner",
  "method_of_victory",
  "round_total",
  "round_winner",
  "other"
] as const;

export const BET_RESULTS = ["OPEN", "WIN", "LOSS", "PUSH", "VOID", "CASHED_OUT"] as const;
export const BET_TYPES = ["STRAIGHT", "PARLAY"] as const;
export const BET_SOURCES = ["MANUAL", "IMPORTED", "SYNCED"] as const;
export const EVENT_STATUSES = ["SCHEDULED", "LIVE", "FINAL", "POSTPONED", "CANCELED", "DELAYED"] as const;
export const SORT_OPTIONS = ["placedAt", "stake", "result", "clv"] as const;
export const SORT_DIRECTIONS = ["asc", "desc"] as const;
export const FILTER_WINDOWS = ["all", "today", "7d", "30d", "90d"] as const;

export type SupportedSportCode = (typeof SPORT_CODES)[number];
export type SupportedLeagueKey = (typeof LEAGUE_KEYS)[number];
export type LedgerMarketType = (typeof LEDGER_MARKET_TYPES)[number];
export type LedgerBetResult = (typeof BET_RESULTS)[number];
export type LedgerBetType = (typeof BET_TYPES)[number];
export type LedgerBetSource = (typeof BET_SOURCES)[number];
export type LedgerEventStatus = (typeof EVENT_STATUSES)[number];
export type LedgerSortKey = (typeof SORT_OPTIONS)[number];
export type SortDirection = (typeof SORT_DIRECTIONS)[number];
export type LedgerFilterWindow = (typeof FILTER_WINDOWS)[number];

export type LedgerFilters = {
  status: "ALL" | LedgerBetResult | "SETTLED";
  sport: "ALL" | SupportedSportCode;
  league: "ALL" | SupportedLeagueKey;
  market: "ALL" | LedgerMarketType;
  sportsbook: string;
  window: LedgerFilterWindow;
  sort: LedgerSortKey;
  direction: SortDirection;
};

export type EventParticipantView = {
  id: string;
  competitorId: string;
  role: "HOME" | "AWAY" | "COMPETITOR_A" | "COMPETITOR_B" | "UNKNOWN";
  sortOrder: number;
  name: string;
  abbreviation: string | null;
  type: "TEAM" | "ATHLETE" | "FIGHTER" | "OTHER";
  score: string | null;
  record: string | null;
  isWinner: boolean | null;
};

export type EventOption = {
  id: string;
  sportCode: SupportedSportCode;
  leagueKey: SupportedLeagueKey;
  label: string;
  startTime: string;
  status: LedgerEventStatus;
  eventType: "TEAM_HEAD_TO_HEAD" | "COMBAT_HEAD_TO_HEAD" | "OTHER";
  providerKey: string | null;
  lastSyncedAt: string | null;
  liveSupported: boolean;
  participants: EventParticipantView[];
};

export type SportsbookOption = {
  id: string;
  key: string;
  name: string;
  region: string;
  logoUrl: string | null;
};

export type BetLegInput = {
  id?: string;
  eventId?: string | null;
  sportsbookId?: string | null;
  marketType: LedgerMarketType;
  marketLabel: string;
  selection: string;
  side?: string | null;
  line?: number | null;
  oddsAmerican: number;
  closingLine?: number | null;
  closingOddsAmerican?: number | null;
  notes?: string;
  context?: BetSignalContext | null;
};

export type LedgerBetFormInput = {
  id?: string;
  placedAt: string;
  settledAt?: string | null;
  source: LedgerBetSource;
  externalSourceKey?: string | null;
  externalSourceId?: string | null;
  externalSourceFingerprint?: string | null;
  betType: LedgerBetType;
  sport: SupportedSportCode;
  league: SupportedLeagueKey;
  eventId?: string | null;
  sportsbookId?: string | null;
  status: LedgerBetResult;
  stake: number;
  notes: string;
  tags: string;
  isLive: boolean;
  context?: BetSignalContext | null;
  legs: BetLegInput[];
};

export type LedgerLegView = {
  id: string;
  eventId: string | null;
  eventLabel: string | null;
  leagueKey: SupportedLeagueKey;
  marketType: LedgerMarketType;
  marketLabel: string;
  selection: string;
  side: string | null;
  line: number | null;
  oddsAmerican: number;
  oddsDecimal: number;
  result: LedgerBetResult;
  sportsbook: SportsbookOption | null;
  closingLine: number | null;
  closingOddsAmerican: number | null;
  clvValue: number | null;
  clvPercentage: number | null;
  eventStatus: LedgerEventStatus | null;
  context: BetSignalContext | null;
};

export type LedgerBetView = {
  id: string;
  placedAt: string;
  settledAt: string | null;
  source: LedgerBetSource;
  externalSourceKey: string | null;
  externalSourceId: string | null;
  externalSourceFingerprint: string | null;
  betType: LedgerBetType;
  sport: SupportedSportCode;
  league: SupportedLeagueKey;
  eventId: string | null;
  eventLabel: string | null;
  marketType: LedgerMarketType;
  marketLabel: string;
  selection: string;
  side: string | null;
  line: number | null;
  oddsAmerican: number;
  oddsDecimal: number;
  stake: number;
  riskAmount: number;
  toWin: number;
  payout: number | null;
  result: LedgerBetResult;
  sportsbook: SportsbookOption | null;
  notes: string;
  tags: string[];
  isLive: boolean;
  archivedAt: string | null;
  closingLine: number | null;
  closingOddsAmerican: number | null;
  closingOddsDecimal: number | null;
  clvValue: number | null;
  clvPercentage: number | null;
  eventStartTime: string | null;
  context: BetSignalContext | null;
  legs: LedgerLegView[];
};

export type SweatLegView = {
  id: string;
  marketLabel: string;
  selection: string;
  result: LedgerBetResult;
  eventLabel: string | null;
  eventStatus: LedgerEventStatus | null;
};

export type SweatBoardItem = {
  betId: string;
  label: string;
  sport: SupportedSportCode;
  league: SupportedLeagueKey;
  betType: LedgerBetType;
  result: LedgerBetResult;
  placedAt: string;
  startTime: string | null;
  eventLabel: string | null;
  eventStatus: LedgerEventStatus | null;
  eventStateDetail: string | null;
  scoreboard: string | null;
  liveSupported: boolean;
  lastUpdatedAt: string | null;
  stale: boolean;
  bucket: "LIVE" | "UPCOMING" | "NEARLY_SETTLED" | "PENDING";
  exposure: {
    riskAmount: number;
    toWin: number;
    potentialPayout: number | null;
  };
  notes: string[];
  legs: SweatLegView[];
};

export type LedgerSummary = {
  record: string;
  winRate: number;
  roi: number;
  netUnits: number;
  averageOdds: number;
  averageStake: number;
  totalBets: number;
  openBets: number;
  settledBets: number;
  trackedClvBets: number;
  averageClv: number | null;
  positiveClvRate: number | null;
  negativeClvRate: number | null;
  averageEv: number | null;
};

export type ClvInsightView = {
  label: string;
  value: string;
  note: string;
};

export type LedgerSetupState = {
  status: "blocked";
  title: string;
  detail: string;
  steps: string[];
};

export type PerformanceBreakdownRow = {
  label: string;
  bets: number;
  winRate: number;
  roi: number;
  units: number;
  avgStake: number;
  clv: number | null;
};

export type PerformanceTrendPoint = {
  label: string;
  units: number;
};

export type PerformanceDashboardView = {
  setup: LedgerSetupState | null;
  summary: LedgerSummary;
  clvInsights: ClvInsightView[];
  bySport: PerformanceBreakdownRow[];
  byLeague: PerformanceBreakdownRow[];
  byMarket: PerformanceBreakdownRow[];
  bySportsbook: PerformanceBreakdownRow[];
  byDayOfWeek: PerformanceBreakdownRow[];
  byTiming: PerformanceBreakdownRow[];
  byWeek: PerformanceBreakdownRow[];
  byMonth: PerformanceBreakdownRow[];
  trend: PerformanceTrendPoint[];
  recentForm: Array<{
    label: string;
    record: string;
    units: number;
  }>;
  bestSegments: string[];
  worstSegments: string[];
  leakSignals: LeakSignal[];
};

export type LedgerPageData = {
  setup: LedgerSetupState | null;
  filters: LedgerFilters;
  summary: LedgerSummary;
  bets: LedgerBetView[];
  openBets: LedgerBetView[];
  settledBets: LedgerBetView[];
  sweatBoard: SweatBoardItem[];
  sports: Array<{
    code: SupportedSportCode;
    label: string;
  }>;
  leagues: Array<{
    key: SupportedLeagueKey;
    label: string;
    sportCode: SupportedSportCode;
  }>;
  sportsbooks: SportsbookOption[];
  events: EventOption[];
  marketOptions: Array<{
    value: LedgerMarketType;
    label: string;
  }>;
  lastUpdatedAt: string | null;
  liveNotes: string[];
  prefill: LedgerBetFormInput | null;
};
