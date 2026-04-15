import type { LeagueKey } from "@/lib/types/domain";

export type CurrentOddsOffer = {
  name: string;
  best_price: number | null;
  best_bookmakers: string[];
  average_price: number | null;
  book_count: number;
  consensus_point: number | null;
  point_frequency: number;
};

export type CurrentOddsBookOutcome = {
  name: string;
  price: number | null;
  point: number | null;
};

export type CurrentOddsBookmaker = {
  key: string;
  title: string;
  last_update?: string;
  markets: {
    moneyline: CurrentOddsBookOutcome[];
    spread: CurrentOddsBookOutcome[];
    total: CurrentOddsBookOutcome[];
  };
};

export type CurrentOddsSharkScore = {
  score: number;
  label: string;
  tier: string;
  best_ev_market: string | null;
  best_ev: number | null;
  best_ev_pct: number | null;
  components: {
    ev: number;
    book_consensus: number;
    market_efficiency: number;
    line_movement: number;
  };
  movement_signal: string;
};

export type CurrentOddsEdgeAnalytics = {
  generated_at: string;
  sharkscore: CurrentOddsSharkScore;
  top_edges: Array<{
    market: string;
    outcome: string;
    ev: number | null;
    ev_pct: number | null;
    price: number | null;
    has_edge: boolean;
  }>;
  sharp_signals: Record<string, unknown>;
};

export type CurrentOddsGame = {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers_available: number;
  bookmakers: CurrentOddsBookmaker[];
  market_stats: {
    moneyline: CurrentOddsOffer[];
    spread: CurrentOddsOffer[];
    total: CurrentOddsOffer[];
  };
  edge_analytics?: CurrentOddsEdgeAnalytics | null;
  sharp_signals?: Record<string, unknown> | null;
};

export type CurrentOddsSport = {
  key: string;
  title: string;
  short_title: string;
  game_count: number;
  games: CurrentOddsGame[];
};

export type CurrentOddsBoardResponse = {
  configured: boolean;
  generated_at: string;
  provider?: string | null;
  provider_mode?: string | null;
  bookmakers: string;
  errors: string[];
  sports: CurrentOddsSport[];
};

export interface CurrentOddsProvider {
  key: string;
  label: string;
  supportsLeague(leagueKey: LeagueKey): boolean;
  fetchBoard(): Promise<CurrentOddsBoardResponse | null>;
}
