import { hasUsableServerDatabaseUrl } from "@/lib/db/prisma";
import type {
  TrendCardView,
  TrendDashboardView,
  TrendFilters,
  TrendMetricCard,
  TrendMode,
  TrendTableRow
} from "@/lib/types/domain";
import { getPublishedTrendFeed, type PublishedTrendCard } from "@/lib/trends/publisher";

import { buildFallbackTrendDashboard } from "./fallback-dashboard";
import { getTrendDashboard } from "./query-engine";

function pct(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value > 0 ? "+" : ""}${value.toFixed(1)}%` : null;
}

function hit(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(1)}%` : null;
}

function windowLabel(filters: TrendFilters) {
  if (filters.window === "all") return "Full stored range";
  if (filters.window === "365d") return "Last 365 days";
  if (filters.window === "90d") return "Last 90 days";
  return "Last 30 days";
}

function summary(filters: TrendFilters) {
  return [
    filters.league !== "ALL" ? filters.league : filters.sport,
    filters.market,
    filters.side,
    filters.team || filters.player || filters.fighter || filters.subject || null,
    filters.window
  ].filter(Boolean).join(" | ");
}

function tone(card: PublishedTrendCard): TrendCardView["tone"] {
  if (card.confidence === "strong" || card.category === "Most Profitable") return "success";
  if (card.confidence === "moderate" || card.category === "Highest Win Rate") return "brand";
  if (card.category === "Totals" || card.category === "Schedule Edges") return "premium";
  return "muted";
}

function toCard(card: PublishedTrendCard, filters: TrendFilters): TrendCardView {
  const hitRate = hit(card.hitRate);
  const roi = pct(card.roi);
  const value = card.primaryMetricValue || hitRate || roi || card.record || String(card.sampleSize);
  const whyNow = card.whyNow.length ? card.whyNow.join(" · ") : card.description;

  return {
    id: card.id,
    title: card.title,
    value,
    hitRate,
    roi,
    sampleSize: card.sampleSize,
    dateRange: windowLabel(filters),
    note: card.description || card.railReason,
    explanation: card.railReason || card.description,
    whyItMatters: whyNow,
    caution: card.warning || "Use as one signal with market context.",
    href: card.href,
    tone: tone(card),
    todayMatches: []
  };
}

function dedupe(cards: PublishedTrendCard[]) {
  const seen = new Set<string>();
  return cards.filter((card) => {
    const key = card.id || `${card.title}:${card.href}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function metrics(cards: PublishedTrendCard[]): TrendMetricCard[] {
  const bestRoi = [...cards].filter((card) => typeof card.roi === "number").sort((a, b) => (b.roi ?? -999) - (a.roi ?? -999))[0];
  const bestHit = [...cards].filter((card) => typeof card.hitRate === "number").sort((a, b) => (b.hitRate ?? -999) - (a.hitRate ?? -999))[0];
  const sourceMatches = cards.reduce((total, card) => total + (card.todayMatches?.length ?? 0), 0);

  return [
    { label: "Published trends", value: String(cards.length), note: "Loaded from the published trend feed." },
    { label: "Source qualifiers", value: String(sourceMatches), note: "Current qualifiers reported by the feed." },
    { label: "Best ROI", value: bestRoi ? pct(bestRoi.roi) ?? "N/A" : "N/A", note: bestRoi?.title ?? "No ROI card." },
    { label: "Best hit rate", value: bestHit ? hit(bestHit.hitRate) ?? "N/A" : "N/A", note: bestHit?.title ?? "No hit-rate card." }
  ];
}

function rows(cards: PublishedTrendCard[]): TrendTableRow[] {
  return cards.slice(0, 8).map((card) => ({
    label: `${card.leagueLabel} ${card.marketLabel}`,
    movement: card.primaryMetricValue || card.record,
    note: card.description,
    href: card.href
  }));
}

async function publishedDashboard(
  filters: TrendFilters,
  options?: { mode?: TrendMode; aiQuery?: string },
  existing?: TrendDashboardView | null
): Promise<TrendDashboardView | null> {
  try {
    const feed = await getPublishedTrendFeed(filters);
    const sections = Array.isArray(feed.sections) ? feed.sections : [];
    const cards = dedupe([
      ...(Array.isArray(feed.featured) ? feed.featured : []),
      ...sections.flatMap((section) => section.cards ?? []),
      ...(Array.isArray(feed.overlooked) ? feed.overlooked : [])
    ]);

    if (!cards.length) return null;

    return {
      setup: null,
      mode: options?.mode ?? existing?.mode ?? "simple",
      aiQuery: options?.aiQuery ?? existing?.aiQuery ?? "",
      aiHelper: existing?.aiHelper ?? null,
      explanation: existing?.explanation ?? {
        headline: `${cards.length} published trends loaded`,
        whyItMatters: "The page is populated from the published trend feed.",
        caution: "Current-match objects are not attached until normalized for this dashboard.",
        queryLogic: summary(filters)
      },
      filters,
      cards: cards.map((card) => toCard(card, filters)),
      metrics: metrics(cards),
      insights: cards.slice(0, 4).map((card) => ({
        id: `published-${card.id}`,
        title: card.title,
        value: card.primaryMetricValue || card.record,
        note: card.description,
        tone: tone(card)
      })),
      movementRows: rows(cards),
      segmentRows: sections.slice(0, 8).map((section) => ({
        label: section.category,
        movement: `${section.cards.length} cards`,
        note: section.cards[0]?.railReason ?? "Published trend section",
        href: section.cards[0]?.href ?? "/trends"
      })),
      todayMatches: [],
      todayMatchesNote: "Trend cards loaded. Current-match normalization is pending.",
      savedSystems: existing?.savedSystems ?? [],
      savedTrendName: existing?.savedTrendName ?? "",
      sourceNote: "Loaded from the SharkEdge published trend feed.",
      querySummary: summary(filters),
      sampleNote: existing?.sampleNote ?? null
    };
  } catch {
    return null;
  }
}

function hasCards(view: TrendDashboardView | null | undefined) {
  return Boolean(view && !view.setup && Array.isArray(view.cards) && view.cards.length > 0);
}

export async function getTrendDashboardSafe(
  filters: TrendFilters,
  options?: { mode?: TrendMode; aiQuery?: string; savedTrendId?: string | null }
): Promise<TrendDashboardView> {
  if (!hasUsableServerDatabaseUrl()) {
    return (await publishedDashboard(filters, options)) ?? buildFallbackTrendDashboard(filters, options);
  }

  try {
    const view = await getTrendDashboard(filters, options);
    if (hasCards(view)) return view;
    return (await publishedDashboard(filters, options, view)) ?? buildFallbackTrendDashboard(filters, options);
  } catch {
    return (await publishedDashboard(filters, options)) ?? buildFallbackTrendDashboard(filters, options);
  }
}
