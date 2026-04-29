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
import { buildSignalTrendDashboard } from "./signal-dashboard";

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

function americanFromProbability(probability: number) {
  if (!Number.isFinite(probability) || probability <= 0 || probability >= 1) return null;
  const raw = probability >= 0.5
    ? -Math.round((probability / (1 - probability)) * 100)
    : Math.round(((1 - probability) / probability) * 100);
  return raw > 0 ? `+${raw}` : String(raw);
}

function fairPriceNote(card: PublishedTrendCard) {
  if (typeof card.hitRate === "number" && Number.isFinite(card.hitRate) && card.hitRate > 0 && card.hitRate < 100) {
    const fair = americanFromProbability(card.hitRate / 100);
    return fair ? `Fair-price checkpoint: need ${fair} or better by stored hit rate.` : null;
  }

  if (typeof card.roi === "number" && Number.isFinite(card.roi)) {
    return card.roi > 0
      ? `Price checkpoint: keep current odds better than market average; stored ROI is ${pct(card.roi)}.`
      : `Price checkpoint: stored ROI is ${pct(card.roi)}, so do not chase a worse number.`;
  }

  return null;
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

function actionGate(card: PublishedTrendCard, filters: TrendFilters) {
  const score = smartScore(card);
  const hasCurrent = card.todayMatches.length > 0;
  const hasSample = card.sampleSize >= Math.max(5, filters.sample || 1);
  const hasMarketSupport = card.intelligenceTags.length > 0 || card.category === "CLV-Backed";
  const hasPositiveReturn =
    (typeof card.roi === "number" && card.roi > 0) ||
    (typeof card.profitUnits === "number" && card.profitUnits > 0) ||
    (typeof card.hitRate === "number" && card.hitRate >= 56);

  if (hasCurrent && score >= 720 && hasSample && hasPositiveReturn) return "REVIEW LIVE PRICE";
  if (score >= 640 && hasSample && (hasMarketSupport || hasPositiveReturn)) return "WATCH FOR PRICE";
  if (score >= 560) return "CONTEXT ONLY";
  return "RESEARCH ONLY";
}

function killSwitches(card: PublishedTrendCard, filters: TrendFilters) {
  const flags: string[] = [];
  const sampleFloor = Math.max(5, filters.sample || 1);

  if (card.warning) flags.push(card.warning);
  if (card.sampleSize < sampleFloor) flags.push(`sample below ${sampleFloor}`);
  if (!card.todayMatches.length) flags.push("no current board qualifier");
  if (!card.intelligenceTags.length) flags.push("no CLV/market tag support");
  if (typeof card.roi === "number" && card.roi <= 0) flags.push("non-positive stored ROI");
  if (typeof card.hitRate === "number" && card.hitRate < 52) flags.push("thin hit-rate edge");

  return flags.length ? `Kill switches: ${flags.slice(0, 3).join("; ")}.` : "Kill switches: stale price, late injury/news change, lineup change, or odds moving through the fair checkpoint.";
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

function normalizeMatches(card: PublishedTrendCard, filters: TrendFilters): TrendMatchView[] {
  return card.todayMatches.slice(0, 4).map((match) => {
    const date = match.startTime.slice(0, 10);
    const priceNote = fairPriceNote(card);
    return {
      id: `${card.id}:${match.id}`,
      sport: match.sport,
      leagueKey: match.league,
      eventLabel: match.matchup,
      startTime: match.startTime,
      status: "PREGAME",
      stateDetail: null,
      matchingLogic: `${card.leagueLabel} | ${card.marketLabel} | ${card.category}`,
      recommendedBetLabel: actionGate(card, filters),
      oddsContext: [
        card.primaryMetricValue ? `${card.primaryMetricLabel}: ${card.primaryMetricValue}` : null,
        priceNote,
        `SmartScore ${smartScore(card)}`
      ].filter(Boolean).join(" · "),
      matchupHref: match.href,
      boardHref: match.league === "UFC" || match.league === "BOXING" ? null : `/?league=${match.league}&date=${date}`,
      propsHref: card.marketLabel.toLowerCase().includes("player") ? `/props?league=${match.league}` : null,
      supportNote: match.tag
    };
  });
}

function smartNote(card: PublishedTrendCard, filters: TrendFilters) {
  const parts = [
    card.description,
    `Action Gate: ${actionGate(card, filters)}`,
    `SmartScore ${smartScore(card)}`,
    fairPriceNote(card),
    card.intelligenceTags.length ? `Tags: ${card.intelligenceTags.join(", ")}` : null,
    card.todayMatches.length ? `${card.todayMatches.length} live qualifier${card.todayMatches.length === 1 ? "" : "s"}` : null
  ].filter(Boolean);
  return parts.join(". ");
}

function smartWhy(card: PublishedTrendCard, filters: TrendFilters) {
  const parts = [
    `Action Gate: ${actionGate(card, filters)}`,
    ...card.whyNow,
    ...card.intelligenceTags.slice(0, 3),
    fairPriceNote(card)
  ].filter(Boolean);
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
    note: smartNote(card, filters),
    explanation: `${card.railReason} Ranked by publisher score, sample, hit rate, ROI, profit, live qualifiers, and intelligence tags.`,
    whyItMatters: smartWhy(card, filters),
    caution: killSwitches(card, filters),
    href: card.href,
    tone: tone(card),
    todayMatches: normalizeMatches(card, filters)
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

function metrics(cards: PublishedTrendCard[], filters: TrendFilters): TrendMetricCard[] {
  const sorted = smartSort(cards);
  const top = sorted[0];
  const bestRoi = [...cards].filter((card) => typeof card.roi === "number").sort((a, b) => (b.roi ?? -999) - (a.roi ?? -999))[0];
  const liveMatches = cards.reduce((total, card) => total + (card.todayMatches?.length ?? 0), 0);
  const reviewCount = cards.filter((card) => actionGate(card, filters) === "REVIEW LIVE PRICE").length;

  return [
    { label: "Top SmartScore", value: top ? String(smartScore(top)) : "N/A", note: top?.title ?? "No card." },
    { label: "Review gates", value: String(reviewCount), note: "Trends with current qualifiers and enough support to check live price." },
    { label: "Live qualifiers", value: String(liveMatches), note: "Current games attached to trend cards." },
    { label: "Best ROI", value: bestRoi ? pct(bestRoi.roi) ?? "N/A" : "N/A", note: bestRoi ? `${bestRoi.title}. ${fairPriceNote(bestRoi) ?? "Check current odds."}` : "No ROI card." }
  ];
}

function rows(cards: PublishedTrendCard[], filters: TrendFilters): TrendTableRow[] {
  return smartSort(cards).slice(0, 10).map((card) => ({
    label: `${card.leagueLabel} ${card.marketLabel}`,
    movement: actionGate(card, filters),
    note: [card.title, `Score ${smartScore(card)}`, card.primaryMetricValue, fairPriceNote(card), ...card.whyNow, ...card.intelligenceTags.slice(0, 2)].filter(Boolean).join(" · "),
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
    const allMatches = dedupeMatches(cards.flatMap((card) => normalizeMatches(card, filters)));
    const reviewCount = cards.filter((card) => actionGate(card, filters) === "REVIEW LIVE PRICE").length;

    return {
      setup: null,
      mode: options?.mode ?? existing?.mode ?? "simple",
      aiQuery: options?.aiQuery ?? existing?.aiQuery ?? "",
      aiHelper: existing?.aiHelper ?? null,
      explanation: existing?.explanation ?? {
        headline: `${cards.length} smart-ranked trend${cards.length === 1 ? "" : "s"} loaded · ${reviewCount} review gate${reviewCount === 1 ? "" : "s"}`,
        whyItMatters: `${top.title} leads with SmartScore ${smartScore(top)}. ${smartWhy(top, filters)}`,
        caution: `${killSwitches(top, filters)} SmartScore ranks trends for review; it is not a standalone decision engine.`,
        queryLogic: summary(filters)
      },
      filters,
      cards: cards.map((card) => toCard(card, filters)),
      metrics: metrics(cards, filters),
      insights: cards.slice(0, 4).map((card) => ({
        id: `published-${card.id}`,
        title: card.title,
        value: actionGate(card, filters),
        note: [card.description, `Score ${smartScore(card)}`, fairPriceNote(card), ...card.intelligenceTags.slice(0, 3)].filter(Boolean).join(" · "),
        tone: tone(card)
      })),
      movementRows: rows(cards, filters),
      segmentRows: sections.slice(0, 8).map((section) => {
        const best = smartSort(section.cards ?? [])[0];
        return {
          label: section.category,
          movement: best ? actionGate(best, filters) : `${section.cards.length} cards`,
          note: best ? `${best.title} · Score ${smartScore(best)} · ${best.todayMatches.length} live · ${best.railReason}` : "Published trend section",
          href: best?.href ?? "/trends"
        };
      }),
      todayMatches: allMatches,
      todayMatchesNote: allMatches.length
        ? `${allMatches.length} live trend qualifier${allMatches.length === 1 ? "" : "s"} attached to the dashboard. Action gates now tell you whether to review, watch, or research only.`
        : "Trend cards loaded. No current games qualify for this filter yet.",
      savedSystems: existing?.savedSystems ?? [],
      savedTrendName: existing?.savedTrendName ?? "",
      sourceNote: "Loaded from the SharkEdge published trend feed and ranked by sample, ROI, hit rate, profit, live qualifiers, intelligence tags, action gate, and fair-price checkpoint.",
      querySummary: summary(filters),
      sampleNote: qualified.length ? existing?.sampleNote ?? null : `No cards cleared the ${sampleFloor}+ sample filter, so showing strongest available trends.`
    };
  } catch {
    return null;
  }
}

async function signalDashboard(
  filters: TrendFilters,
  options?: { mode?: TrendMode; aiQuery?: string }
): Promise<TrendDashboardView | null> {
  try {
    return await buildSignalTrendDashboard(filters, options);
  } catch {
    return null;
  }
}

function hasCards(view: TrendDashboardView | null | undefined) {
  return Boolean(view && !view.setup && Array.isArray(view.cards) && view.cards.length > 0);
}

function hasRealCurrentGameCards(view: TrendDashboardView | null | undefined) {
  return Boolean(view?.cards?.some((card) => card.dateRange?.startsWith("Current games")));
}

async function bestAvailableDashboard(
  filters: TrendFilters,
  options?: { mode?: TrendMode; aiQuery?: string },
  existing?: TrendDashboardView | null
) {
  const signal = await signalDashboard(filters, options);
  if (hasRealCurrentGameCards(signal)) return signal;

  return (
    (await publishedDashboard(filters, options, existing)) ??
    signal ??
    buildFallbackTrendDashboard(filters)
  );
}

export async function getTrendDashboardSafe(
  filters: TrendFilters,
  options?: { mode?: TrendMode; aiQuery?: string; savedTrendId?: string | null }
): Promise<TrendDashboardView> {
  const signal = await signalDashboard(filters, options);
  if (hasRealCurrentGameCards(signal)) return signal;

  if (!hasUsableServerDatabaseUrl()) {
    return bestAvailableDashboard(filters, options);
  }

  try {
    const view = await getTrendDashboard(filters, options);
    if (hasCards(view)) return view;
    return bestAvailableDashboard(filters, options, view);
  } catch {
    return bestAvailableDashboard(filters, options);
  }
}
