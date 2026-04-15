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
