import { hasUsableServerDatabaseUrl } from "@/lib/db/prisma";
import type {
  TrendCardView,
  TrendDashboardView,
  TrendFilters,
  TrendInsightCard,
  TrendMetricCard,
  TrendMode,
  TrendTableRow
} from "@/lib/types/domain";
import {
  getPublishedTrendFeed,
  type PublishedTrendCard,
  type PublishedTrendSection
} from "@/lib/trends/publisher";

import { buildFallbackTrendDashboard } from "./fallback-dashboard";
import { getTrendDashboard } from "./query-engine";

function formatPercent(value: number | null | undefined, digits = 1) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`
    : null;
}

function formatHitRate(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toFixed(1)}%`
    : null;
}

function formatUnits(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value > 0 ? "+" : ""}${value.toFixed(1)}u`
    : null;
}

function getWindowLabel(filters: TrendFilters) {
  if (filters.window === "all") return "Full stored range";
  if (filters.window === "365d") return "Last 365 days";
  if (filters.window === "90d") return "Last 90 days";
  return "Last 30 days";
}

function getQuerySummary(filters: TrendFilters) {
  return [
    filters.league !== "ALL" ? filters.league : filters.sport !== "ALL" ? filters.sport : "All sports",
    filters.market !== "ALL" ? filters.market.replace(/_/g, " ") : "all markets",
    filters.side !== "ALL" ? filters.side.toLowerCase() : null,
    filters.team || filters.player || filters.fighter || filters.subject || null,
    filters.opponent ? `vs ${filters.opponent}` : null,
    filters.window
  ]
    .filter(Boolean)
    .join(" | ");
}

function cardTone(card: PublishedTrendCard): TrendCardView["tone"] {
  if (card.category === "Most Profitable" || card.category === "CLV-Backed") return "success";
  if (card.category === "Highest Win Rate" || card.category === "Best of Board") return "brand";
  if (card.category === "Totals" || card.category === "Schedule Edges") return "premium";
  if (card.confidence === "strong") return "success";
  if (card.confidence === "moderate") return "brand";
  return "muted";
}

function toDashboardCard(card: PublishedTrendCard, filters: TrendFilters): TrendCardView {
  const profit = formatUnits(card.profitUnits);
  const hitRate = formatHitRate(card.hitRate);
  const roi = formatPercent(card.roi);
  const primaryValue =
    card.primaryMetricValue ||
    profit ||
    hitRate ||
    roi ||
    card.record ||
    String(card.sampleSize);
  const whyNow = card.whyNow.length ? card.whyNow.join(" · ") : "Published trend from the SharkEdge trend feed.";

  return {
    id: card.id,
    title: card.title,
    value: primaryValue,
    hitRate,
    roi,
    sampleSize: card.sampleSize,
    dateRange: getWindowLabel(filters),
    note: card.description || card.railReason || whyNow,
    explanation: card.railReason || card.description || whyNow,
    whyItMatters: whyNow,
    caution:
      card.warning ||
      (card.sampleSize < Math.max(5, filters.sample)
        ? "Small sample: use as context until more stored rows support the angle."
        : "Trend context is not a standalone bet. Confirm price, matchup, injuries, and market movement."),
    href: card.href,
    tone: cardTone(card),
    todayMatches: card.todayMatches ?? []
  };
}

function dedupePublishedCards(cards: PublishedTrendCard[]) {
  const seen = new Set<string>();
  const result: PublishedTrendCard[] = [];

  for (const card of cards) {
    const key = card.id || `${card.title}:${card.href}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(card);
  }

  return result;
}

function buildMetrics(cards: PublishedTrendCard[]): TrendMetricCard[] {
  const withRoi = cards.filter((card) => typeof card.roi === "number");
  const withHitRate = cards.filter((card) => typeof card.hitRate === "number");
  const activeMatches = cards.reduce((total, card) => total + (card.todayMatches?.length ?? 0), 0);
  const bestRoi = withRoi.sort((left, right) => (right.roi ?? -999) - (left.roi ?? -999))[0];
  const bestHitRate = withHitRate.sort((left, right) => (right.hitRate ?? -999) - (left.hitRate ?? -999))[0];

  return [
    {
      label: "Published trends",
      value: String(cards.length),
      note: "Cards adapted from the live SharkEdge published trend feed."
    },
    {
      label: "Live qualifiers",
      value: String(activeMatches),
      note: activeMatches > 0 ? "Today's board matches attached to trend cards." : "No live qualifiers attached yet."
    },
    {
      label: "Best ROI",
      value: bestRoi && typeof bestRoi.roi === "number" ? formatPercent(bestRoi.roi) ?? "N/A" : "N/A",
      note: bestRoi ? bestRoi.title : "No ROI-backed card in this filter."
    },
    {
      label: "Best hit rate",
      value: bestHitRate && typeof bestHitRate.hitRate === "number" ? formatHitRate(bestHitRate.hitRate) ?? "N/A" : "N/A",
      note: bestHitRate ? bestHitRate.title : "No hit-rate card in this filter."
    }
  ];
}

function buildInsights(cards: PublishedTrendCard[]): TrendInsightCard[] {
  return cards.slice(0, 4).map((card) => ({
    id: `published-insight-${card.id}`,
    title: card.title,
    value: card.primaryMetricValue || card.record,
    note: card.description || card.railReason,
    tone: cardTone(card)
  }));
}

function buildMovementRows(cards: PublishedTrendCard[]): TrendTableRow[] {
  return cards.slice(0, 8).map((card) => ({
    label: `${card.leagueLabel} ${card.marketLabel}`,
    movement: card.primaryMetricValue || card.record,
    note: card.whyNow.length ? card.whyNow.join(" · ") : card.description,
    href: card.href
  }));
}

function buildSegmentRows(sections: PublishedTrendSection[]): TrendTableRow[] {
  return sections.slice(0, 8).map((section) => {
    const cards = section.cards ?? [];
    const best = [...cards].sort((left, right) => right.rankingScore - left.rankingScore)[0];
    return {
      label: section.category,
      movement: best ? best.primaryMetricValue || best.record : `${cards.length} cards`,
      note: best ? best.railReason || best.description : "Published trend rail",
      href: best?.href ?? "/trends"
    };
  });
}

async function buildPublishedTrendDashboard(
  filters: TrendFilters,
  options?: { mode?: TrendMode; aiQuery?: string },
  existing?: TrendDashboardView | null
): Promise<TrendDashboardView | null> {
  try {
    const feed = await getPublishedTrendFeed(filters);
    const sections = Array.isArray(feed.sections) ? feed.sections : [];
    const cards = dedupePublishedCards([
      ...(Array.isArray(feed.featured) ? feed.featured : []),
      ...sections.flatMap((section) => section.cards ?? []),
      ...(Array.isArray(feed.overlooked) ? feed.overlooked : [])
    ]).filter((card) => card.sampleSize >= 0);

    if (!cards.length) return null;

    const todayMatches = cards.flatMap((card) => card.todayMatches ?? []);
    const querySummary = getQuerySummary(filters);

    return {
      setup: null,
      mode: options?.mode ?? existing?.mode ?? "simple",
      aiQuery: options?.aiQuery ?? existing?.aiQuery ?? "",
      aiHelper: existing?.aiHelper ?? null,
      explanation: existing?.explanation ?? {
        headline: `${cards.length} published trend${cards.length === 1 ? "" : "s"} loaded`,
        whyItMatters:
          "The dashboard is using the published trend feed, which is the same trend source powering homepage rails and trend API responses.",
        caution:
          "Some cards may be published feed signals instead of full backtest cards when the deeper historical query engine returns no rows.",
        queryLogic: querySummary
      },
      filters,
      cards: cards.map((card) => toDashboardCard(card, filters)),
      metrics: buildMetrics(cards),
      insights: buildInsights(cards),
      movementRows: buildMovementRows(cards),
      segmentRows: buildSegmentRows(sections),
      todayMatches,
      todayMatchesNote: todayMatches.length
        ? `${todayMatches.length} live qualifier${todayMatches.length === 1 ? "" : "s"} attached to published trends.`
        : "Published trends loaded. No live qualifiers attached to the current filter yet.",
      savedSystems: existing?.savedSystems ?? [],
      savedTrendName: existing?.savedTrendName ?? "",
      sourceNote:
        "Loaded from the SharkEdge published trend feed because this view must stay populated even when the deeper backtest engine has no renderable cards.",
      querySummary,
      sampleNote: existing?.sampleNote ?? null
    };
  } catch {
    return null;
  }
}

function hasRenderableTrendCards(view: TrendDashboardView | null | undefined) {
  return Boolean(view && !view.setup && Array.isArray(view.cards) && view.cards.length > 0);
}

export async function getTrendDashboardSafe(
  filters: TrendFilters,
  options?: {
    mode?: TrendMode;
    aiQuery?: string;
    savedTrendId?: string | null;
  }
): Promise<TrendDashboardView> {
  if (!hasUsableServerDatabaseUrl()) {
    const published = await buildPublishedTrendDashboard(filters, options);
    return published ?? buildFallbackTrendDashboard(filters, options);
  }

  try {
    const dashboard = await getTrendDashboard(filters, options);

    if (hasRenderableTrendCards(dashboard)) {
      return dashboard;
    }

    const published = await buildPublishedTrendDashboard(filters, options, dashboard);
    return published ?? buildFallbackTrendDashboard(filters, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (
      /database|postgres|prisma|migrate|relation.*does not exist|P202[12]/i.test(
        message
      )
    ) {
      const published = await buildPublishedTrendDashboard(filters, options);
      return published ?? buildFallbackTrendDashboard(filters, options);
    }

    const published = await buildPublishedTrendDashboard(filters, options);
    return published ?? buildFallbackTrendDashboard(filters, options);
  }
}
