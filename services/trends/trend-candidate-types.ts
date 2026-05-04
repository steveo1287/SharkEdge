export type TrendFactoryLeague = "MLB" | "NBA" | "NFL" | "NHL" | "NCAAF" | "UFC" | "BOXING";
export type TrendFactoryMarket = "moneyline" | "spread" | "total" | "player_prop" | "fight_winner";
export type TrendFactorySide = "home" | "away" | "favorite" | "underdog" | "over" | "under" | "fighter" | "player_over" | "player_under";
export type TrendFactoryGate = "promote_candidate" | "watch_candidate" | "research_candidate" | "blocked_candidate";
export type TrendFactoryDepth = "core" | "expanded" | "debug";

export type TrendFilterCondition = {
  key: string;
  label: string;
  value: string;
  operator: "equals" | "range" | "includes" | "derived";
  family: string;
};

export type TrendCandidateSystem = {
  id: string;
  name: string;
  league: TrendFactoryLeague;
  market: TrendFactoryMarket;
  side: TrendFactorySide;
  filters: Record<string, string>;
  conditions: TrendFilterCondition[];
  dedupeKey: string;
  relatedKey: string;
  description: string;
  qualityGate: TrendFactoryGate;
  gateReasons: string[];
  blockers: string[];
  previewTags: string[];
  generatedBy: "trend_factory_v1";
};

export type TrendFactoryPreview = {
  generatedAt: string;
  depth: TrendFactoryDepth;
  totalCandidates: number;
  returnedCandidates: number;
  leagues: TrendFactoryLeague[];
  markets: TrendFactoryMarket[];
  candidates: TrendCandidateSystem[];
  gateCounts: Record<TrendFactoryGate, number>;
  dedupeGroups: Array<{ key: string; count: number; sampleIds: string[] }>;
  notes: string[];
};

export type TrendFactoryOptions = {
  league?: TrendFactoryLeague | "ALL";
  market?: TrendFactoryMarket | "ALL";
  depth?: TrendFactoryDepth;
  limit?: number;
};
