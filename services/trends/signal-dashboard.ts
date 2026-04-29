import type {
  LeagueKey,
  SportCode,
  TrendCardView,
  TrendDashboardView,
  TrendFilters,
  TrendInsightCard,
  TrendMatchView,
  TrendMetricCard,
  TrendMode,
  TrendTableRow
} from "@/lib/types/domain";

import { buildTrendSignals, type TrendSignal } from "./trends-engine";

function leagueToSport(league: LeagueKey | "ALL"): SportCode {
  if (league === "MLB") return "BASEBALL";
  if (league === "NBA") return "BASKETBALL";
  if (league === "NHL") return "HOCKEY";
  if (league === "NFL" || league === "NCAAF") return "FOOTBALL";
  if (league === "UFC") return "MMA";
  if (league === "BOXING") return "BOXING";
  return "OTHER";
}

function formatPct(value: number | null | undefined, digits = 1) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(digits)}%` : null;
}

function formatEdge(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const percent = Math.abs(value) <= 1 ? value * 100 : value;
  return `${percent > 0 ? "+" : ""}${percent.toFixed(1)}%`;
}

function signalTone(signal: TrendSignal): TrendCardView["tone"] {
  if (signal.quality.actionability === "ACTIONABLE" || signal.qualityTier === "S" || signal.qualityTier === "A") return "success";
  if (signal.quality.actionability === "WATCHLIST" || signal.qualityTier === "B") return "brand";
  if (signal.quality.actionability === "RESEARCH_ONLY" || signal.category === "Totals") return "premium";
  return "muted";
}

function actionLabel(signal: TrendSignal) {
  if (signal.quality.actionability === "ACTIONABLE") return "REVIEW LIVE PRICE";
  if (signal.quality.actionability === "WATCHLIST") return "WATCH FOR PRICE";
  if (signal.quality.actionability === "RESEARCH_ONLY") return "RESEARCH ONLY";
  return "CONTEXT ONLY";
}

function safeLeague(league: LeagueKey | "ALL"): LeagueKey {
  return league === "ALL" ? "MLB" : league;
}

function signalMatch(signal: TrendSignal): TrendMatchView[] {
  if (!signal.gameId || !signal.matchup) return [];
  const league = safeLeague(signal.league);
  const eventLabel = `${signal.matchup.away} @ ${signal.matchup.home}`;
  const href = signal.actionHref || `/sim/${String(league).toLowerCase()}/${encodeURIComponent(signal.gameId)}`;

  return [
    {
      id: `${signal.id}:live`,
      sport: leagueToSport(signal.league),
      leagueKey: league,
      eventLabel,
      startTime: new Date().toISOString(),
      status: "PREGAME",
      stateDetail: null,
      matchingLogic: `${signal.league} | ${signal.market ?? signal.category} | ${signal.source}`,
      recommendedBetLabel: actionLabel(signal),
      oddsContext: [
        `Quality ${signal.qualityTier} · ${signal.qualityScore}/100`,
        signal.marketQuality.edgePercent != null ? `Edge ${signal.marketQuality.edgePercent}%` : null,
        signal.marketQuality.fairOddsAmerican != null ? `Fair ${signal.marketQuality.fairOddsAmerican > 0 ? "+" : ""}${signal.marketQuality.fairOddsAmerican}` : null
      ].filter(Boolean).join(" · "),
      matchupHref: href,
      boardHref: league === "UFC" || league === "BOXING" ? null : `/?league=${league}`,
      propsHref: null,
      supportNote: signal.warnings[0] ?? signal.notes[0] ?? null
    }
  ];
}

function signalCard(signal: TrendSignal, filters: TrendFilters): TrendCardView {
  const edge = formatEdge(signal.marketQuality.edgePercent ?? signal.edge);
  const score = `${signal.qualityScore}/100`;
  const hitRate = formatPct(signal.hitRate);
  const warningText = signal.warnings.length ? signal.warnings.slice(0, 3).join("; ") : null;
  const notes = signal.notes.filter(Boolean).slice(0, 6);

  return {
    id: signal.id,
    title: `${signal.title} · ${signal.qualityTier}`,
    value: edge ?? score,
    hitRate,
    roi: null,
    sampleSize: signal.sample ?? 0,
    dateRange: `Current board · ${signal.league} · ${signal.market ?? signal.category}`,
    note: [
      signal.angle,
      `Action Gate: ${actionLabel(signal)}`,
      `QualityScore ${score}`,
      signal.marketQuality.fairOddsAmerican != null ? `Fair-price checkpoint: ${signal.marketQuality.fairOddsAmerican > 0 ? "+" : ""}${signal.marketQuality.fairOddsAmerican} or better` : null,
      signal.quality.actionability === "RESEARCH_ONLY" ? "Research-only until a current sportsbook price confirms it" : null
    ].filter(Boolean).join(". "),
    explanation: `Signal generated from the ${signal.source} trend path and filtered through the SharkEdge quality gate. League filter: ${filters.league}.`,
    whyItMatters: [
      `Action Gate: ${actionLabel(signal)}`,
      `Quality tier ${signal.qualityTier}`,
      `Overfit risk ${signal.overfitRisk}`,
      ...notes
    ].join(" · "),
    caution: warningText
      ? `Kill switches: ${warningText}.`
      : "Kill switches: stale price, late lineup/news change, market moving through fair price, or quality tier downgrade.",
    href: signal.actionHref,
    tone: signalTone(signal),
    todayMatches: signalMatch(signal)
  };
}

function metrics(signals: TrendSignal[]): TrendMetricCard[] {
  const actionable = signals.filter((signal) => signal.quality.actionability === "ACTIONABLE").length;
  const watchlist = signals.filter((signal) => signal.quality.actionability === "WATCHLIST").length;
  const research = signals.filter((signal) => signal.quality.actionability === "RESEARCH_ONLY").length;
  const top = signals[0];

  return [
    { label: "Visible trends", value: String(signals.length), note: "Signals that cleared the hidden-quality filter and can be displayed." },
    { label: "Actionable", value: String(actionable), note: "Cards that still need live-price review before use." },
    { label: "Watchlist", value: String(watchlist), note: "Interesting cards that need price/data confirmation." },
    { label: "Top quality", value: top ? `${top.qualityScore}/100` : "N/A", note: top?.title ?? "No current signal card." }
  ];
}

function rows(signals: TrendSignal[]): TrendTableRow[] {
  return signals.slice(0, 10).map((signal) => ({
    label: `${signal.league} ${signal.market ?? signal.category}`,
    movement: actionLabel(signal),
    note: [
      signal.title,
      `Quality ${signal.qualityTier} ${signal.qualityScore}/100`,
      signal.marketQuality.edgePercent != null ? `Edge ${signal.marketQuality.edgePercent}%` : null,
      signal.warnings[0] ?? null
    ].filter(Boolean).join(" · "),
    href: signal.actionHref
  }));
}

function insights(signals: TrendSignal[]): TrendInsightCard[] {
  return signals.slice(0, 4).map((signal) => ({
    id: `signal-insight-${signal.id}`,
    title: signal.title,
    value: actionLabel(signal),
    note: [signal.angle, `Quality ${signal.qualityTier}`, signal.warnings[0] ?? null].filter(Boolean).join(" · "),
    tone: signalTone(signal)
  }));
}

function matchesMarketFilter(signal: TrendSignal, filterMarket: TrendFilters["market"]) {
  if (filterMarket === "ALL") return true;
  const market = String(signal.market ?? "").toLowerCase();
  const category = String(signal.category ?? "").toLowerCase();
  if (filterMarket === "total") return market.includes("total") || market.includes("over") || market.includes("under") || category.includes("total");
  if (filterMarket === "moneyline") return market.includes("moneyline") || market.includes("ml");
  if (filterMarket === "spread") return market.includes("spread") || market.includes("ats");
  return market.includes(filterMarket) || category.includes(filterMarket);
}

export async function buildSignalTrendDashboard(
  filters: TrendFilters,
  options?: { mode?: TrendMode; aiQuery?: string }
): Promise<TrendDashboardView | null> {
  const payload = await buildTrendSignals({
    league: filters.league === "ALL" ? "ALL" : filters.league,
    includeResearch: true,
    includeHidden: false
  });

  const signals = payload.signals
    .filter((signal) => matchesMarketFilter(signal, filters.market))
    .slice(0, 12);

  if (!signals.length) return null;

  const cards = signals.map((signal) => signalCard(signal, filters));
  const liveMatches = cards.flatMap((card) => card.todayMatches ?? []);
  const top = signals[0];

  return {
    setup: null,
    mode: options?.mode ?? "simple",
    aiQuery: options?.aiQuery ?? "",
    aiHelper: null,
    explanation: {
      headline: `${cards.length} current trend signal${cards.length === 1 ? "" : "s"} showing from live SharkEdge data`,
      whyItMatters: `${top.title} leads with quality ${top.qualityTier} ${top.qualityScore}/100. This view is using the trend signal engine because historical/published dashboard cards were unavailable or thin.`,
      caution: "These are current trend signals, not blind bets. Use the action gate, fair-price checkpoint, and kill switches before acting.",
      queryLogic: [filters.league, filters.market, filters.side, filters.window].filter(Boolean).join(" | ")
    },
    filters,
    cards,
    metrics: metrics(signals),
    insights: insights(signals),
    movementRows: rows(signals),
    segmentRows: [
      { label: "Signal feed", movement: `${cards.length} cards`, note: "Current trend signal engine output after quality gating.", href: "/trends?mode=signals" },
      { label: "Hidden-quality filter", movement: String(payload.counts.hiddenQuality ?? 0), note: "Signals suppressed by quality gate before reaching this page.", href: "/api/trends?mode=signals&debug=true" },
      { label: "Research patterns", movement: String(payload.counts.research ?? 0), note: "Historical research cards kept as context until current price confirms them.", href: "/trends" }
    ],
    todayMatches: liveMatches,
    todayMatchesNote: liveMatches.length
      ? `${liveMatches.length} live/current qualifier${liveMatches.length === 1 ? "" : "s"} attached from the signal feed.`
      : "Trend signal cards are showing, but no live matchup qualifiers are attached yet.",
    savedSystems: [],
    savedTrendName: "",
    sourceNote: "Showing current SharkEdge trend signals from the quality-gated signal engine because historical/published trend cards were unavailable or thin.",
    querySummary: [filters.league, filters.market, filters.side, filters.window].filter(Boolean).join(" | "),
    sampleNote: payload.counts.hiddenQuality
      ? `${payload.counts.hiddenQuality} weak/hidden trend signal${payload.counts.hiddenQuality === 1 ? " was" : "s were"} suppressed by the quality gate.`
      : null
  };
}
