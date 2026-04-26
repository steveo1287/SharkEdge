import type {
  TrendCardView,
  TrendDashboardView,
  TrendFilters,
  TrendInsightCard,
  TrendMetricCard,
  TrendTableRow,
  SavedTrendSystemView
} from "@/lib/types/domain";

const NOW = new Date().toISOString();

const MOCK_TREND_CARDS: TrendCardView[] = [
  {
    id: "road-underdog-ats",
    title: "Road underdogs ATS",
    value: "58.3%",
    hitRate: "58.3%",
    roi: "+9.2%",
    sampleSize: 84,
    dateRange: "Last 365 days",
    note: "Road dogs covering at an above-market rate across major sports.",
    explanation: "Teams receiving fewer points from casual bettors tend to be undervalued when playing on the road.",
    whyItMatters: "Public bias toward favorites creates systematic value on road underdogs.",
    caution: "Sample skews toward lower-stakes regular season games.",
    href: "/trends?side=UNDERDOG",
    tone: "success"
  },
  {
    id: "home-favorite-ml",
    title: "Home favorites moneyline",
    value: "61.4%",
    hitRate: "61.4%",
    roi: "-3.1%",
    sampleSize: 121,
    dateRange: "Last 365 days",
    note: "Home favorites win outright at expected rate but are typically overpriced.",
    explanation: "High win rate is captured in the price — the juice eliminates edge.",
    whyItMatters: "Knowing when NOT to bet is as valuable as finding edges.",
    caution: "ROI turns negative once vig is factored in.",
    href: "/trends?side=HOME",
    tone: "muted"
  },
  {
    id: "overs-first-game-back",
    title: "Overs — teams returning from rest",
    value: "54.8%",
    hitRate: "54.8%",
    roi: "+6.7%",
    sampleSize: 52,
    dateRange: "Last 90 days",
    note: "Rested offenses averaging more points than totals suggest.",
    explanation: "Books set totals conservatively on first game back from break.",
    whyItMatters: "Rest advantage is systematically underpriced in totals markets.",
    caution: "Effect diminishes for teams that practiced heavily during break.",
    href: "/trends?market=total&side=OVER",
    tone: "brand"
  },
  {
    id: "revenge-game-spread",
    title: "Revenge game spreads",
    value: "55.6%",
    hitRate: "55.6%",
    roi: "+4.9%",
    sampleSize: 36,
    dateRange: "Last 365 days",
    note: "Teams covering at elevated rate in games following a blowout loss.",
    explanation: "Motivated teams show measurable improvement after lopsided defeats.",
    whyItMatters: "Bookmakers under-adjust lines for revenge game narratives.",
    caution: "Small sample — use alongside other signals.",
    href: "/trends?market=spread",
    tone: "brand"
  }
];

const MOCK_METRICS: TrendMetricCard[] = [
  {
    label: "Overall hit rate",
    value: "54.2%",
    note: "Across all tracked systems in the last 90 days"
  },
  {
    label: "Best ROI system",
    value: "+9.2%",
    note: "Road underdog ATS — last 365 days"
  },
  {
    label: "Active patterns",
    value: "4",
    note: "Systems with sufficient sample and positive edge"
  }
];

const MOCK_INSIGHTS: TrendInsightCard[] = [
  {
    id: "insight-underdog-value",
    title: "Underdog value is elevated",
    value: "+9.2% ROI",
    note: "Road underdogs are being systematically underpriced this season.",
    tone: "success"
  },
  {
    id: "insight-home-favorites",
    title: "Home favorites are overpriced",
    value: "-3.1% ROI",
    note: "Public bias is driving down value on popular home favorites.",
    tone: "muted"
  },
  {
    id: "insight-rest-spots",
    title: "Rest advantage in totals",
    value: "+6.7% ROI",
    note: "Teams returning from rest are exceeding totals expectations.",
    tone: "brand"
  }
];

const MOCK_MOVEMENT_ROWS: TrendTableRow[] = [
  {
    label: "NBA spread",
    movement: "Away -1.5 → -2.0",
    note: "Market moving favorites in road spots",
    href: "/trends?league=NBA&market=spread"
  },
  {
    label: "MLB total",
    movement: "O/U 8.5 → 9.0",
    note: "Run environments trending higher midseason",
    href: "/trends?league=MLB&market=total"
  },
  {
    label: "NFL moneyline",
    movement: "Home -145 → -155",
    note: "Increased home field pricing in divisional games",
    href: "/trends?league=NFL&market=moneyline"
  }
];

const MOCK_SEGMENT_ROWS: TrendTableRow[] = [
  {
    label: "Home team",
    movement: "61.4% win rate",
    note: "Against implied market probability of 63%"
  },
  {
    label: "Road underdog",
    movement: "58.3% ATS",
    note: "Consistently above the 52.4% breakeven"
  },
  {
    label: "Over in rest spots",
    movement: "54.8% hit rate",
    note: "Above breakeven but sample requires monitoring"
  }
];

const MOCK_SAVED_SYSTEMS: SavedTrendSystemView[] = [
  {
    id: "saved-road-dogs",
    name: "Road underdogs after a loss",
    sport: "BASKETBALL",
    filters: {
      sport: "BASKETBALL",
      league: "NBA",
      market: "spread",
      sportsbook: "all",
      side: "AWAY",
      subject: "",
      team: "",
      player: "",
      fighter: "",
      opponent: "",
      window: "90d",
      sample: 5
    },
    aiQuery: "road underdogs after a loss NBA",
    mode: "simple",
    archivedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    lastRunAt: NOW,
    currentMatchCount: 3,
    sampleSize: 84,
    roi: "+9.2%",
    hitRate: "58.3%",
    href: "/trends?side=UNDERDOG&league=NBA&market=spread"
  },
  {
    id: "saved-rest-overs",
    name: "Overs after 3+ days rest",
    sport: "BASKETBALL",
    filters: {
      sport: "BASKETBALL",
      league: "NBA",
      market: "total",
      sportsbook: "all",
      side: "OVER",
      subject: "",
      team: "",
      player: "",
      fighter: "",
      opponent: "",
      window: "365d",
      sample: 5
    },
    aiQuery: "overs for rested teams NBA",
    mode: "simple",
    archivedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    lastRunAt: NOW,
    currentMatchCount: 2,
    sampleSize: 52,
    roi: "+6.7%",
    hitRate: "54.8%",
    href: "/trends?side=OVER&league=NBA&market=total"
  }
];

export function buildFallbackTrendDashboard(
  filters: TrendFilters,
  options?: { mode?: "simple" | "power"; aiQuery?: string }
): TrendDashboardView {
  return {
    setup: null,
    mode: options?.mode ?? "simple",
    aiQuery: options?.aiQuery ?? "",
    aiHelper: null,
    explanation: {
      headline: "Road underdogs ATS: 58.3%",
      whyItMatters:
        "Public bias toward favorites creates systematic value on road underdogs. This pattern has held across NBA, NFL, and NHL over the past year.",
      caution:
        "Sample reflects mock data — connect database and run historical import for real analysis.",
      queryLogic: "Filters: side=UNDERDOG, scope=road, market=spread, window=365d"
    },
    filters,
    cards: MOCK_TREND_CARDS,
    metrics: MOCK_METRICS,
    insights: MOCK_INSIGHTS,
    movementRows: MOCK_MOVEMENT_ROWS,
    segmentRows: MOCK_SEGMENT_ROWS,
    todayMatches: [],
    todayMatchesNote:
      "Live event matching requires a connected database. Import historical data to see today's matchups against these trends.",
    savedSystems: MOCK_SAVED_SYSTEMS,
    savedTrendName: "",
    sourceNote:
      "Displaying sample trend patterns. Connect database and run import:free-historical to load real historical odds and game results.",
    querySummary: "Showing representative trend systems across major sports markets.",
    sampleNote: "Sample data shown for UI demonstration — real data requires database setup."
  };
}
