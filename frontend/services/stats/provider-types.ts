import type { BoardSupportStatus, GameStatus, LeagueKey, MarketType } from "@/lib/types/domain";

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

export type MatchupBoxscoreRow = {
  id: string;
  playerName: string;
  position: string | null;
  metrics: MatchupMetricView[];
};

export type MatchupParticipantPanel = {
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
  boxscoreRows: MatchupBoxscoreRow[];
  recentResults: MatchupRecentResultView[];
  notes: string[];
};

export type MatchupTrendCard = {
  id: string;
  title: string;
  value: string;
  note: string;
  tone: "success" | "brand" | "premium" | "muted";
};

export type MatchupOddsSummary = {
  bestSpread: string | null;
  bestMoneyline: string | null;
  bestTotal: string | null;
  sourceLabel: string | null;
};

export type MatchupPropsSupport = {
  status: BoardSupportStatus;
  note: string;
  supportedMarkets: Array<
    Extract<
      MarketType,
      | "player_points"
      | "player_rebounds"
      | "player_assists"
      | "player_threes"
      | "fight_winner"
      | "method_of_victory"
      | "round_total"
      | "round_winner"
    >
  >;
};

export type MatchupDetailPayload = {
  leagueKey: LeagueKey;
  externalEventId: string;
  label: string;
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
  lastUpdatedAt: string | null;
  participants: MatchupParticipantPanel[];
  oddsSummary: MatchupOddsSummary | null;
  marketRanges: Array<{
    label: string;
    value: string;
  }>;
  trendCards: MatchupTrendCard[];
  propsSupport: MatchupPropsSupport;
  notes: string[];
};

export interface MatchupStatsProvider {
  key: string;
  label: string;
  kind: "LIVE" | "PARTIAL" | "SCAFFOLD";
  supportsLeague(leagueKey: LeagueKey): boolean;
  fetchMatchupDetail(args: {
    leagueKey: LeagueKey;
    eventId: string;
  }): Promise<MatchupDetailPayload | null>;
}
