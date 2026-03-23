export type LeagueKey = "NBA" | "NCAAB";

export type SportCode = "BASKETBALL" | "BASEBALL" | "HOCKEY" | "FOOTBALL" | "OTHER";

export type GameStatus = "PREGAME" | "LIVE" | "FINAL" | "POSTPONED";

export type MarketType =
  | "spread"
  | "moneyline"
  | "total"
  | "player_points"
  | "player_rebounds"
  | "player_assists"
  | "player_threes";

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
  standings: Record<LeagueKey, LeagueStanding[]>;
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
  status: "pregame" | "live";
};

export type PropFilters = {
  league: "ALL" | LeagueKey;
  marketType: "ALL" | Exclude<MarketType, "spread" | "moneyline" | "total">;
  team: string;
  player: string;
  sportsbook: string;
  minEdge: number;
  minHitRate: number;
};

export type BetFilters = {
  state: "ALL" | "OPEN" | "SETTLED";
  sport: "ALL" | SportCode;
  market: "ALL" | MarketType;
  sportsbook: string;
};

export type BoardMarketView = {
  label: string;
  lineLabel: string;
  bestBook: string;
  bestOdds: number;
  movement: number;
};

export type GameCardView = {
  id: string;
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
  marketType: Exclude<MarketType, "spread" | "moneyline" | "total">;
  side: string;
  line: number;
  oddsAmerican: number;
  recentHitRate: number;
  matchupRank: number;
  edgeScore: {
    score: number;
    label: EdgeBand;
  };
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
