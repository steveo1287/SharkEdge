import { hasUsableServerDatabaseUrl } from "@/lib/db/prisma";
import type {
  TrendCardView,
  TrendDashboardView,
  TrendFilters,
  TrendMatchView,
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

function unit(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value > 0 ? "+" : ""}${value.toFixed(1)}u` : null;
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

function smartScore(card: PublishedTrendCard) {
  const base = Number.isFinite(card.rankingScore) ? card.rankingScore : 0;
  const sample = Math.min(card.sampleSize, 75) * 2;
  const hitRate = typeof card.hitRate === "number" ? Math.max(0, card.hitRate - 50) * 7 : 0;
  const roi = typeof card.roi === "number" ? Math.max(0, card.roi) * 5 : 0;
  const profit = typeof card.profitUnits === "number" ? Math.max(0, card.profitUnits) * 6 : 0;
  const tags = card.intelligenceTags.length * 24;
  const current = Math.min(card.todayMatches.length, 4) * 35;
  const confidence = card.confidence === "strong" ? 75 : card.confidence === "moderate" ? 38 : 8;
  return Math.round(base + sample + hitRate + roi + profit + tags + current + confidence);
}

function smartGrade(card: PublishedTrendCard) {
  const score = smartScore(card);
  if (score >= 800) return "A+";
  if (score >= 720) return "A";
  if (score >= 640) return "B+";
  if (score >= 560) return "B";
  return "Watch";
}

function tone(card: PublishedTrendCard): TrendCardView["tone"] {
  const score = smartScore(card);
  if (score >= 720 || card.confidence === "strong" || card.category === "Most Profitable") return "success";
  if (score >= 620 || card.confidence === "moderate" || card.category === "Highest Win Rate") return "brand";
  if (card.category === "Totals" || card.category === "Schedule Edges" || card.category === "CLV-Backed") return "premium";
  return "muted";
}

function normalizeMatches(card: PublishedTrendCard): TrendMatchView[] {
  return card.todayMatches.slice(0, 4).map((match) => {
    const date = match.startTime.slice(0, 10);
    return {
      id: `${card.id}:${match.id}`,
      sport: match.sport,
      leagueKey: match.league,
      eventLabel: match.matchup,
      startTime: match.startTime,
      status: "PREGAME",
      stateDetail: null,
      matchingLogic: `${card.leagueLabel} | ${card.marketLabel} | ${card.category}`,
      recommendedBetLabel: card.marketLabel === "Trend" ? null : `${card.marketLabel} trend qualifier`,
      oddsContext: card.primaryMetricValue ? `${card.primaryMetricLabel}: ${card.primaryMetricValue}` : null,
      matchupHref: match.href,
      boardHref: match.league === "UFC" || match.league === "BOXING" ? null : `/?league=${match.league}&date=${date}`,
      propsHref: card.marketLabel.toLowerCase().includes("player") ? `/props?league=${match.league}` : null,
      supportNote: match.tag
    };
  });
}

function smartNote(card: PublishedTrendCard) {
  const parts = [
    card.description,
    `SmartScore ${smartScore(card)}`,
    card.intelligenceTags.length ? `Tags: ${card.intelligenceTags.join(", ")}` : null,
    card.todayMatches.length ? `${card.todayMatches.length} live qualifier${card.todayMatches.length === 1 ? "" : "s"}` : null
  ].filter(Boolean);
  return parts.join(". ");
}

function smartWhy(card: PublishedTrendCard) {
  const parts = [...card.whyNow, ...card.intelligenceTags.slice(0, 3)].filter(Boolean);
  return parts.length ? parts.join(" · ") : card.railReason || card.description;
}

function smartValue(card: PublishedTrendCard) {
  if (card.primaryMetricLabel === "EDGE") return `Score ${smartScore(card)}`;
  return card.primaryMetricValue || unit(card.profitUnits) || hit(card.hitRate) || pct(card.roi) || `Score ${smartScore(card)}`;
}

function toCard(card: PublishedTrendCard, filters: TrendFilters): TrendCardView {
  const hitRate = hit(card.hitRate);
  const roi = pct(card.roi);

  return {
    id: card.id,
    title: `${card.title} · ${smartGrade(card)}`,
    value: smartValue(card),
    hitRate,
    roi,
    sampleSize: card.sampleSize,
    dateRange: `${windowLabel(filters)} · ${card.leagueLabel} · ${card.marketLabel}`,
    note: smartNote(card),
    explanation: `${card.railReason} Ranked by publisher score, sample, hit rate, ROI, profit, live qualifiers, and intelligence tags.`,
    whyItMatters: smartWhy(card),
    caution: card.warning || "Use as a ranked signal with current context.",
    href: card.href,
    tone: tone(card),
    todayMatches: normalizeMatches(card)
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

function dedupeMatches(matches: TrendMatchView[]) {
  const seen = new Set<string>();
  return matches.filter((match) => {
    const key = match.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function smartSort(cards: PublishedTrendCard[]) {
  return [...cards].sort((left, right) => smartScore(right) - smartScore(left));
}

function metrics(cards: PublishedTrendCard[]): TrendMetricCard[] {
  const sorted = smartSort(cards);
  const top = sorted[0];
  const bestRoi = [...cards].filter((card) => typeof card.roi === "number").sort((a, b) => (b.roi ?? -999) - (a.roi ?? -999))[0];
  const liveMatches = cards.reduce((total, card) => total + (card.todayMatches?.length ?? 0), 0);
  const tagCount = new Set(cards.flatMap((card) => card.intelligenceTags)).size;

  return [
    { label: "Top SmartScore", value: top ? String(smartScore(top)) : "N/A", note: top?.title ?? "No card." },
    { label: "Ranked trends", value: String(cards.length), note: "Sorted by score, sample, market tags, and qualifiers." },
    { label: "Live qualifiers", value: String(liveMatches), note: "Current games now attach to trend cards." },
    { label: "Signal tags", value: String(tagCount), note: bestRoi ? `Best ROI: ${bestRoi.title} ${pct(bestRoi.roi) ?? ""}`.trim() : "Market and schedule tags." }
  ];
}

function rows(cards: PublishedTrendCard[]): TrendTableRow[] {
  return smartSort(cards).slice(0, 10).map((card) => ({
    label: `${card.leagueLabel} ${card.marketLabel}`,
    movement: `Score ${smartScore(card)}`,
    note: [card.title, card.primaryMetricValue, `${card.todayMatches.length} live`, ...card.whyNow, ...card.intelligenceTags.slice(0, 2)].filter(Boolean).join(" · "),
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
    const rawCards = dedupe([
      ...(Array.isArray(feed.featured) ? feed.featured : []),
      ...sections.flatMap((section) => section.cards ?? []),
      ...(Array.isArray(feed.overlooked) ? feed.overlooked : [])
    ]);
    const sampleFloor = Math.max(1, filters.sample || 1);
    const qualified = rawCards.filter((card) => card.sampleSize >= sampleFloor);
    const cards = smartSort(qualified.length ? qualified : rawCards);

    if (!cards.length) return null;

    const top = cards[0];
    const allMatches = dedupeMatches(cards.flatMap(normalizeMatches));

    return {
      setup: null,
      mode: options?.mode ?? existing?.mode ?? "simple",
      aiQuery: options?.aiQuery ?? existing?.aiQuery ?? "",
      aiHelper: existing?.aiHelper ?? null,
      explanation: existing?.explanation ?? {
        headline: `${cards.length} smart-ranked trend${cards.length === 1 ? "" : "s"} loaded`,
        whyItMatters: `${top.title} leads with SmartScore ${smartScore(top)}. ${smartWhy(top)}`,
        caution: "SmartScore ranks trends for review; it is not a standalone decision engine.",
        queryLogic: summary(filters)
      },
      filters,
      cards: cards.map((card) => toCard(card, filters)),
      metrics: metrics(cards),
      insights: cards.slice(0, 4).map((card) => ({
        id: `published-${card.id}`,
        title: card.title,
        value: `Score ${smartScore(card)}`,
        note: [card.description, `${card.todayMatches.length} live`, ...card.intelligenceTags.slice(0, 3)].filter(Boolean).join(" · "),
        tone: tone(card)
      })),
      movementRows: rows(cards),
      segmentRows: sections.slice(0, 8).map((section) => {
        const best = smartSort(section.cards ?? [])[0];
        return {
          label: section.category,
          movement: best ? `Best ${smartScore(best)}` : `${section.cards.length} cards`,
          note: best ? `${best.title} · ${best.todayMatches.length} live · ${best.railReason}` : "Published trend section",
          href: best?.href ?? "/trends"
        };
      }),
      todayMatches: allMatches,
      todayMatchesNote: allMatches.length
        ? `${allMatches.length} live trend qualifier${allMatches.length === 1 ? "" : "s"} attached to the dashboard.`
        : "Trend cards loaded. No current games qualify for this filter yet.",
      savedSystems: existing?.savedSystems ?? [],
      savedTrendName: existing?.savedTrendName ?? "",
      sourceNote: "Loaded from the SharkEdge published trend feed and smart-ranked by sample, ROI, hit rate, profit, live qualifiers, and intelligence tags.",
      querySummary: summary(filters),
      sampleNote: qualified.length ? existing?.sampleNote ?? null : `No cards cleared the ${sampleFloor}+ sample filter, so showing strongest available trends.`
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
