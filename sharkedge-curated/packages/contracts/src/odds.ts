import type { ProviderResult } from "./provider-types";

export type SportCode = "NFL" | "NCAAF" | "NBA" | "NCAAB" | "MLB" | "NHL" | "MMA";

export type MarketType =
  | "moneyline"
  | "spread"
  | "total"
  | "team_total"
  | "player_prop"
  | "alternate"
  | "period"
  | "quarter"
  | "half"
  | "future";

export type OddsOutcome = {
  outcomeId: string;
  label: string;
  side: string | null;
  line: number | null;
  americanOdds: number;
  impliedProbability: number;
};

export type MarketOffer = {
  eventId: string;
  marketId: string;
  marketType: MarketType;
  sportsbookKey: string;
  sportsbookName: string;
  period: string | null;
  isLive: boolean;
  updatedAt: string;
  outcomes: OddsOutcome[];
};

export type OddsQuery = {
  sport: SportCode;
  marketTypes: MarketType[];
  eventIds?: string[];
  sportsbookKeys?: string[];
  includeLive?: boolean;
};

export type NormalizedOddsSnapshot = {
  snapshotId: string;
  observedAt: string;
  offers: MarketOffer[];
};

export interface OddsProvider {
  readonly providerKey: string;
  fetchOdds(query: OddsQuery): Promise<ProviderResult<NormalizedOddsSnapshot>>;
}

export type FairPriceExplanation = {
  fairAmericanOdds: number;
  fairProbability: number;
  bestAmericanOdds: number;
  bestSportsbookKey: string;
  expectedValuePct: number;
  consensusAmericanOdds: number | null;
  noVigProbability: number | null;
  holdPct: number | null;
  staleLine: boolean;
  arbitrageDetected: boolean;
  reasons: string[];
  riskFlags: string[];
};
