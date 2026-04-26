type SimRecommendation = "ATTACK" | "WATCH" | "BUILDING" | "PASS";
type SimConfidenceBand = "HIGH" | "MEDIUM" | "LOW";

type SimEvent = {
  id: string;
  eventKey: string | null;
  league: string;
  name: string;
  startTime: string;
  status: string;
  participants: Array<{ role: string; competitor: string }>;
  projection: any | null;
  markets: any[];
  topSignals: Array<{
    edgeScore: number | null;
    evPercent: number | null;
    selectionCompetitor: any;
    player: any;
    sportsbook: any;
    marketType: string;
    side: string | null;
  }>;
  diagnostics: {
    hasProjection: boolean;
    signalCount: number;
    bestEdgeScore: number | null;
    bestEvPercent: number | null;
    marketCount: number;
    smartScore: number;
    confidenceBand: SimConfidenceBand;
    recommendation: SimRecommendation;
  };
};

// Deterministic mock events — no Math.random() so SSR and client match
const MOCK_EVENTS: SimEvent[] = [
  {
    id: "mock-sim-0",
    eventKey: "mock-bos-mil",
    league: "NBA",
    name: "Milwaukee Bucks @ Boston Celtics",
    startTime: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
    status: "SCHEDULED",
    participants: [
      { role: "AWAY", competitor: "Milwaukee Bucks" },
      { role: "HOME", competitor: "Boston Celtics" }
    ],
    diagnostics: {
      hasProjection: true,
      signalCount: 3,
      bestEdgeScore: 72,
      bestEvPercent: 0.065,
      marketCount: 14,
      smartScore: 88,
      confidenceBand: "HIGH",
      recommendation: "ATTACK"
    },
    projection: {
      projectedHomeScore: 112,
      projectedAwayScore: 103,
      projectedTotal: 215,
      winProbHome: 0.61
    },
    markets: [],
    topSignals: [
      {
        marketType: "spread",
        edgeScore: 72,
        evPercent: 0.065,
        selectionCompetitor: { id: "team_bos", name: "Boston Celtics" },
        player: null,
        sportsbook: null,
        side: "HOME"
      },
      {
        marketType: "total",
        edgeScore: 58,
        evPercent: 0.038,
        selectionCompetitor: null,
        player: null,
        sportsbook: null,
        side: "OVER"
      },
      {
        marketType: "moneyline",
        edgeScore: 51,
        evPercent: 0.029,
        selectionCompetitor: { id: "team_bos", name: "Boston Celtics" },
        player: null,
        sportsbook: null,
        side: "HOME"
      }
    ]
  },
  {
    id: "mock-sim-1",
    eventKey: "mock-den-nyk",
    league: "NBA",
    name: "New York Knicks @ Denver Nuggets",
    startTime: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    status: "SCHEDULED",
    participants: [
      { role: "AWAY", competitor: "New York Knicks" },
      { role: "HOME", competitor: "Denver Nuggets" }
    ],
    diagnostics: {
      hasProjection: true,
      signalCount: 2,
      bestEdgeScore: 55,
      bestEvPercent: 0.041,
      marketCount: 11,
      smartScore: 71,
      confidenceBand: "MEDIUM",
      recommendation: "WATCH"
    },
    projection: {
      projectedHomeScore: 118,
      projectedAwayScore: 108,
      projectedTotal: 226,
      winProbHome: 0.58
    },
    markets: [],
    topSignals: [
      {
        marketType: "moneyline",
        edgeScore: 55,
        evPercent: 0.041,
        selectionCompetitor: { id: "team_den", name: "Denver Nuggets" },
        player: null,
        sportsbook: null,
        side: "HOME"
      },
      {
        marketType: "spread",
        edgeScore: 44,
        evPercent: 0.028,
        selectionCompetitor: { id: "team_den", name: "Denver Nuggets" },
        player: null,
        sportsbook: null,
        side: "HOME"
      }
    ]
  },
  {
    id: "mock-sim-2",
    eventKey: "mock-mia-lal",
    league: "NBA",
    name: "Miami Heat @ Los Angeles Lakers",
    startTime: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    status: "SCHEDULED",
    participants: [
      { role: "AWAY", competitor: "Miami Heat" },
      { role: "HOME", competitor: "Los Angeles Lakers" }
    ],
    diagnostics: {
      hasProjection: false,
      signalCount: 1,
      bestEdgeScore: 38,
      bestEvPercent: 0.019,
      marketCount: 8,
      smartScore: 42,
      confidenceBand: "LOW",
      recommendation: "BUILDING"
    },
    projection: null,
    markets: [],
    topSignals: [
      {
        marketType: "total",
        edgeScore: 38,
        evPercent: 0.019,
        selectionCompetitor: null,
        player: null,
        sportsbook: null,
        side: "UNDER"
      }
    ]
  },
  {
    id: "mock-sim-3",
    eventKey: "mock-bos-nyk-2",
    league: "NBA",
    name: "Boston Celtics @ New York Knicks",
    startTime: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(),
    status: "SCHEDULED",
    participants: [
      { role: "AWAY", competitor: "Boston Celtics" },
      { role: "HOME", competitor: "New York Knicks" }
    ],
    diagnostics: {
      hasProjection: true,
      signalCount: 2,
      bestEdgeScore: 63,
      bestEvPercent: 0.049,
      marketCount: 12,
      smartScore: 77,
      confidenceBand: "MEDIUM",
      recommendation: "WATCH"
    },
    projection: {
      projectedHomeScore: 106,
      projectedAwayScore: 109,
      projectedTotal: 215,
      winProbHome: 0.44
    },
    markets: [],
    topSignals: [
      {
        marketType: "spread",
        edgeScore: 63,
        evPercent: 0.049,
        selectionCompetitor: { id: "team_bos", name: "Boston Celtics" },
        player: null,
        sportsbook: null,
        side: "AWAY"
      },
      {
        marketType: "moneyline",
        edgeScore: 48,
        evPercent: 0.033,
        selectionCompetitor: { id: "team_bos", name: "Boston Celtics" },
        player: null,
        sportsbook: null,
        side: "AWAY"
      }
    ]
  }
];

export function buildFallbackSimBoard() {
  const attackable = MOCK_EVENTS.filter((e) => e.diagnostics.recommendation === "ATTACK").length;
  const projected = MOCK_EVENTS.filter((e) => e.diagnostics.hasProjection).length;
  const withSignals = MOCK_EVENTS.filter((e) => e.diagnostics.signalCount > 0).length;
  const marketReady = MOCK_EVENTS.filter((e) => e.diagnostics.marketCount > 3).length;

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalEvents: MOCK_EVENTS.length,
      projectedEvents: projected,
      signalEvents: withSignals,
      marketReadyEvents: marketReady,
      attackableEvents: attackable
    },
    events: MOCK_EVENTS
  };
}
