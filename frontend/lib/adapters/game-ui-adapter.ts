import type {
  BetSignalView,
  MatchupDetailView,
  MatchupTrendCardView,
  PropCardView
} from "@/lib/types/domain";

export type GameHubTabKey =
  | "for-you"
  | "markets"
  | "props"
  | "movement"
  | "splits"
  | "trends"
  | "kalshi"
  | "feed";

export type GameHubTabView = {
  key: GameHubTabKey;
  label: string;
  description: string;
  enabled: boolean;
};

export type GameHubView = {
  activeTab: GameHubTabKey;
  tabs: GameHubTabView[];
  hero: {
    title: string;
    subtitle: string;
    supportLabel: string;
    providerLabel: string | null;
    verifiedOddsLabel: string;
  };
  forYou: {
    primarySignal: BetSignalView | null;
    secondarySignals: BetSignalView[];
    topProps: PropCardView[];
    notes: string[];
  };
  markets: {
    hasVerifiedOdds: boolean;
    bookCount: number;
    summary: MatchupDetailView["oddsSummary"];
  };
  movement: {
    lineMovement: MatchupDetailView["lineMovement"];
    marketRanges: MatchupDetailView["marketRanges"];
    providerHealth: MatchupDetailView["providerHealth"];
  };
  props: {
    props: PropCardView[];
    support: MatchupDetailView["propsSupport"];
  };
  trends: {
    cards: MatchupTrendCardView[];
  };
  splits: {
    available: boolean;
    note: string;
  };
  kalshi: {
    available: boolean;
    note: string;
  };
  feed: {
    available: boolean;
    note: string;
  };
};

const DEFAULT_TAB: GameHubTabKey = "for-you";

export function parseGameHubTab(
  rawValue: string | string[] | undefined
): GameHubTabKey {
  const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;

  switch (value) {
    case "for-you":
    case "markets":
    case "props":
    case "movement":
    case "splits":
    case "trends":
    case "kalshi":
    case "feed":
      return value;
    default:
      return DEFAULT_TAB;
  }
}

export function adaptGameDetailToHub(
  detail: MatchupDetailView,
  activeTab: GameHubTabKey
): GameHubView {
  const tabs: GameHubTabView[] = [
    {
      key: "for-you",
      label: "For You",
      description: "Lead angle, posture, and immediate decision context.",
      enabled: true
    },
    {
      key: "markets",
      label: "Markets",
      description: "Books, best price, and execution context.",
      enabled: true
    },
    {
      key: "props",
      label: "Props",
      description: "Matchup-linked player markets.",
      enabled: true
    },
    {
      key: "movement",
      label: "Movement",
      description: "Line movement and current market range.",
      enabled: true
    },
    {
      key: "splits",
      label: "Splits",
      description: "Public handle, bet %, and money % intelligence.",
      enabled: true
    },
    {
      key: "trends",
      label: "Trends",
      description: "Historical and matchup-linked edge context.",
      enabled: true
    },
    {
      key: "kalshi",
      label: "Kalshi",
      description: "Probability overlays and event-market comparison.",
      enabled: true
    },
    {
      key: "feed",
      label: "Feed",
      description: "Research stream, matchup notes, and context flow.",
      enabled: true
    }
  ];

  return {
    activeTab,
    tabs,
    hero: {
      title: detail.eventLabel,
      subtitle:
        detail.supportNote ||
        "The matchup hub stays live only when the number earns the screen.",
      supportLabel: detail.supportStatus,
      providerLabel: detail.currentOddsProvider ?? detail.liveScoreProvider ?? null,
      verifiedOddsLabel: detail.hasVerifiedOdds
        ? `${detail.books.length} verified book${detail.books.length === 1 ? "" : "s"}`
        : "Odds still thin"
    },
    forYou: {
      primarySignal: detail.betSignals[0] ?? null,
      secondarySignals: detail.betSignals.slice(1, 4),
      topProps: detail.props.slice(0, 6),
      notes: detail.notes.slice(0, 4)
    },
    markets: {
      hasVerifiedOdds: detail.hasVerifiedOdds,
      bookCount: detail.books.length,
      summary: detail.oddsSummary
    },
    movement: {
      lineMovement: detail.lineMovement ?? [],
      marketRanges: detail.marketRanges ?? [],
      providerHealth: detail.providerHealth
    },
    props: {
      props: detail.props ?? [],
      support: detail.propsSupport
    },
    trends: {
      cards: detail.trendCards ?? []
    },
    splits: {
      available: false,
      note:
        "Public bet %, money %, and handle splits are not wired into the current matchup backend contract yet."
    },
    kalshi: {
      available: false,
      note:
        "Kalshi overlay data is not wired into the current matchup backend contract yet."
    },
    feed: {
      available: false,
      note:
        "News, social, and matchup feed streams are not wired into the current matchup backend contract yet."
    }
  };
}
