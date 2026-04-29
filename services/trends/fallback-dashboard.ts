import type {
  TrendCardView,
  TrendDashboardView,
  TrendFilters,
  TrendInsightCard,
  TrendMetricCard,
  TrendTableRow
} from "@/lib/types/domain";
import { mockDatabase } from "@/prisma/seed-data";

function formatPct(value: number) {
  return `${value > 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

function formatHit(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function windowLabel(filters: TrendFilters) {
  if (filters.window === "all") return "Full stored range";
  if (filters.window === "365d") return "Last 365 days";
  if (filters.window === "90d") return "Last 90 days";
  return "Last 30 days";
}

function buildFallbackTrendCard(
  filters: TrendFilters,
  league: string,
  market: string,
  team: string,
  index: number
): TrendCardView {
  const hitRates = [0.52, 0.55, 0.58, 0.51, 0.61, 0.53];
  const roiValues = [0.02, 0.08, 0.12, 0.01, 0.15, 0.04];
  const samples = [20, 35, 44, 42, 58, 31];
  const hitRate = hitRates[index % hitRates.length] ?? 0.52;
  const roi = roiValues[index % roiValues.length] ?? 0.02;
  const sample = samples[index % samples.length] ?? 25;
  const grade = roi >= 0.1 || hitRate >= 0.58 ? "WATCH" : "RESEARCH";
  const actionGate = grade === "WATCH" ? "WATCH FOR PRICE" : "RESEARCH ONLY";
  const title = `${team} ${market} trend · ${grade}`;

  return {
    id: `fallback-${league}-${market}-${team}`.replace(/[^a-z0-9-]/gi, "-").toLowerCase(),
    title,
    value: roi >= 0.08 ? formatPct(roi) : formatHit(hitRate),
    hitRate: formatHit(hitRate),
    roi: formatPct(roi),
    sampleSize: sample,
    dateRange: `${windowLabel(filters)} · ${league} · ${market}`,
    note: [
      `${team} ${market} profile is available as a display-safe fallback while the full historical/published feed is unavailable.`,
      `Action Gate: ${actionGate}`,
      `Fair-price checkpoint: verify current board price before using this angle`
    ].join(". "),
    explanation: "This fallback card keeps the trends page populated while the database-backed or signal-backed feed is unavailable. It is not a final betting recommendation.",
    whyItMatters: `Action Gate: ${actionGate} · ${sample} sample · ${formatHit(hitRate)} hit rate · ${formatPct(roi)} ROI proxy`,
    caution: "Kill switches: stale price, missing current odds, late lineup/news change, or no live board qualifier.",
    href: `/trends?league=${encodeURIComponent(league)}&market=${encodeURIComponent(market)}&sample=10`,
    tone: roi >= 0.1 ? "success" : hitRate >= 0.56 ? "brand" : "premium",
    todayMatches: []
  };
}

function buildCards(filters: TrendFilters) {
  const teams = mockDatabase.teams.slice(0, 5).map((team) => team.name);
  const markets = ["spread", "moneyline", "total"];
  const cards: TrendCardView[] = [];
  let cardIndex = 0;

  for (const team of teams) {
    for (const market of markets) {
      if (filters.market !== "ALL" && filters.market !== market) continue;
      cards.push(buildFallbackTrendCard(filters, filters.league === "ALL" ? "MLB" : filters.league, market, team, cardIndex++));
      if (cards.length >= 8) return cards;
    }
  }

  return cards;
}

function metrics(cards: TrendCardView[]): TrendMetricCard[] {
  const avgHit = cards.length
    ? cards.reduce((sum, card) => sum + Number.parseFloat(card.hitRate ?? "0"), 0) / cards.length
    : 0;
  const avgRoi = cards.length
    ? cards.reduce((sum, card) => sum + Number.parseFloat((card.roi ?? "0").replace("+", "")), 0) / cards.length
    : 0;

  return [
    { label: "Visible trends", value: String(cards.length), note: "Renderable cards available on the trends page." },
    { label: "Avg hit rate", value: `${avgHit.toFixed(1)}%`, note: "Fallback-card average, shown only when live/published feeds are unavailable." },
    { label: "Avg ROI proxy", value: `${avgRoi > 0 ? "+" : ""}${avgRoi.toFixed(1)}%`, note: "Proxy value used only to keep the UI useful during data outages." },
    { label: "Data status", value: "Fallback", note: "The full SharkEdge trend feed should replace these cards when available." }
  ];
}

function insights(cards: TrendCardView[]): TrendInsightCard[] {
  return cards.slice(0, 4).map((card) => ({
    id: `fallback-insight-${card.id}`,
    title: card.title,
    value: card.value,
    note: card.whyItMatters,
    tone: card.tone
  }));
}

function rows(cards: TrendCardView[]): TrendTableRow[] {
  return cards.slice(0, 8).map((card) => ({
    label: card.title,
    movement: card.note.includes("WATCH FOR PRICE") ? "WATCH FOR PRICE" : "RESEARCH ONLY",
    note: `${card.value} · Hit ${card.hitRate ?? "N/A"} · ROI ${card.roi ?? "N/A"}`,
    href: card.href
  }));
}

export function buildFallbackTrendDashboard(filters: TrendFilters): TrendDashboardView {
  const cards = buildCards(filters);
  const top = cards[0];

  return {
    setup: null,
    mode: "simple",
    aiQuery: "",
    aiHelper: null,
    explanation: {
      headline: `${cards.length} trend card${cards.length === 1 ? "" : "s"} available while the full feed warms up`,
      whyItMatters: top
        ? `${top.title} is shown so the trends page remains usable instead of presenting an empty dashboard.`
        : "The trends page is renderable, but no card matched the current filter.",
      caution: "Fallback cards are display-safe context only. The signal-backed and published trend feeds should be treated as the primary source when they are available.",
      queryLogic: [filters.league, filters.market, filters.side, filters.window].filter(Boolean).join(" | ")
    },
    filters,
    cards,
    metrics: metrics(cards),
    insights: insights(cards),
    movementRows: rows(cards),
    segmentRows: [
      { label: "Fallback renderer", movement: `${cards.length} cards`, note: "V3-compatible fallback cards are rendering instead of a setup blocker.", href: "/trends" },
      { label: "Preferred source", movement: "Signal feed", note: "Current trend signals and published historical trends should replace this fallback whenever available.", href: "/api/trends?mode=signals" }
    ],
    todayMatches: [],
    todayMatchesNote: "No live qualifiers are attached in fallback mode.",
    savedSystems: [],
    savedTrendName: "",
    sourceNote: "Fallback trend renderer active. This prevents the trends page from going blank while live/published trend feeds are unavailable.",
    querySummary: [filters.league, filters.market, filters.side, filters.window].filter(Boolean).join(" | "),
    sampleNote: "Fallback mode is not a betting recommendation. Use the signal/published feed when available."
  };
}
