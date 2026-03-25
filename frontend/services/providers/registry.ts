import type { BoardSupportStatus, LeagueKey, MarketType } from "@/lib/types/domain";
import { backendCurrentOddsProvider } from "@/services/current-odds/backend-provider";
import { boxingEventProvider } from "@/services/events/boxing-provider";
import { espnEventProvider } from "@/services/events/espn-provider";
import { ncaaFallbackEventProvider } from "@/services/events/ncaa-fallback-provider";
import { ufcEventProvider } from "@/services/events/ufc-provider";
import { oddsharvesterHistoricalProvider } from "@/services/historical-odds/oddsharvester-provider";
import { boxingMatchupStatsProvider } from "@/services/stats/boxing-stats-provider";
import { espnMatchupStatsProvider } from "@/services/stats/espn-stats-provider";
import type { MatchupStatsProvider } from "@/services/stats/provider-types";
import { ufcMatchupStatsProvider } from "@/services/stats/ufc-stats-provider";

import type { CurrentOddsProvider } from "@/services/current-odds/provider-types";
import type { EventProvider } from "@/services/events/provider-types";
import type { HistoricalOddsIngestionProvider } from "@/services/historical-odds/provider-types";

type PropMarketType = Extract<
  MarketType,
  | "player_points"
  | "player_rebounds"
  | "player_assists"
  | "player_threes"
  | "fight_winner"
  | "method_of_victory"
  | "round_total"
  | "round_winner"
>;

export type LeagueProviderRegistryEntry = {
  leagueKey: LeagueKey;
  status: BoardSupportStatus;
  scoreProviders: EventProvider[];
  matchupProviders: MatchupStatsProvider[];
  currentOddsProviders: CurrentOddsProvider[];
  historicalProviders: HistoricalOddsIngestionProvider[];
  propsStatus: BoardSupportStatus;
  propsProviders: string[];
  supportedPropMarkets: PropMarketType[];
  propsNote: string;
};

export const PROVIDER_REGISTRY: Record<LeagueKey, LeagueProviderRegistryEntry> = {
  NBA: {
    leagueKey: "NBA",
    status: "LIVE",
    scoreProviders: [espnEventProvider],
    matchupProviders: [espnMatchupStatsProvider],
    currentOddsProviders: [backendCurrentOddsProvider],
    historicalProviders: [oddsharvesterHistoricalProvider],
    propsStatus: "LIVE",
    propsProviders: ["Current odds backend"],
    supportedPropMarkets: [
      "player_points",
      "player_rebounds",
      "player_assists",
      "player_threes"
    ],
    propsNote:
      "Live basketball player props are wired through the current odds backend."
  },
  NCAAB: {
    leagueKey: "NCAAB",
    status: "LIVE",
    scoreProviders: [espnEventProvider, ncaaFallbackEventProvider],
    matchupProviders: [espnMatchupStatsProvider],
    currentOddsProviders: [backendCurrentOddsProvider],
    historicalProviders: [oddsharvesterHistoricalProvider],
    propsStatus: "LIVE",
    propsProviders: ["Current odds backend"],
    supportedPropMarkets: [
      "player_points",
      "player_rebounds",
      "player_assists",
      "player_threes"
    ],
    propsNote:
      "Live NCAAB player props are wired through the current odds backend."
  },
  MLB: {
    leagueKey: "MLB",
    status: "LIVE",
    scoreProviders: [espnEventProvider],
    matchupProviders: [espnMatchupStatsProvider],
    currentOddsProviders: [backendCurrentOddsProvider],
    historicalProviders: [oddsharvesterHistoricalProvider],
    propsStatus: "PARTIAL",
    propsProviders: [],
    supportedPropMarkets: [],
    propsNote:
      "MLB matchup coverage is live, but prop ingestion is not connected yet."
  },
  NHL: {
    leagueKey: "NHL",
    status: "LIVE",
    scoreProviders: [espnEventProvider],
    matchupProviders: [espnMatchupStatsProvider],
    currentOddsProviders: [backendCurrentOddsProvider],
    historicalProviders: [oddsharvesterHistoricalProvider],
    propsStatus: "PARTIAL",
    propsProviders: [],
    supportedPropMarkets: [],
    propsNote:
      "NHL matchup coverage is live, but prop ingestion is not connected yet."
  },
  NFL: {
    leagueKey: "NFL",
    status: "LIVE",
    scoreProviders: [espnEventProvider],
    matchupProviders: [espnMatchupStatsProvider],
    currentOddsProviders: [backendCurrentOddsProvider],
    historicalProviders: [oddsharvesterHistoricalProvider],
    propsStatus: "PARTIAL",
    propsProviders: [],
    supportedPropMarkets: [],
    propsNote:
      "NFL matchup coverage is live, but prop ingestion is not connected yet."
  },
  NCAAF: {
    leagueKey: "NCAAF",
    status: "LIVE",
    scoreProviders: [espnEventProvider, ncaaFallbackEventProvider],
    matchupProviders: [espnMatchupStatsProvider],
    currentOddsProviders: [backendCurrentOddsProvider],
    historicalProviders: [oddsharvesterHistoricalProvider],
    propsStatus: "PARTIAL",
    propsProviders: [],
    supportedPropMarkets: [],
    propsNote:
      "College football matchup coverage is live, but prop ingestion is not connected yet."
  },
  UFC: {
    leagueKey: "UFC",
    status: "PARTIAL",
    scoreProviders: [ufcEventProvider],
    matchupProviders: [ufcMatchupStatsProvider],
    currentOddsProviders: [],
    historicalProviders: [],
    propsStatus: "PARTIAL",
    propsProviders: [],
    supportedPropMarkets: [],
    propsNote:
      "UFC event and fighter detail are wired through a dedicated MMA source path, but live combat odds and props are still pending."
  },
  BOXING: {
    leagueKey: "BOXING",
    status: "COMING_SOON",
    scoreProviders: [boxingEventProvider],
    matchupProviders: [boxingMatchupStatsProvider],
    currentOddsProviders: [],
    historicalProviders: [],
    propsStatus: "COMING_SOON",
    propsProviders: [],
    supportedPropMarkets: [],
    propsNote:
      "Boxing is visible in the product, but live matchup and prop providers are still scaffold-only."
  }
};

export function getProviderRegistryEntry(leagueKey: LeagueKey) {
  return PROVIDER_REGISTRY[leagueKey];
}

export function getScoreProviders(leagueKey: LeagueKey) {
  return getProviderRegistryEntry(leagueKey)?.scoreProviders ?? [];
}

export function getMatchupProviders(leagueKey: LeagueKey) {
  return getProviderRegistryEntry(leagueKey)?.matchupProviders ?? [];
}

export function getCurrentOddsProviders(leagueKey: LeagueKey) {
  return getProviderRegistryEntry(leagueKey)?.currentOddsProviders ?? [];
}

export function getHistoricalProviders(leagueKey: LeagueKey) {
  return getProviderRegistryEntry(leagueKey)?.historicalProviders ?? [];
}

export function formatProviderLabels(labels: Array<{ label: string }>) {
  if (!labels.length) {
    return null;
  }

  if (labels.length === 1) {
    return labels[0].label;
  }

  return labels.map((item) => item.label).join(" + ");
}
