import type { BoardSupportStatus, LeagueKey, MarketType } from "@/lib/types/domain";
import { backendCurrentOddsProvider } from "@/services/current-odds/backend-provider";
import { boxingEventProvider } from "@/services/events/boxing-provider";
import { espnEventProvider } from "@/services/events/espn-provider";
import { mlbOfficialEventProvider } from "@/services/events/mlb-official-provider";
import { ncaaFallbackEventProvider } from "@/services/events/ncaa-fallback-provider";
import { sportsdataverseEventProvider } from "@/services/events/sportsdataverse-provider";
import { ufcEventProvider } from "@/services/events/ufc-provider";
import { oddsharvesterHistoricalProvider } from "@/services/historical-odds/oddsharvester-provider";
import { boxingMatchupStatsProvider } from "@/services/stats/boxing-stats-provider";
import { espnMatchupStatsProvider } from "@/services/stats/espn-stats-provider";
import type { MatchupStatsProvider } from "@/services/stats/provider-types";
import { ufcMatchupStatsProvider } from "@/services/stats/ufc-stats-provider";

import type { CurrentOddsProvider } from "@/services/current-odds/provider-types";
import { getBookFeedLabelsForLeague } from "@/services/current-odds/book-feed-registry";
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

export type ProviderSourceStage =
  | "ACTIVE"
  | "FALLBACK"
  | "READY_TO_LAYER"
  | "EXPERIMENTAL"
  | "HISTORICAL_ONLY";

export type ProviderSourceDescriptor = {
  name: string;
  stage: ProviderSourceStage;
  url: string;
  note: string;
};

export type LeagueSourceMesh = {
  scores: ProviderSourceDescriptor[];
  stats: ProviderSourceDescriptor[];
  currentOdds: ProviderSourceDescriptor[];
  historical: ProviderSourceDescriptor[];
};

export type LeagueProviderRegistryEntry = {
  leagueKey: LeagueKey;
  status: BoardSupportStatus;
  scoreProviders: EventProvider[];
  matchupProviders: MatchupStatsProvider[];
  currentOddsProviders: CurrentOddsProvider[];
  bookFeedProviders: string[];
  historicalProviders: HistoricalOddsIngestionProvider[];
  propsStatus: BoardSupportStatus;
  propsProviders: string[];
  supportedPropMarkets: PropMarketType[];
  propsNote: string;
  sourceMesh: LeagueSourceMesh;
};

export const PROVIDER_REGISTRY: Record<LeagueKey, LeagueProviderRegistryEntry> = {
  NBA: {
    leagueKey: "NBA",
    status: "LIVE",
    scoreProviders: [espnEventProvider, sportsdataverseEventProvider],
    matchupProviders: [espnMatchupStatsProvider],
    currentOddsProviders: [backendCurrentOddsProvider],
    bookFeedProviders: getBookFeedLabelsForLeague("NBA"),
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
      "Live basketball player props are wired through the current odds backend.",
    sourceMesh: {
      scores: [
        {
          name: "ESPN Public API",
          stage: "ACTIVE",
          url: "https://github.com/pseudo-r/Public-ESPN-API",
          note: "Primary live scoreboard and event-state feed already in production."
        },
        {
          name: "sportsdataverse-js",
          stage: "READY_TO_LAYER",
          url: "https://github.com/sportsdataverse/sportsdataverse-js",
          note: "Strong no-cost enrichment path for schedule, standings, and play-by-play depth."
        }
      ],
      stats: [
        {
          name: "ESPN Public API",
          stage: "ACTIVE",
          url: "https://github.com/pseudo-r/Public-ESPN-API",
          note: "Current matchup detail and team/player context."
        },
        {
          name: "nba_api",
          stage: "READY_TO_LAYER",
          url: "https://github.com/swar/nba_api",
          note: "Best free path for deeper NBA player, team, and live box-score detail."
        },
        {
          name: "sportsdataverse-js",
          stage: "READY_TO_LAYER",
          url: "https://github.com/sportsdataverse/sportsdataverse-js",
          note: "Useful backup layer for ESPN-derived basketball detail."
        }
      ],
      currentOdds: [
        {
          name: "SharkEdge odds backend",
          stage: "ACTIVE",
          url: "https://github.com/steveo1287/shark-odds",
          note: "Existing current odds path stays primary."
        }
      ],
      historical: [
        {
          name: "OddsHarvester",
          stage: "HISTORICAL_ONLY",
          url: "https://github.com/jordantete/OddsHarvester",
          note: "Background-only opening/current/closing odds ingestion."
        }
      ]
    }
  },
  MLB: {
    leagueKey: "MLB",
    status: "LIVE",
    scoreProviders: [espnEventProvider, mlbOfficialEventProvider],
    matchupProviders: [espnMatchupStatsProvider],
    currentOddsProviders: [backendCurrentOddsProvider],
    bookFeedProviders: getBookFeedLabelsForLeague("MLB"),
    historicalProviders: [oddsharvesterHistoricalProvider],
    propsStatus: "PARTIAL",
    propsProviders: [],
    supportedPropMarkets: [],
    propsNote:
      "MLB matchup coverage is live, but prop ingestion is not connected yet.",
    sourceMesh: {
      scores: [
        {
          name: "ESPN Public API",
          stage: "ACTIVE",
          url: "https://github.com/pseudo-r/Public-ESPN-API",
          note: "Primary live scoreboard feed."
        },
        {
          name: "Official MLB schedule API",
          stage: "FALLBACK",
          url: "https://statsapi.mlb.com/api/v1/schedule",
          note: "Fallback slate source when ESPN returns empty or times out."
        },
        {
          name: "sportsdataverse-js",
          stage: "READY_TO_LAYER",
          url: "https://github.com/sportsdataverse/sportsdataverse-js",
          note: "No-cost enrichment path for schedules, standings, and play-by-play."
        }
      ],
      stats: [
        {
          name: "ESPN Public API",
          stage: "ACTIVE",
          url: "https://github.com/pseudo-r/Public-ESPN-API",
          note: "Current matchup detail layer."
        },
        {
          name: "sportsdataverse-js",
          stage: "READY_TO_LAYER",
          url: "https://github.com/sportsdataverse/sportsdataverse-js",
          note: "Useful MLB stat enrichment path via sportsdataverse tooling."
        }
      ],
      currentOdds: [
        {
          name: "SharkEdge odds backend",
          stage: "ACTIVE",
          url: "https://github.com/steveo1287/shark-odds",
          note: "Existing current odds path stays primary."
        }
      ],
      historical: [
        {
          name: "OddsHarvester",
          stage: "HISTORICAL_ONLY",
          url: "https://github.com/jordantete/OddsHarvester",
          note: "Background-only opening/current/closing odds ingestion."
        }
      ]
    }
  },
  NHL: {
    leagueKey: "NHL",
    status: "LIVE",
    scoreProviders: [espnEventProvider],
    matchupProviders: [espnMatchupStatsProvider],
    currentOddsProviders: [backendCurrentOddsProvider],
    bookFeedProviders: getBookFeedLabelsForLeague("NHL"),
    historicalProviders: [oddsharvesterHistoricalProvider],
    propsStatus: "PARTIAL",
    propsProviders: [],
    supportedPropMarkets: [],
    propsNote:
      "NHL matchup coverage is live, but prop ingestion is not connected yet.",
    sourceMesh: {
      scores: [
        {
          name: "ESPN Public API",
          stage: "ACTIVE",
          url: "https://github.com/pseudo-r/Public-ESPN-API",
          note: "Primary live scoreboard feed."
        },
        {
          name: "sportsdataverse-js",
          stage: "READY_TO_LAYER",
          url: "https://github.com/sportsdataverse/sportsdataverse-js",
          note: "Extra no-cost hockey coverage layer."
        }
      ],
      stats: [
        {
          name: "ESPN Public API",
          stage: "ACTIVE",
          url: "https://github.com/pseudo-r/Public-ESPN-API",
          note: "Current matchup detail layer."
        },
        {
          name: "sportsdataverse-js",
          stage: "READY_TO_LAYER",
          url: "https://github.com/sportsdataverse/sportsdataverse-js",
          note: "Useful backup for schedules and game context."
        }
      ],
      currentOdds: [
        {
          name: "SharkEdge odds backend",
          stage: "ACTIVE",
          url: "https://github.com/steveo1287/shark-odds",
          note: "Existing current odds path stays primary."
        }
      ],
      historical: [
        {
          name: "OddsHarvester",
          stage: "HISTORICAL_ONLY",
          url: "https://github.com/jordantete/OddsHarvester",
          note: "Background-only opening/current/closing odds ingestion."
        }
      ]
    }
  },
  NFL: {
    leagueKey: "NFL",
    status: "LIVE",
    scoreProviders: [espnEventProvider],
    matchupProviders: [espnMatchupStatsProvider],
    currentOddsProviders: [backendCurrentOddsProvider],
    bookFeedProviders: getBookFeedLabelsForLeague("NFL"),
    historicalProviders: [oddsharvesterHistoricalProvider],
    propsStatus: "PARTIAL",
    propsProviders: [],
    supportedPropMarkets: [],
    propsNote:
      "NFL matchup coverage is live, but prop ingestion is not connected yet.",
    sourceMesh: {
      scores: [
        {
          name: "ESPN Public API",
          stage: "ACTIVE",
          url: "https://github.com/pseudo-r/Public-ESPN-API",
          note: "Primary live scoreboard feed."
        },
        {
          name: "sportsdataverse-js",
          stage: "READY_TO_LAYER",
          url: "https://github.com/sportsdataverse/sportsdataverse-js",
          note: "Useful for scoreboard, schedule, and richer football event context."
        }
      ],
      stats: [
        {
          name: "ESPN Public API",
          stage: "ACTIVE",
          url: "https://github.com/pseudo-r/Public-ESPN-API",
          note: "Current matchup detail layer."
        },
        {
          name: "nflreadpy",
          stage: "READY_TO_LAYER",
          url: "https://github.com/nflverse/nflreadpy",
          note: "Best free NFL historical/stats depth path from nflverse."
        },
        {
          name: "sportsdataverse-js",
          stage: "READY_TO_LAYER",
          url: "https://github.com/sportsdataverse/sportsdataverse-js",
          note: "Good backup for scoreboard and schedule coverage."
        }
      ],
      currentOdds: [
        {
          name: "SharkEdge odds backend",
          stage: "ACTIVE",
          url: "https://github.com/steveo1287/shark-odds",
          note: "Existing current odds path stays primary."
        }
      ],
      historical: [
        {
          name: "OddsHarvester",
          stage: "HISTORICAL_ONLY",
          url: "https://github.com/jordantete/OddsHarvester",
          note: "Background-only opening/current/closing odds ingestion."
        },
        {
          name: "nflreadpy",
          stage: "READY_TO_LAYER",
          url: "https://github.com/nflverse/nflreadpy",
          note: "Strong free add-on for NFL result context and historical trend depth."
        }
      ]
    }
  },
  NCAAF: {
    leagueKey: "NCAAF",
    status: "LIVE",
    scoreProviders: [espnEventProvider, ncaaFallbackEventProvider, sportsdataverseEventProvider],
    matchupProviders: [espnMatchupStatsProvider],
    currentOddsProviders: [backendCurrentOddsProvider],
    bookFeedProviders: getBookFeedLabelsForLeague("NCAAF"),
    historicalProviders: [oddsharvesterHistoricalProvider],
    propsStatus: "PARTIAL",
    propsProviders: [],
    supportedPropMarkets: [],
    propsNote:
      "College football matchup coverage is live, but prop ingestion is not connected yet.",
    sourceMesh: {
      scores: [
        {
          name: "ESPN Public API",
          stage: "ACTIVE",
          url: "https://github.com/pseudo-r/Public-ESPN-API",
          note: "Primary live scoreboard feed."
        },
        {
          name: "ncaa-api",
          stage: "FALLBACK",
          url: "https://github.com/henrygd/ncaa-api",
          note: "Free fallback for college football scoreboard, stats, rankings, and game detail."
        },
        {
          name: "sportsdataverse-js",
          stage: "READY_TO_LAYER",
          url: "https://github.com/sportsdataverse/sportsdataverse-js",
          note: "Good no-cost enrichment path for college football context."
        }
      ],
      stats: [
        {
          name: "ESPN Public API",
          stage: "ACTIVE",
          url: "https://github.com/pseudo-r/Public-ESPN-API",
          note: "Current matchup detail layer."
        },
        {
          name: "ncaa-api",
          stage: "FALLBACK",
          url: "https://github.com/henrygd/ncaa-api",
          note: "Useful for rankings, standings, and game-level college detail."
        },
        {
          name: "sportsdataverse-js",
          stage: "READY_TO_LAYER",
          url: "https://github.com/sportsdataverse/sportsdataverse-js",
          note: "Adds broader college football depth without paid sources."
        }
      ],
      currentOdds: [
        {
          name: "SharkEdge odds backend",
          stage: "ACTIVE",
          url: "https://github.com/steveo1287/shark-odds",
          note: "Existing current odds path stays primary."
        }
      ],
      historical: [
        {
          name: "OddsHarvester",
          stage: "HISTORICAL_ONLY",
          url: "https://github.com/jordantete/OddsHarvester",
          note: "Background-only opening/current/closing odds ingestion."
        }
      ]
    }
  },
  UFC: {
    leagueKey: "UFC",
    status: "LIVE",
    scoreProviders: [ufcEventProvider],
    matchupProviders: [ufcMatchupStatsProvider],
    currentOddsProviders: [backendCurrentOddsProvider],
    bookFeedProviders: [],
    historicalProviders: [],
    propsStatus: "PARTIAL",
    propsProviders: [],
    supportedPropMarkets: [],
    propsNote:
      "UFC event and fighter detail are wired through a dedicated MMA source path, but live combat odds and props are still pending.",
    sourceMesh: {
      scores: [
        {
          name: "SharkEdge UFC source",
          stage: "ACTIVE",
          url: "https://github.com/steveo1287/shark-odds",
          note: "Current dedicated MMA provider path in the app."
        }
      ],
      stats: [
        {
          name: "SharkEdge UFC source",
          stage: "ACTIVE",
          url: "https://github.com/steveo1287/shark-odds",
          note: "Current event and fighter detail path."
        },
        {
          name: "ufcscrapeR",
          stage: "READY_TO_LAYER",
          url: "https://github.com/DavesAnalytics/ufcscrapeR",
          note: "Useful no-cost source for round-by-round historical UFC and Pride stats."
        }
      ],
      currentOdds: [],
      historical: [
        {
          name: "OddsHarvester",
          stage: "READY_TO_LAYER",
          url: "https://github.com/jordantete/OddsHarvester",
          note: "Can support historical combat odds snapshots once those markets are wired."
        }
      ]
    }
  },
  BOXING: {
    leagueKey: "BOXING",
    status: "LIVE",
    scoreProviders: [boxingEventProvider],
    matchupProviders: [boxingMatchupStatsProvider],
    currentOddsProviders: [backendCurrentOddsProvider],
    bookFeedProviders: [],
    historicalProviders: [],
    propsStatus: "COMING_SOON",
    propsProviders: [],
    supportedPropMarkets: [],
    propsNote:
      "Boxing is visible in the product, but live matchup and prop providers are still scaffold-only.",
    sourceMesh: {
      scores: [],
      stats: [
        {
          name: "boxrec",
          stage: "EXPERIMENTAL",
          url: "https://github.com/boxing/boxrec",
          note: "Useful conceptually, but the repo warns that reliability is currently poor."
        }
      ],
      currentOdds: [],
      historical: [
        {
          name: "OddsHarvester",
          stage: "READY_TO_LAYER",
          url: "https://github.com/jordantete/OddsHarvester",
          note: "Potential historical odds path once boxing event matching is reliable."
        }
      ]
    }
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

  return labels.map((item) => `${item.label}`).join(" + ");
}

export function formatSourceStageLabel(stage: ProviderSourceStage) {
  return stage.replace(/_/g, " ").toLowerCase();
}

export function formatSourceMeshGroup(sources: ProviderSourceDescriptor[]) {
  if (!sources.length) {
    return "None wired";
  }

  return sources.map((source) => `${source.name} (${formatSourceStageLabel(source.stage)})`).join(", ");
}
