import type {
  TrendDashboardView,
  TrendFilters,
  TrendMetricCard,
  TrendTableRow
} from "@/lib/types/domain";

function querySummary(filters: TrendFilters) {
  return [filters.league, filters.market, filters.side, filters.window].filter(Boolean).join(" | ");
}

function metrics(): TrendMetricCard[] {
  return [
    { label: "Real trends", value: "0", note: "No real current game/team or published historical trends matched this filter." },
    { label: "Fallback cards", value: "Disabled", note: "Static/fake cards are intentionally blocked from the user-facing trends page." },
    { label: "Next check", value: "Signals", note: "Use the debug signal feed to inspect why current game trends were not produced." },
    { label: "Data source", value: "Unavailable", note: "The page is waiting on real board, market, or historical trend data." }
  ];
}

function rows(): TrendTableRow[] {
  return [
    {
      label: "Real current-game signals",
      movement: "CHECK SIGNAL FEED",
      note: "The trends page now refuses to show fake filler. Inspect the signal feed for current board/model data.",
      href: "/api/trends?mode=signals&debug=true"
    },
    {
      label: "Published historical trends",
      movement: "CHECK PUBLISHER",
      note: "If published trend cards are empty, historical trend jobs or database-backed publishing need attention.",
      href: "/api/trends"
    },
    {
      label: "Live board",
      movement: "CHECK GAMES",
      note: "If no current games are available, there are no team/game trends to display.",
      href: "/"
    }
  ];
}

export function buildFallbackTrendDashboard(filters: TrendFilters): TrendDashboardView {
  return {
    setup: null,
    mode: "simple",
    aiQuery: "",
    aiHelper: null,
    explanation: {
      headline: "No real trend data is available for this filter",
      whyItMatters: "The trends page is no longer allowed to fill itself with fake fallback team cards. It will show real published trends or real current game/team signals only.",
      caution: "If this appears during an active slate, the board/signal/publisher data flow needs inspection. Use the debug links below.",
      queryLogic: querySummary(filters)
    },
    filters,
    cards: [],
    metrics: metrics(),
    insights: [],
    movementRows: rows(),
    segmentRows: rows(),
    todayMatches: [],
    todayMatchesNote: "No real current game/team trend qualifiers are available for this filter.",
    savedSystems: [],
    savedTrendName: "",
    sourceNote: "No fake fallback cards are shown. Real trend data must come from the published trend feed or the current game/team signal engine.",
    querySummary: querySummary(filters),
    sampleNote: "Static fallback trend cards are disabled so the page cannot masquerade fake data as real trends."
  };
}
