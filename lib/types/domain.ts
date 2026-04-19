import type { SupportedLeagueKey } from "@/lib/types/ledger";

export type LeagueKey = SupportedLeagueKey;

export type SportCode =
  | "BASKETBALL"
  | "BASEBALL"
  | "HOCKEY"
  | "FOOTBALL"
  | "MMA"
  | "BOXING"
  | "OTHER";

export type GameStatus = "PREGAME" | "LIVE" | "FINAL" | "POSTPONED" | "CANCELED";

export type MarketType =
  | "spread"
  | "moneyline"
  | "total"
  | "team_total"
  | "player_points"
  | "player_rebounds"
  | "player_assists"
  | "player_threes"
  | "player_pitcher_outs"
  | "player_pitcher_strikeouts"
  | "fight_winner"
  | "method_of_victory"
  | "round_total"
  | "round_winner"
  | "other";

export type PropMarketType = Extract<
  MarketType,
  | "player_points"
  | "player_rebounds"
  | "player_assists"
  | "player_threes"
  | "player_pitcher_outs"
  | "player_pitcher_strikeouts"
  | "fight_winner"
  | "method_of_victory"
  | "round_total"
  | "round_winner"
>;

export type BetResult = "OPEN" | "WIN" | "LOSS" | "PUSH" | "VOID";

export type PlayerStatus = "ACTIVE" | "QUESTIONABLE" | "DOUBTFUL" | "OUT";

export type EdgeBand = "Elite" | "Strong" | "Watchlist" | "Pass";

export type LeagueRecord = {
  id: string;
  key: LeagueKey;
  name: string;
  sport: SportCode;
  createdAt?: string;
  updatedAt?: string;
};

export type TeamRecord = {
  id: string;
  leagueId: string;
  name: string;
  abbreviation: string;
  externalIds: Record<string, string>;
  createdAt?: string;
  updatedAt?: string;
};

export type PlayerRecord = {
  id: string;
  leagueId: string;
  teamId: string;
  name: string;
  position: string;
  externalIds: Record<string, string>;
  status: PlayerStatus;
  createdAt?: string;
  updatedAt?: string;
};

export type GameRecord = {
  id: string;
  leagueId: string;
  externalEventId: string;
  startTime: string;
  homeTeamId: string;
  awayTeamId: string;
  status: GameStatus;
  venue: string;
  scoreJson: Record<string, unknown> | null;
  liveStateJson: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
};

export type SportsbookRecord = {
  id: string;
  key: string;
  name: string;
  region: string;
  createdAt?: string;
  updatedAt?: string;
};

export type MarketRecord = {
  id: string;
  gameId: string;
  sportsbookId: string;
  marketType: MarketType;
  period: string;
  side: string;
  playerId: string | null;
  line: number | null;
  oddsAmerican: number;
  oddsDecimal: number;
  impliedProbability: number;
  isLive: boolean;
  updatedAt: string;
  createdAt?: string;
};

export type MarketSnapshotRecord = {
  id: string;
  marketId: string;
  capturedAt: string;
  line: number | null;
  oddsAmerican: number;
  impliedProbability: number;
};

export type TeamGameStatRecord = {
  id: string;
  gameId: string;
  teamId: string;
  statsJson: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

export type PlayerGameStatRecord = {
  id: string;
  gameId: string;
  playerId: string;
  statsJson: Record<string, unknown>;
  minutes: number | null;
  starter: boolean;
  outcomeStatus: string;
  createdAt?: string;
  updatedAt?: string;
};

export type InjuryRecord = {
  id: string;
  playerId: string | null;
  teamId: string | null;
  gameId: string | null;
  status: PlayerStatus;
  source: string;
  reportedAt: string;
  createdAt?: string;
  updatedAt?: string;
};

export type UserRecord = {
  id: string;
  email: string | null;
  username: string | null;
  bankrollSettingsJson: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
};

export type BetRecord = {
  id: string;
  userId: string | null;
  placedAt: string;
  sport: SportCode;
  league: LeagueKey;
  gameId: string | null;
  playerId: string | null;
  marketType: MarketType;
  side: string;
  line: number | null;
  oddsAmerican: number;
  sportsbookId: string;
  stake: number;
  toWin: number;
  result: BetResult;
  closingLine: number | null;
  clvValue: number | null;
  notes: string;
  tagsJson: string[];
  isLive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type SavedTrendRecord = {
  id: string;
  userId: string;
  name: string;
  sport: SportCode;
  queryJson: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

export type TrendRunRecord = {
  id: string;
  savedTrendId: string | null;
  userId: string | null;
  queryJson: Record<string, unknown>;
  resultJson: Record<string, unknown>;
  createdAt: string;
};

export type LeagueStanding = {
  teamId: string;
  rank: number;
  wins: number;
  losses: number;
  streak: string;
  netRating: number;
};

export type PreviousGame = {
  id: string;
  leagueKey: LeagueKey;
  playedAt: string;
  awayTeamId: string;
  homeTeamId: string;
  awayScore: number;
  homeScore: number;
};

export type MockDatabase = {
  leagues: LeagueRecord[];
  teams: TeamRecord[];
  players: PlayerRecord[];
  games: GameRecord[];
  sportsbooks: SportsbookRecord[];
  markets: MarketRecord[];
  marketSnapshots: MarketSnapshotRecord[];
  teamGameStats: TeamGameStatRecord[];
  playerGameStats: PlayerGameStatRecord[];
  injuries: InjuryRecord[];
  users: UserRecord[];
  bets: BetRecord[];
  savedTrends: SavedTrendRecord[];
  trendRuns: TrendRunRecord[];
  standings: Partial<Record<LeagueKey, LeagueStanding[]>>;
  previousGames: PreviousGame[];
  gameAngles: Array<{
    gameId: string;
    modelProbability: number;
    recentHitRate: number;
    matchupRank: number;
    lineMovementSupport: number;
    volatility: number;
  }>;
  propAngles: Array<{
    id: string;
    gameId: string;
    playerId: string;
    marketType: Exclude<MarketType, "spread" | "moneyline" | "total">;
    preferredSportsbookId: string;
    preferredSide: string;
    recentHitRate: number;
    matchupRank: number;
    modelProbability: number;
    volatility: number;
  }>;
};

export type BoardFilters = {
  league: "ALL" | LeagueKey;
  date: string;
  sportsbook: string;
  market: "all" | "spread" | "moneyline" | "total";
  status: "pregame" | "live" | "all";
};

export type PropFilters = {
  league: "ALL" | LeagueKey;
  marketType: "ALL" | PropMarketType;
  team: string;
  player: string;
  sportsbook: string;
  valueFlag: "all" | "BEST_PRICE" | "MARKET_PLUS" | "STEAM";
  sortBy: "best_price" | "line_movement" | "market_ev" | "edge_score" | "league" | "start_time";
};

export type TrendFilters = {
  sport: "ALL" | SportCode;
  league: "ALL" | LeagueKey;
  market: "ALL" | MarketType;
  sportsbook: string;
  side:
    | "ALL"
    | "HOME"
    | "AWAY"
    | "OVER"
    | "UNDER"
    | "FAVORITE"
    | "UNDERDOG"
    | "COMPETITOR_A"
    | "COMPETITOR_B";
  subject: string;
  team: string;
  player: string;
  fighter: string;
  opponent: string;
  window: "all" | "30d" | "90d" | "365d";
  sample: number;
};

export type BetFilters = {
  state: "ALL" | "OPEN" | "SETTLED";
  sport: "ALL" | SportCode;
  market: "ALL" | MarketType;
  sportsbook: string;
};

export type BoardSupportStatus = "LIVE" | "PARTIAL" | "COMING_SOON";

export type ProviderHealthState = "HEALTHY" | "DEGRADED" | "FALLBACK" | "OFFLINE";

export type ProviderHealthView = {
  state: ProviderHealthState;
  label: string;
  summary: string;
  freshnessLabel: string;
  freshnessMinutes: number | null;
  asOf: string | null;
  warnings: string[];
};

export type MarketTruthClassification =
  | "sharp"
  | "trustworthy"
  | "stale"
  | "thin"
  | "noisy"
  | "soft"
  | "unverified";

export type ConfidenceBand = "high" | "medium" | "low" | "pass";

export type ReasonCategory =
  | "market_edge"
  | "model_edge"
  | "momentum_edge"
  | "regression_edge"
  | "situational_edge"
  | "injury_edge"
  | "arbitrage_edge"
  | "trend_support"
  | "pass";

export type ReasonAttributionView = {
  category: ReasonCategory;
  label: string;
  detail: string;
  tone: "success" | "brand" | "premium" | "muted" | "danger";
};

export type MarketTruthView = {
  classification: MarketTruthClassification;
  classificationLabel: string;
  qualityScore: number;
  confidenceBand: ConfidenceBand;
  bookCount: number;
  stale: boolean;
  staleAgeMinutes: number | null;
  disagreementPct: number | null;
  movementStrength: number | null;
  clvSupportPct: number | null;
  fairOddsAmerican: number | null;
  fairProbabilityPct: number | null;
  consensusOddsAmerican: number | null;
  sharpConsensusOddsAmerican: number | null;
  sharpGapAmerican: number | null;
  impliedEdgePct: number | null;
  note: string;
  flags: string[];
};

export type FairPriceMethod =
  | "consensus_no_vig"
  | "sharp_no_vig"
  | "model_only"
  | "blended_fair_price";

export type FairPriceView = {
  fairProb: number | null;
  fairOddsAmerican: number | null;
  fairOddsDecimal: number | null;
  pricingMethod: FairPriceMethod;
  pricingConfidenceScore: number;
  sourceCount: number;
  coverageNote: string;
  completenessScore: number;
};

export type LineMovementSummaryView = {
  openPrice: number | null;
  currentPrice: number | null;
  openLine: number | null;
  currentLine: number | null;
  priceDelta: number | null;
  lineDelta: number | null;
  summary: string;
};

export type MarketIntelligenceView = {
  sourceCount: number;
  bestPriceFlag: boolean;
  bestAvailableSportsbookKey: string | null;
  bestAvailableOddsAmerican: number | null;
  consensusImpliedProbability: number | null;
  consensusLine: number | null;
  snapshotAgeSeconds: number | null;
  staleFlag: boolean;
  staleCount: number;
  marketDisagreementScore: number;
  openToCurrentDelta: number | null;
  lineMovement: LineMovementSummaryView;
  notes: string[];
};

export type MarketPathBookRole =
  | "LEADER"
  | "CONFIRMER"
  | "FOLLOWER"
  | "LAGGER"
  | "OUTLIER"
  | "UNCLASSIFIED";

export type MarketPathSynchronizationState =
  | "BROAD_CONFIRMATION"
  | "PARTIAL_CONFIRMATION"
  | "FRAGMENTED"
  | "NO_PATH";

export type MarketPathRegime =
  | "STALE_COPY"
  | "LEADER_CONFIRMED"
  | "BROAD_REPRICE"
  | "FRAGMENTED"
  | "NO_SIGNAL";

export type MarketPathExecutionHint =
  | "HIT_NOW"
  | "WAIT_FOR_COPY"
  | "WATCH"
  | "SUPPRESS";

export type MarketPathBookDebugView = {
  sportsbookKey: string;
  sportsbookName: string;
  role: MarketPathBookRole;
  lastMoveAt: string | null;
  moveCount: number;
  currentOddsAmerican: number | null;
  currentLine: number | null;
  betterThanConsensus: boolean;
  notes: string[];
};

export type MarketPathView = {
  regime: MarketPathRegime;
  leaderCandidates: string[];
  confirmerBooks: string[];
  followerBooks: string[];
  laggingBooks: string[];
  outlierBooks: string[];
  confirmationCount: number;
  confirmationQuality: number;
  leaderFollowerConfidence: number;
  synchronizationState: MarketPathSynchronizationState;
  repriceSpread: number | null;
  staleCopyConfidence: number;
  staleCopyReasons: string[];
  staleCopySuppressed: boolean;
  executionHint: MarketPathExecutionHint;
  moveCoherenceScore: number;
  notes: string[];
  debug: MarketPathBookDebugView[];
};

export type EvResultView = {
  edgePct: number;
  evPerUnit: number | null;
  minimumBeProb: number | null;
  fairLineGap: number | null;
  rankScore: number;
  kellyFraction: number | null;
};

export type NbaModelFactorView = {
  label: string;
  awayValue: string;
  homeValue: string;
  note?: string;
};

export type NbaModelHookView = {
  available: boolean;
  source: string;
  adjustedEfficiencyMargin: number | null;
  awayNetRating: number | null;
  homeNetRating: number | null;
  tempo: number | null;
  injuryImpactPoints: number | null;
  factors: NbaModelFactorView[];
  note: string;
};

export type BoardMarketView = {
  label: string;
  lineLabel: string;
  bestBook: string;
  bestOdds: number;
  movement: number;
  canonicalMarketKey?: string | null;
  marketTruth?: MarketTruthView | null;
  fairPrice?: FairPriceView | null;
  evProfile?: EvResultView | null;
  marketIntelligence?: MarketIntelligenceView | null;
  marketPath?: MarketPathView | null;
  reasons?: ReasonAttributionView[];
  confidenceBand?: ConfidenceBand;
  confidenceScore?: number;
  hidden?: boolean;
};

export type GameCardView = {
  id: string;
  externalEventId: string;
  leagueKey: LeagueKey;
  awayTeam: TeamRecord;
  homeTeam: TeamRecord;
  startTime: string;
  status: GameStatus;
  venue: string;
  selectedBook: SportsbookRecord | null;
  bestBookCount: number;
  spread: BoardMarketView;
  moneyline: BoardMarketView;
  total: BoardMarketView;
  edgeScore: {
    score: number;
    label: EdgeBand;
  };
  detailHref?: string;
};

export type ScoreboardPreviewView = {
  id: string;
  label: string;
  status: GameStatus;
  stateDetail: string | null;
  scoreboard: string | null;
  startTime: string;
  providerKey: string;
  stale: boolean;
  detailHref?: string;
};

export type BoardSportSectionView = {
  leagueKey: LeagueKey;
  leagueLabel: string;
  sport: SportCode;
  status: BoardSupportStatus;
  liveScoreProvider: string | null;
  currentOddsProvider: string | null;
  historicalOddsProvider: string | null;
  propsStatus: BoardSupportStatus;
  propsProviders: string[];
  propsNote: string;
  note: string;
  detail: string;
  scoreboardDetail: string;
  adapterState: "BOARD" | "SCORES_ONLY" | "ADAPTER_PENDING" | "COMING_SOON" | "NO_EVENTS";
  stale: boolean;
  games: GameCardView[];
  scoreboard: ScoreboardPreviewView[];
};

export type BoardPageData = {
  filters: BoardFilters;
  availableDates: string[];
  leagues: LeagueRecord[];
  sportsbooks: SportsbookRecord[];
  games: GameCardView[];
  sportSections: BoardSportSectionView[];
  snapshots: LeagueSnapshotView[];
  summary: {
    totalGames: number;
    totalProps: number;
    totalSportsbooks: number;
  };
  liveMessage: string | null;
  source: "live" | "mock";
  sourceNote: string;
  providerHealth: ProviderHealthView;
};

export type LeagueSnapshotView = {
  league: LeagueRecord;
  standings: Array<{
    rank: number;
    team: TeamRecord;
    record: string;
    streak: string;
    netRating: number;
  }>;
  previousGames: Array<{
    id: string;
    playedAt: string;
    awayTeam: TeamRecord;
    homeTeam: TeamRecord;
    awayScore: number;
    homeScore: number;
  }>;
  featuredGames?: Array<{
    id: string;
    startTime: string;
    awayTeam: TeamRecord;
    homeTeam: TeamRecord;
    awayScore: number | null;
    homeScore: number | null;
    status: GameStatus;
    stateDetail: string | null;
    href: string;
  }>;
  seasonState?: "ACTIVE" | "OFFSEASON";
  sourceLabel?: string | null;
  note?: string | null;
  newsItems?: Array<{
    id: string;
    leagueKey: LeagueKey;
    title: string;
    href: string | null;
    publishedAt: string | null;
    summary: string | null;
    category: string | null;
    imageUrl?: string | null;
    eventId?: string | null;
    eventHref?: string | null;
    eventLabel?: string | null;
    boxscore?: {
      awayTeam?: string | null;
      homeTeam?: string | null;
      awayScore?: number | null;
      homeScore?: number | null;
    } | null;
  }>;
  offseasonItems?: Array<{
    title: string;
    body: string;
  }>;
};

export type LeagueMetaCard = {
  id: string;
  title: string;
  subtitle: string;
  badgeUrl?: string | null;
  fanartUrl?: string | null;
  stadium?: string | null;
  location?: string | null;
  website?: string | null;
  source: "sportsdb";
};

export type TrendAdvisorCard = {
  id: string;
  title: string;
  angle: string;
  confidenceLabel: "Measured" | "Strong" | "Aggressive";
  confidenceScore: number;
  summary: string;
  reasons: string[];
  href: string;
  source: "sharkedge";
};

export type ArbitrageOpportunityView = {
  id: string;
  leagueKey: LeagueKey;
  eventLabel: string;
  startTime: string;
  marketLabel: "Moneyline";
  profitPct: number;
  impliedTotalPct: number;
  homeBook: string;
  awayBook: string;
  homeOddsAmerican: number;
  awayOddsAmerican: number;
  detailHref: string;
  source: "internal_catalog" | "external_provider";
  note: string;
};

export type GameOddsRow = {
  sportsbook: SportsbookRecord;
  spread: string;
  moneyline: string;
  total: string;
};

export type PropCardView = {
  id: string;
  gameId: string;
  leagueKey: LeagueKey;
  sportsbook: SportsbookRecord;
  player: PlayerRecord;
  team: TeamRecord;
  opponent: TeamRecord;
  marketType: PropMarketType;
  side: string;
  line: number;
  oddsAmerican: number;
  recentHitRate?: number | null;
  matchupRank?: number | null;
  gameLabel?: string;
  teamResolved?: boolean;
  sportsbookCount?: number;
  bestAvailableOddsAmerican?: number | null;
  bestAvailableSportsbookName?: string | null;
  averageOddsAmerican?: number | null;
  marketDeltaAmerican?: number | null;
  expectedValuePct?: number | null;
  lineMovement?: number | null;
  valueFlag?: "BEST_PRICE" | "MARKET_PLUS" | "STEAM" | "NONE";
  supportStatus?: BoardSupportStatus;
  supportNote?: string | null;
  gameHref?: string;
  canonicalMarketKey?: string | null;
  analyticsSummary?: {
    tags: string[];
    reason: string;
    sampleSize: number | null;
    clvProxyPct?: number | null;
    hitRatePct?: number | null;
    bookCount: number;
    avgStat?: number | null;
    lineMovement?: number | null;
  } | null;
  trendSummary?: {
    label: string;
    value: string;
    note: string;
    href?: string | null;
  } | null;
  marketTruth?: MarketTruthView | null;
  fairPrice?: FairPriceView | null;
  evProfile?: EvResultView | null;
  marketIntelligence?: MarketIntelligenceView | null;
  marketPath?: MarketPathView | null;
  reasons?: ReasonAttributionView[];
  confidenceBand?: ConfidenceBand;
  confidenceScore?: number;
  hidden?: boolean;
  source?: "live" | "mock";
  edgeScore: {
    score: number;
    label: EdgeBand;
  };
};

export type BetSignalView = {
  id: string;
  marketType: MarketType | PropMarketType;
  marketLabel: string;
  selection: string;
  side?: string | null;
  line?: number | null;
  oddsAmerican: number;
  sportsbookName: string | null;
  sportsbookKey?: string | null;
  eventLabel: string;
  externalEventId?: string | null;
  matchupHref?: string | null;
  supportStatus: BoardSupportStatus;
  supportNote?: string | null;
  marketDeltaAmerican?: number | null;
  expectedValuePct?: number | null;
  valueFlag?: "BEST_PRICE" | "MARKET_PLUS" | "STEAM" | "NONE";
  canonicalMarketKey?: string | null;
  marketTruth?: MarketTruthView | null;
  fairPrice?: FairPriceView | null;
  evProfile?: EvResultView | null;
  marketIntelligence?: MarketIntelligenceView | null;
  marketPath?: MarketPathView | null;
  reasons?: ReasonAttributionView[];
  confidenceBand?: ConfidenceBand;
  confidenceScore?: number;
  hidden?: boolean;
  confidenceTier: "A" | "B" | "C";
  edgeScore: {
    score: number;
    label: EdgeBand;
  };
};

export type MatchupMetricView = {
  label: string;
  value: string;
  note?: string;
};

export type MatchupRecentResultView = {
  id: string;
  label: string;
  result: string;
  note: string;
};

export type MatchupBoxscoreRowView = {
  id: string;
  playerName: string;
  position: string | null;
  metrics: MatchupMetricView[];
};

export type MatchupParticipantView = {
  id: string;
  name: string;
  abbreviation: string | null;
  role: "HOME" | "AWAY" | "COMPETITOR_A" | "COMPETITOR_B" | "UNKNOWN";
  record: string | null;
  score: string | null;
  isWinner: boolean | null;
  subtitle: string | null;
  stats: MatchupMetricView[];
  leaders: MatchupMetricView[];
  boxscore: MatchupMetricView[];
  boxscoreRows: MatchupBoxscoreRowView[];
  recentResults: MatchupRecentResultView[];
  notes: string[];
};

export type MatchupTrendCardView = {
  id: string;
  title: string;
  value: string;
  note: string;
  href?: string | null;
  tone: "success" | "brand" | "premium" | "muted";
};

export type MatchupOddsSummaryView = {
  bestSpread: string | null;
  bestMoneyline: string | null;
  bestTotal: string | null;
  sourceLabel: string | null;
};

export type MatchupDetailView = {
  routeId: string;
  externalEventId: string;
  league: LeagueRecord;
  eventLabel: string;
  eventType: "TEAM_HEAD_TO_HEAD" | "COMBAT_HEAD_TO_HEAD" | "OTHER";
  status: GameStatus;
  stateDetail: string | null;
  scoreboard: string | null;
  venue: string | null;
  startTime: string;
  supportStatus: BoardSupportStatus;
  supportNote: string;
  liveScoreProvider: string | null;
  statsProvider: string | null;
  currentOddsProvider: string | null;
  historicalOddsProvider: string | null;
  hasVerifiedOdds: boolean;
  lastUpdatedAt: string | null;
  providerHealth: ProviderHealthView;
  participants: MatchupParticipantView[];
  oddsSummary: MatchupOddsSummaryView | null;
  books: GameOddsRow[];
  props: PropCardView[];
  betSignals: BetSignalView[];
  propsSupport: {
    status: BoardSupportStatus;
    note: string;
    supportedMarkets: PropMarketType[];
  };
  nbaModel: NbaModelHookView | null;
  marketRanges: Array<{
    label: string;
    value: string;
  }>;
  lineMovement: Array<{
    capturedAt: string;
    spreadLine: number | null;
    totalLine: number | null;
  }>;
  trendCards: MatchupTrendCardView[];
  notes: string[];
  source: "live" | "mock" | "catalog";
};

export type GameDetailView = {
  game: GameRecord;
  league: LeagueRecord;
  awayTeam: TeamRecord;
  homeTeam: TeamRecord;
  books: GameOddsRow[];
  bestMarkets: {
    spread: BoardMarketView;
    moneyline: BoardMarketView;
    total: BoardMarketView;
  };
  edgeScore: {
    score: number;
    label: EdgeBand;
  };
  consensus: string;
  insights: string[];
  injuries: Array<{
    id: string;
    playerName: string | null;
    teamName: string | null;
    status: PlayerStatus;
    source: string;
    reportedAt: string;
  }>;
  props: PropCardView[];
  matchup: {
    away: {
      team: TeamRecord;
      stats: Record<string, number | string>;
    };
    home: {
      team: TeamRecord;
      stats: Record<string, number | string>;
    };
  };
  lineMovement: Array<{
    capturedAt: string;
    spreadLine: number | null;
    totalLine: number | null;
  }>;
  marketRanges?: Array<{
    label: string;
    value: string;
  }>;
  propsNotice?: string;
  source?: "live" | "mock";
  providerHealth: ProviderHealthView;
};

export type BetSummary = {
  record: string;
  units: number;
  roi: number;
  winRate: number;
  totalBets: number;
};

export type PerformanceBreakdownRow = {
  label: string;
  bets: number;
  winRate: number;
  roi: number;
  units: number;
};

export type PerformanceView = {
  summary: BetSummary & {
    averageOdds: number;
    clv: number;
  };
  bySport: PerformanceBreakdownRow[];
  byMarket: PerformanceBreakdownRow[];
  bySportsbook: PerformanceBreakdownRow[];
  byTiming: PerformanceBreakdownRow[];
  trend: Array<{
    label: string;
    units: number;
  }>;
  bestAngles: string[];
  leaks: string[];
};

export type TrendPreview = {
  metrics: Array<{
    label: string;
    value: string;
    note: string;
  }>;
  savedTrendName: string;
};

export type TrendSetupState = {
  status: "blocked";
  title: string;
  detail: string;
  steps: string[];
};

export type TrendMode = "simple" | "power";

export type TrendParsedQueryView = {
  input: string;
  confidence: "high" | "medium" | "low";
  note: string;
  parsedFilters: TrendFilters;
  unresolved: string[];
};

export type TrendExplanationView = {
  headline: string;
  whyItMatters: string;
  caution: string;
  queryLogic: string;
};

export type TrendMatchView = {
  id: string;
  sport: SportCode;
  leagueKey: LeagueKey;
  eventLabel: string;
  startTime: string;
  status: GameStatus;
  stateDetail: string | null;
  matchingLogic: string;
  recommendedBetLabel: string | null;
  oddsContext: string | null;
  matchupHref: string;
  boardHref: string | null;
  propsHref: string | null;
  supportNote: string | null;
};

export type SavedTrendSystemView = {
  id: string;
  name: string;
  sport: SportCode;
  filters: TrendFilters;
  aiQuery: string | null;
  mode: TrendMode;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  currentMatchCount: number;
  sampleSize: number | null;
  roi: string | null;
  hitRate: string | null;
  href: string;
};

export type TrendMetricCard = {
  label: string;
  value: string;
  note: string;
};

export type TrendInsightCard = {
  id: string;
  title: string;
  value: string;
  note: string;
  tone: "success" | "brand" | "premium" | "muted";
};

export type TrendTableRow = {
  label: string;
  movement: string;
  note: string;
  href?: string | null;
};

export type TrendCardView = {
  id: string;
  title: string;
  value: string;
  hitRate: string | null;
  roi: string | null;
  sampleSize: number;
  dateRange: string;
  note: string;
  explanation?: string | null;
  whyItMatters?: string | null;
  caution?: string | null;
  href?: string | null;
  tone: "success" | "brand" | "premium" | "muted";
  todayMatches?: TrendMatchView[];
};

export type TrendDashboardView = {
  setup: TrendSetupState | null;
  mode: TrendMode;
  aiQuery: string;
  aiHelper: TrendParsedQueryView | null;
  explanation: TrendExplanationView | null;
  filters: TrendFilters;
  cards: TrendCardView[];
  metrics: TrendMetricCard[];
  insights: TrendInsightCard[];
  movementRows: TrendTableRow[];
  segmentRows: TrendTableRow[];
  todayMatches: TrendMatchView[];
  todayMatchesNote: string | null;
  savedSystems: SavedTrendSystemView[];
  savedTrendName: string;
  sourceNote: string;
  querySummary: string;
  sampleNote: string | null;
};

export type BetFormInput = {
  date: string;
  sport: SportCode;
  league: LeagueKey;
  marketType: MarketType;
  side: string;
  line: number | null;
  oddsAmerican: number;
  sportsbookId: string;
  stake: number;
  notes: string;
  tags: string;
  gameId?: string;
  playerId?: string;
};
