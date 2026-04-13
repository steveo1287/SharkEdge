import Link from "next/link";
import { headers } from "next/headers";

import { MarketSparkline } from "@/components/charts/market-sparkline";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ResearchStatusNotice } from "@/components/ui/research-status-notice";
import { SectionTitle } from "@/components/ui/section-title";
import { getPublishedTrendFeed, type PublishedTrendCard, type PublishedTrendCategory } from "@/lib/trends/publisher";
import type { TrendFilters, TrendMode } from "@/lib/types/domain";
import { trendFiltersSchema } from "@/lib/validation/filters";
import type { RankedTrendPlay, TrendsPlaysResponse } from "@/services/trends/play-types";

export const dynamic = "force-dynamic";

type TrendsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type TrendsSort = "matchCount" | "roi" | "hitRate" | "sample";
type TrendsScope = "all" | "today";

type DeskTrendCard = {
  id: string;
  title: string;
  marketLabel: string;
  record: string;
  roiLabel: string;
  hitRateLabel: string;
  sampleSize: number;
  whyItMatters: string;
  caution: string;
  href: string | null;
  matchingToday: number;
  confidenceLabel: string;
  confidenceTone: "brand" | "premium" | "success" | "muted";
  family: PublishedTrendCategory;
  leagueLabel: string;
  primaryMetricLabel: string;
  primaryMetricValue: string;
  railReason: string;
  description: string;
  rankingScore: number;
  todayMatches: PublishedTrendCard["todayMatches"];
  sparklineValues: number[];
  supportState: "live" | "review";
};

type MatchingTrendItem = {
  id: string;
  matchup: string;
  league: string;
  startTime: string;
  trendTitle: string;
  context: string;
  href: string;
  marketLabel: string;
};

const TREND_FAMILY_OPTIONS = [
  "ALL",
  "Best of Board",
  "Overlooked Angles",
  "Most Profitable",
  "Highest Win Rate",
  "Hottest",
  "CLV-Backed",
  "Schedule Edges",
  "Favorites",
  "Underdogs",
  "Totals",
  "Team Trends",
  "Systems"
] as const;

const REVIEW_SCAFFOLD: DeskTrendCard[] = [
  {
    id: "review-home-rest-edge",
    title: "Home favorites after bullpen-rest edge",
    marketLabel: "Moneyline",
    record: "61-39",
    roiLabel: "+8.9%",
    hitRateLabel: "61.0%",
    sampleSize: 100,
    whyItMatters:
      "This is the kind of compact, repeatable MLB spot beginners can understand fast: rest edge, clean market, and a familiar side.",
    caution:
      "Bullpen notes and lineup scratches still matter more than a broad historical angle on a single game.",
    href: null,
    matchingToday: 0,
    confidenceLabel: "Review support",
    confidenceTone: "premium",
    family: "Favorites",
    leagueLabel: "MLB",
    primaryMetricLabel: "ROI",
    primaryMetricValue: "+8.9%",
    railReason: "Review-ready card framing while live MLB publishing fills out.",
    description:
      "Home favorites in verified bullpen-rest spots have held their price and closed efficiently.",
    rankingScore: 705,
    todayMatches: [],
    sparklineValues: [52, 54, 55, 57, 59, 61],
    supportState: "review"
  },
  {
    id: "review-cross-country-under",
    title: "Unders after cross-country opener travel",
    marketLabel: "Total",
    record: "48-31-3",
    roiLabel: "+6.3%",
    hitRateLabel: "60.8%",
    sampleSize: 82,
    whyItMatters:
      "It introduces sharper users to schedule-linked trend logic without pretending the system is a stand-alone green light.",
    caution:
      "Travel spots degrade quickly if wind, total movement, or late lineup changes flip the live read.",
    href: null,
    matchingToday: 0,
    confidenceLabel: "Review support",
    confidenceTone: "premium",
    family: "Schedule Edges",
    leagueLabel: "MLB",
    primaryMetricLabel: "WIN %",
    primaryMetricValue: "60.8%",
    railReason: "Good review target for a trend card that reads clearly in both simple and power modes.",
    description:
      "Travel-heavy series openers often cool early offense, especially when the market opens high.",
    rankingScore: 688,
    todayMatches: [],
    sparklineValues: [49, 50, 52, 54, 57, 61],
    supportState: "review"
  },
  {
    id: "review-road-dog-rematch",
    title: "Divisional road dogs in rematch spots",
    marketLabel: "Moneyline",
    record: "57-50",
    roiLabel: "+4.4%",
    hitRateLabel: "53.3%",
    sampleSize: 107,
    whyItMatters:
      "This is the more nuanced card: thinner edge, lower hit rate, but useful for sharper users watching over-adjusted rematch pricing.",
    caution:
      "This belongs in the watch column when price support is weak. It is not a blind-play system.",
    href: null,
    matchingToday: 0,
    confidenceLabel: "Measured",
    confidenceTone: "muted",
    family: "Underdogs",
    leagueLabel: "MLB",
    primaryMetricLabel: "PROFIT",
    primaryMetricValue: "+4.7u",
    railReason: "Good example of a trend card that should feel useful without sounding overconfident.",
    description:
      "Rematch pricing can shade too hard toward the prior result, creating cleaner dog entries than the public framing suggests.",
    rankingScore: 642,
    todayMatches: [],
    sparklineValues: [51, 51.5, 52, 52.4, 52.8, 53.3],
    supportState: "review"
  }
];

function readValue(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function parseMode(value: string | undefined): TrendMode {
  return value === "power" ? "power" : "simple";
}

function parseFamily(value: string | undefined): (typeof TREND_FAMILY_OPTIONS)[number] {
  return TREND_FAMILY_OPTIONS.find((item) => item === value) ?? "ALL";
}

function parseSort(value: string | undefined): TrendsSort {
  if (value === "roi" || value === "hitRate" || value === "sample") {
    return value;
  }

  return "matchCount";
}

function parseScope(value: string | undefined): TrendsScope {
  return value === "today" ? "today" : "all";
}

function buildTrendFilters(searchParams: Record<string, string | string[] | undefined>): TrendFilters {
  const windowValue = readValue(searchParams, "window");
  const parsed = trendFiltersSchema.safeParse({
    sport: "BASEBALL",
    league: "MLB",
    market: readValue(searchParams, "market"),
    sportsbook: readValue(searchParams, "sportsbook"),
    side: readValue(searchParams, "side"),
    subject: readValue(searchParams, "subject"),
    team: readValue(searchParams, "team"),
    player: readValue(searchParams, "player"),
    fighter: readValue(searchParams, "fighter"),
    opponent: readValue(searchParams, "opponent"),
    window: windowValue,
    sample: readValue(searchParams, "sample")
  });

  const base = parsed.success ? parsed.data : trendFiltersSchema.parse({ sport: "BASEBALL", league: "MLB" });

  return {
    ...base,
    sport: "BASEBALL",
    league: "MLB",
    window:
      windowValue === "30d" || windowValue === "90d" || windowValue === "365d" || windowValue === "all"
        ? windowValue
        : "365d",
    sample: Math.max(base.sample, 10)
  };
}

function buildTrendHref(
  currentSearch: Record<string, string | string[] | undefined>,
  overrides: Record<string, string | number | null | undefined>
) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(currentSearch)) {
    const normalized = Array.isArray(value) ? value[0] : value;
    if (typeof normalized === "string" && normalized.length) {
      params.set(key, normalized);
    }
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === null || value === undefined || value === "") {
      params.delete(key);
      continue;
    }

    params.set(key, String(value));
  }

  const query = params.toString();
  return query ? `/trends?${query}` : "/trends";
}

function formatPercent(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "No edge yet";
  }

  return `${value.toFixed(1)}%`;
}

function formatRoi(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Pending";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatEventTime(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

async function getRequestOrigin() {
  const headerList = await headers();
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  if (!host) {
    return null;
  }
  return `${proto}://${host}`;
}

async function fetchTrendPlays(): Promise<TrendsPlaysResponse> {
  const origin = await getRequestOrigin();
  const url = origin ? `${origin}/api/trends/plays` : "http://localhost:3000/api/trends/plays";

  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Trends plays route returned ${response.status}`);
    }
    return (await response.json()) as TrendsPlaysResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load trend plays.";
    return {
      generatedAt: new Date().toISOString(),
      diagnostics: {
        historicalRows: 0,
        currentRows: 0,
        discoveredSystems: 0,
        validatedSystems: 0,
        activeCandidates: 0,
        surfacedPlays: 0,
        providerStatus: "down",
        issues: [message]
      },
      bestPlays: [],
      buildingSignals: [],
      historicalSystems: []
    };
  }
}

function formatProb(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return `${(value * 100).toFixed(1)}%`;
}

function formatEdge(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatOdds(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return `${value > 0 ? "+" : ""}${value}`;
}

function playMarketLabel(play: RankedTrendPlay) {
  if (play.marketType === "moneyline") return "Moneyline";
  if (play.marketType === "spread") return "Spread";
  return "Total";
}

function getConfidenceTone(confidence: PublishedTrendCard["confidence"]) {
  if (confidence === "strong") return "success" as const;
  if (confidence === "moderate") return "brand" as const;
  if (confidence === "weak") return "muted" as const;
  return "premium" as const;
}

function getConfidenceLabel(confidence: PublishedTrendCard["confidence"]) {
  if (confidence === "strong") return "Stable";
  if (confidence === "moderate") return "Measured";
  if (confidence === "weak") return "Use with care";
  return "Limited sample";
}

function buildSparklineValues(card: PublishedTrendCard) {
  const values = [
    card.hitRate,
    card.roi,
    card.profitUnits,
    card.todayMatches.length ? card.todayMatches.length * 4 : null,
    card.rankingScore / 18
  ];

  return values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function toDeskTrendCard(card: PublishedTrendCard): DeskTrendCard {
  return {
    id: card.id,
    title: card.title,
    marketLabel: card.marketLabel,
    record: card.record,
    roiLabel: formatRoi(card.roi),
    hitRateLabel: formatPercent(card.hitRate),
    sampleSize: card.sampleSize,
    whyItMatters: card.whyNow[0] ?? card.description,
    caution: card.warning ?? "Use this with the live board, not instead of it.",
    href: card.href,
    matchingToday: card.todayMatches.length,
    confidenceLabel: getConfidenceLabel(card.confidence),
    confidenceTone: getConfidenceTone(card.confidence),
    family: card.category,
    leagueLabel: card.leagueLabel,
    primaryMetricLabel: card.primaryMetricLabel,
    primaryMetricValue: card.primaryMetricValue,
    railReason: card.railReason,
    description: card.description,
    rankingScore: card.rankingScore,
    todayMatches: card.todayMatches,
    sparklineValues: buildSparklineValues(card),
    supportState: "live"
  };
}

function buildMatchingItems(cards: DeskTrendCard[]) {
  const rows: MatchingTrendItem[] = [];
  const seen = new Set<string>();

  for (const card of cards) {
    for (const match of card.todayMatches) {
      const key = `${card.id}:${match.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        id: key,
        matchup: match.matchup,
        league: match.league,
        startTime: match.startTime,
        trendTitle: card.title,
        context: `${card.marketLabel} | ${card.record} | ${card.roiLabel}`,
        href: match.href,
        marketLabel: card.marketLabel
      });
    }
  }

  return rows.sort((left, right) => Date.parse(left.startTime) - Date.parse(right.startTime));
}

function buildQuerySummary(filters: TrendFilters, family: string, scope: TrendsScope, sort: TrendsSort) {
  return [
    filters.league,
    filters.market === "ALL" ? "all markets" : filters.market.replace(/_/g, " "),
    `${filters.sample}+ sample`,
    filters.window === "365d" ? "1y window" : filters.window,
    family === "ALL" ? "all families" : family,
    scope === "today" ? "matching today" : "full desk",
    sort === "matchCount" ? "sorted by live matches" : `sorted by ${sort}`
  ];
}

function sortDeskCards(cards: DeskTrendCard[], sort: TrendsSort) {
  return [...cards].sort((left, right) => {
    if (sort === "roi") {
      return (parseFloat(right.roiLabel) || -999) - (parseFloat(left.roiLabel) || -999);
    }

    if (sort === "hitRate") {
      return (parseFloat(right.hitRateLabel) || -999) - (parseFloat(left.hitRateLabel) || -999);
    }

    if (sort === "sample") {
      return right.sampleSize - left.sampleSize;
    }

    if (right.matchingToday !== left.matchingToday) {
      return right.matchingToday - left.matchingToday;
    }

    return right.rankingScore - left.rankingScore;
  });
}
function TrendCard({ card, mode }: { card: DeskTrendCard; mode: TrendMode }) {
  return (
    <article className="concept-panel concept-panel-default grid gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            <Badge tone={card.supportState === "review" ? "premium" : "brand"}>{card.family}</Badge>
            <Badge tone={card.confidenceTone}>{card.confidenceLabel}</Badge>
            {card.matchingToday ? <Badge tone="success">{card.matchingToday} matching today</Badge> : null}
          </div>
          <h2 className="mt-4 text-balance font-display text-[1.38rem] font-semibold leading-tight tracking-[-0.04em] text-white md:text-[1.58rem]">
            {card.title}
          </h2>
          <p className="mt-2 text-sm leading-7 text-slate-400">{card.description}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="concept-meta">{card.primaryMetricLabel}</div>
          <div className="text-right font-display text-[1.5rem] font-semibold tracking-[-0.04em] text-white">
            {card.primaryMetricValue}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="concept-metric">
          <div className="concept-meta">Record</div>
          <div className="concept-metric-value">{card.record}</div>
          <div className="concept-metric-note">{card.marketLabel}</div>
        </div>
        <div className="concept-metric">
          <div className="concept-meta">ROI</div>
          <div className="concept-metric-value">{card.roiLabel}</div>
          <div className="concept-metric-note">{card.leagueLabel}</div>
        </div>
        <div className="concept-metric">
          <div className="concept-meta">Hit rate</div>
          <div className="concept-metric-value">{card.hitRateLabel}</div>
          <div className="concept-metric-note">{card.sampleSize} game sample</div>
        </div>
        <div className="concept-metric">
          <div className="concept-meta">Live posture</div>
          <div className="concept-metric-value">{card.matchingToday ? "On slate" : "Watch"}</div>
          <div className="concept-metric-note">{card.railReason}</div>
        </div>
      </div>

      <div className={mode === "power" ? "grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]" : "grid gap-3"}>
        <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/55 px-4 py-4">
          <div className="concept-meta">Why this matters</div>
          <div className="mt-2 text-sm leading-7 text-slate-200">{card.whyItMatters}</div>
          <div className="mt-3 border-t border-white/8 pt-3 text-sm leading-7 text-amber-100">{card.caution}</div>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-[1.15rem] border border-white/8 bg-slate-950/55 px-4 py-4 xl:min-w-[190px] xl:flex-col xl:items-start">
          <div>
            <div className="concept-meta">Signal strip</div>
            <div className="mt-2 text-sm leading-6 text-slate-400">
              {card.supportState === "review" ? "Review scaffold" : "Published trend feed"}
            </div>
          </div>
          <MarketSparkline values={card.sparklineValues} accent={card.matchingToday ? "green" : "cyan"} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
          {card.supportState === "review" ? "Review support only" : "Live trend publication"}
        </div>
        {card.href ? (
          <Link href={card.href} className="concept-chip concept-chip-accent">
            Open context
          </Link>
        ) : (
          <span className="concept-chip concept-chip-muted">Drill-in next</span>
        )}
      </div>
    </article>
  );
}

function MatchingRow({ item }: { item: MatchingTrendItem }) {
  return (
    <Link href={item.href} className="concept-list-row transition hover:border-sky-400/24 hover:bg-slate-950/80">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap gap-2">
          <Badge tone="brand">{item.league}</Badge>
          <Badge tone="muted">{item.marketLabel}</Badge>
        </div>
        <div className="mt-3 text-lg font-semibold text-white">{item.matchup}</div>
        <div className="mt-2 text-sm leading-6 text-slate-300">{item.trendTitle}</div>
        <div className="mt-2 text-sm leading-6 text-slate-400">{item.context}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="concept-meta">First pitch</div>
        <div className="mt-2 text-sm font-medium text-slate-200">{formatEventTime(item.startTime)}</div>
      </div>
    </Link>
  );
}

function PlayCard({ play }: { play: RankedTrendPlay }) {
  return (
    <div className="grid gap-3 rounded-[1.25rem] border border-white/10 bg-slate-950/55 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Badge
            tone={
              play.tier === "A"
                ? "success"
                : play.tier === "B"
                  ? "brand"
                  : play.tier === "C"
                    ? "premium"
                    : "muted"
            }
          >
            Tier {play.tier}
          </Badge>
          <Badge tone="muted">{play.league}</Badge>
          <Badge tone="muted">{playMarketLabel(play)}</Badge>
          <Badge
            tone={
              play.activationState === "LIVE_NOW"
                ? "success"
                : play.activationState === "BUILDING"
                  ? "premium"
                  : "muted"
            }
          >
            {play.activationState === "LIVE_NOW"
              ? "Best Play"
              : play.activationState === "BUILDING"
                ? "Building"
                : "System"}
          </Badge>
        </div>
        <div className="text-right">
          <div className="concept-meta">Final score</div>
          <div className="mt-1 text-base font-semibold text-white">{play.finalScore}</div>
        </div>
      </div>

      <div className="grid gap-1">
        <div className="text-base font-semibold text-white">{play.gameLabel}</div>
        <div className="text-sm text-slate-300">
          {play.selection}
          {play.line !== null ? ` @ ${play.line}` : ""}{" "}
          {play.oddsAmerican !== null ? `(${formatOdds(play.oddsAmerican)})` : ""}
        </div>
        <div className="text-sm text-slate-400">
          {play.sportsbook ? `Book: ${play.sportsbook}` : "Book: n/a"}
          <span className="mx-2 text-white/10">|</span>
          Edge: <span className="text-emerald-200">{formatEdge(play.edgePct)}</span>
          <span className="mx-2 text-white/10">|</span>
          Conf: {play.confidenceScore}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-[1rem] border border-white/8 bg-slate-950/70 px-4 py-3">
          <div className="concept-meta">Market implied</div>
          <div className="mt-2 text-sm font-medium text-white">{formatProb(play.marketImpliedProb)}</div>
          <div className="mt-1 text-xs text-slate-400">From current odds</div>
        </div>
        <div className="rounded-[1rem] border border-white/8 bg-slate-950/70 px-4 py-3">
          <div className="concept-meta">Model fair</div>
          <div className="mt-2 text-sm font-medium text-white">
            {formatProb(play.calibratedModelProb)}{" "}
            {play.fairOddsAmerican !== null ? `(${formatOdds(play.fairOddsAmerican)})` : ""}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Band: {formatProb(play.probabilityLowerBound)} to {formatProb(play.probabilityUpperBound)}
          </div>
        </div>
      </div>

      {play.reasons.length ? (
        <div className="rounded-[1rem] border border-white/8 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
          <div className="concept-meta">Why it qualifies</div>
          <ul className="mt-2 grid gap-1">
            {play.reasons.slice(0, 4).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {play.warnings.length ? (
        <div className="rounded-[1rem] border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          <div className="concept-meta">Warnings</div>
          <ul className="mt-2 grid gap-1">
            {play.warnings.slice(0, 3).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export default async function TrendsPage({ searchParams }: TrendsPageProps) {
  const resolvedSearch = (await searchParams) ?? {};
  const mode = parseMode(readValue(resolvedSearch, "mode"));
  const family = parseFamily(readValue(resolvedSearch, "family"));
  const scope = parseScope(readValue(resolvedSearch, "scope"));
  const sort = parseSort(readValue(resolvedSearch, "sort"));
  const filters = buildTrendFilters(resolvedSearch);
  const plays = await fetchTrendPlays();
  const feed = await getPublishedTrendFeed(filters);

  const liveCards = feed.sections
    .flatMap((section) => section.cards)
    .filter((card) => card.leagueLabel === "MLB")
    .map(toDeskTrendCard);

  const usingReviewScaffold = liveCards.length < 2;
  const seededCards = usingReviewScaffold ? [...REVIEW_SCAFFOLD] : liveCards;
  const filteredCards = seededCards.filter((card) => (family === "ALL" ? true : card.family === family));
  const scopeCards = scope === "today" ? filteredCards.filter((card) => card.matchingToday > 0) : filteredCards;
  const displayCards = sortDeskCards(scopeCards, sort).slice(0, mode === "simple" ? 4 : 8);
  const matchingItems = buildMatchingItems(displayCards).slice(0, mode === "simple" ? 6 : 10);
  const familyCounts = Array.from(
    new Map(
      seededCards.map(
        (card) => [card.family, seededCards.filter((candidate) => candidate.family === card.family).length] as const
      )
    )
  );
  const querySummary = buildQuerySummary(filters, family, scope, sort);
  const liveMatchCount = buildMatchingItems(liveCards).length;
  const surfacedNow = plays.bestPlays.length + plays.buildingSignals.length;

  return (
    <div className="grid gap-6">
      <section className="concept-panel concept-panel-accent grid gap-5 px-5 py-5 md:px-7 md:py-6 xl:grid-cols-[1.08fr_0.92fr] xl:items-end">
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone="brand">Trends desk</Badge>
            <Badge tone="success">MLB first</Badge>
            <Badge tone={mode === "simple" ? "brand" : "premium"}>{mode === "simple" ? "Simple mode" : "Power mode"}</Badge>
            <Badge tone={usingReviewScaffold ? "premium" : "success"}>
              {usingReviewScaffold ? "Review support" : "Live publication"}
            </Badge>
          </div>
          <div className="section-kicker">MLB trend systems</div>
          <div className="max-w-3xl font-display text-[2.2rem] font-semibold leading-[0.95] tracking-[-0.045em] text-white md:text-[3rem]">
            Historical systems with today's slate attached, not dumped into a generic sportsbook grid.
          </div>
          <p className="max-w-3xl text-sm leading-7 text-slate-300 md:text-[0.98rem]">
            This first pass is intentionally MLB-first: feature the systems, show the games they touch today, and keep the caution visible instead of buried.
          </p>
          <div className="flex flex-wrap gap-2">
            {querySummary.map((item) => (
              <span key={item} className="concept-chip concept-chip-muted">
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="grid gap-3 rounded-[1.45rem] border border-white/10 bg-[#07111c]/86 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="concept-meta">Desk state</div>
            <Badge tone={usingReviewScaffold ? "premium" : "success"}>
              {usingReviewScaffold ? "Partial live wiring" : "Live MLB systems"}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="concept-metric">
              <div className="concept-meta">Featured cards</div>
              <div className="concept-metric-value">{displayCards.length}</div>
              <div className="concept-metric-note">Top systems surfaced for this review pass.</div>
            </div>
            <div className="concept-metric">
              <div className="concept-meta">Matching today</div>
              <div className="concept-metric-value">{liveMatchCount}</div>
              <div className="concept-metric-note">Live board linkage currently visible for MLB trend cards.</div>
            </div>
          </div>
          <div className="rounded-[1.1rem] border border-white/8 bg-slate-950/60 px-4 py-3 text-sm leading-6 text-slate-300">
            {usingReviewScaffold
              ? "Live MLB publication is still thin, so the card system falls back to honest review scaffolds instead of pretending a finished trend engine is already here."
              : "Published MLB trend cards are powering the featured system strip, while matching-game linkage stays attached where the live feed supports it."}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Link
              href={buildTrendHref(resolvedSearch, { mode: "simple" })}
              className={mode === "simple" ? "concept-chip concept-chip-accent justify-center" : "concept-chip concept-chip-muted justify-center"}
            >
              Simple mode
            </Link>
            <Link
              href={buildTrendHref(resolvedSearch, { mode: "power" })}
              className={mode === "power" ? "concept-chip concept-chip-accent justify-center" : "concept-chip concept-chip-muted justify-center"}
            >
              Power mode
            </Link>
          </div>
        </div>
      </section>

      <ResearchStatusNotice
        eyebrow="Support state"
        title={usingReviewScaffold ? "Review-ready, not overclaimed" : "Published MLB systems are live"}
        tone={usingReviewScaffold ? "premium" : "success"}
        body={
          usingReviewScaffold
            ? "Featured system cards are using a tightly scoped MLB review scaffold because the live published feed is not yet deep enough to carry the whole page with conviction. Matching games stay honest and only show live linkage when real support exists."
            : "Featured cards and matching-game rows are coming from the published trends feed. Where live matching context is absent, the page stays quiet instead of manufacturing connection."
        }
        meta={
          feed.meta.sampleWarning
            ? `Sample note: ${feed.meta.sampleWarning}`
            : "This page is scoped to MLB V1 on purpose so the first public trends desk can feel polished without faking backend depth."
        }
      />

      <section className="concept-panel grid gap-4 p-5">
        <SectionTitle
          eyebrow="Calibration-first"
          title="Trends Play Engine"
          description="Ranked opportunities are scored by conservative calibrated edge versus the current market, not raw historical hit rate."
        />
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="concept-metric">
            <div className="concept-meta">Validated systems</div>
            <div className="concept-metric-value">{plays.diagnostics.validatedSystems}</div>
            <div className="concept-metric-note">Systems with computed snapshots.</div>
          </div>
          <div className="concept-metric">
            <div className="concept-meta">Live candidates</div>
            <div className="concept-metric-value">{plays.diagnostics.activeCandidates}</div>
            <div className="concept-metric-note">System-to-board matches evaluated.</div>
          </div>
          <div className="concept-metric">
            <div className="concept-meta">Surfaced now</div>
            <div className="concept-metric-value">{surfacedNow}</div>
            <div className="concept-metric-note">Best plays + building signals.</div>
          </div>
        </div>

        <details className="rounded-[1.1rem] border border-white/10 bg-slate-950/55 px-4 py-3 text-sm text-slate-300">
          <summary className="cursor-pointer list-none select-none text-slate-200">
            Diagnostics ({plays.diagnostics.providerStatus})
          </summary>
          <div className="mt-3 grid gap-2">
            <div className="concept-list-row">
              <div className="concept-meta">Historical rows</div>
              <div className="text-sm font-medium text-white">{plays.diagnostics.historicalRows}</div>
            </div>
            <div className="concept-list-row">
              <div className="concept-meta">Current rows</div>
              <div className="text-sm font-medium text-white">{plays.diagnostics.currentRows}</div>
            </div>
            <div className="concept-list-row">
              <div className="concept-meta">Discovered systems</div>
              <div className="text-sm font-medium text-white">{plays.diagnostics.discoveredSystems}</div>
            </div>
            <div className="concept-list-row">
              <div className="concept-meta">Validated systems</div>
              <div className="text-sm font-medium text-white">{plays.diagnostics.validatedSystems}</div>
            </div>
            <div className="concept-list-row">
              <div className="concept-meta">Active candidates</div>
              <div className="text-sm font-medium text-white">{plays.diagnostics.activeCandidates}</div>
            </div>
            <div className="concept-list-row">
              <div className="concept-meta">Surfaced plays</div>
              <div className="text-sm font-medium text-white">{plays.diagnostics.surfacedPlays}</div>
            </div>
            {plays.diagnostics.issues.length ? (
              <div className="rounded-[1rem] border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-amber-100">
                <div className="concept-meta">Issues</div>
                <ul className="mt-2 grid gap-1">
                  {plays.diagnostics.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </details>
      </section>

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Best plays"
          title="Best Plays Now"
          description="Only shows when the conservative edge and confidence thresholds are met."
        />
        {plays.bestPlays.length ? (
          <div className="grid gap-3">
            {plays.bestPlays.slice(0, mode === "simple" ? 6 : 12).map((play) => (
              <PlayCard key={`${play.systemId}:${play.eventId}:${play.selection}`} play={play} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No qualified best plays right now"
            description="That can be healthy. The engine is staying conservative instead of fabricating edges. Check Building Signals and Historical Systems for context."
          />
        )}
      </section>

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Watch list"
          title="Building Signals"
          description="Positive point edge, but not yet across the conservative thresholds (number quality, confidence, or timing)."
        />
        {plays.buildingSignals.length ? (
          <div className="grid gap-3">
            {plays.buildingSignals.slice(0, mode === "simple" ? 6 : 14).map((play) => (
              <PlayCard key={`${play.systemId}:${play.eventId}:${play.selection}`} play={play} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No building signals yet"
            description="Either the board is quiet, or you need more validated systems + current odds ingestion."
          />
        )}
      </section>

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Systems"
          title="Historical Systems"
          description="Still useful intelligence, but not presented as bettable unless the live market qualifies."
        />
        {plays.historicalSystems.length ? (
          <div className="grid gap-3">
            {plays.historicalSystems.slice(0, mode === "simple" ? 8 : 18).map((play) => (
              <PlayCard key={`${play.systemId}:${play.eventId}`} play={play} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No historical systems found"
            description="Once the database is connected and `worker:trends` runs, validated systems will populate here even when no live edges qualify."
          />
        )}
      </section>

      <div className={mode === "power" ? "grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_340px]" : "grid gap-5"}>
        <div className="grid gap-5">
          <section className="concept-panel p-4 md:p-5">
            <SectionTitle
              eyebrow={mode === "simple" ? "Simple mode" : "Power mode"}
              title={mode === "simple" ? "Fast scan first" : "Operator view"}
              description={
                mode === "simple"
                  ? "Approachable framing up top: why it matters, where the caution lives, and which MLB games actually match today."
                  : "Denser research workflow: family, sorting, and match scope stay visible without bloating the page into a fake analytics cockpit."
              }
              action={
                <div className="flex flex-wrap gap-2">
                  {mode === "simple" ? (
                    <>
                      <Link href={buildTrendHref(resolvedSearch, { market: "ALL" })} className={filters.market === "ALL" ? "concept-chip concept-chip-accent" : "concept-chip concept-chip-muted"}>
                        all markets
                      </Link>
                      <Link href={buildTrendHref(resolvedSearch, { market: "moneyline" })} className={filters.market === "moneyline" ? "concept-chip concept-chip-accent" : "concept-chip concept-chip-muted"}>
                        moneyline
                      </Link>
                      <Link href={buildTrendHref(resolvedSearch, { market: "total" })} className={filters.market === "total" ? "concept-chip concept-chip-accent" : "concept-chip concept-chip-muted"}>
                        totals
                      </Link>
                      <Link href={buildTrendHref(resolvedSearch, { sample: 10 })} className={filters.sample === 10 ? "concept-chip concept-chip-accent" : "concept-chip concept-chip-muted"}>
                        10+ sample
                      </Link>
                      <Link href={buildTrendHref(resolvedSearch, { scope: scope === "today" ? "all" : "today" })} className={scope === "today" ? "concept-chip concept-chip-accent" : "concept-chip concept-chip-muted"}>
                        {scope === "today" ? "matching today" : "full desk"}
                      </Link>
                    </>
                  ) : (
                    <Badge tone="muted">Filter rail active</Badge>
                  )}
                </div>
              }
            />
          </section>

          <section className="grid gap-4">
            <SectionTitle
              eyebrow="Featured trend cards"
              title="MLB systems worth reading before you touch today's board"
              description="The card structure is doing real work here: headline, sample, ROI, hit rate, what it means, and what should slow you down."
            />

            {displayCards.length ? (
              <div className="grid gap-4">
                {displayCards.map((card) => (
                  <TrendCard key={card.id} card={card} mode={mode} />
                ))}
              </div>
            ) : (
              <EmptyState
                eyebrow="Trend systems"
                title="No MLB systems survive this exact filter mix"
                description="That is a valid output. Tightening the desk should be allowed to empty the screen without pretending there's a trend worth forcing."
                action={
                  <div className="flex flex-wrap justify-center gap-3">
                    <Link href={buildTrendHref(resolvedSearch, { family: null, scope: "all", market: "ALL" })} className="concept-chip concept-chip-accent">
                      Reset filters
                    </Link>
                    <Link href="/board" className="concept-chip concept-chip-muted">
                      Open board
                    </Link>
                  </div>
                }
              />
            )}
          </section>

          <section className="concept-panel grid gap-4 p-5">
            <SectionTitle
              eyebrow="Today's matching games"
              title="Where the systems touch the live MLB slate"
              description="This is the operational cut: game, time, and which trend actually links to that matchup right now."
            />

            {matchingItems.length ? (
              <div className="grid gap-3">
                {matchingItems.map((item) => (
                  <MatchingRow key={item.id} item={item} />
                ))}
              </div>
            ) : usingReviewScaffold ? (
              <ResearchStatusNotice
                eyebrow="Live linkage expanding"
                title="Matching-game rows are partially wired"
                tone="premium"
                body="The featured cards are review-ready today, but additional live board linkage is still coming online. That means the page stays polished without pretending those specific MLB systems already have full matchup resolution."
                meta="Next step is wiring more published trends directly into today's game list, not inflating placeholder matches."
              />
            ) : (
              <EmptyState
                eyebrow="Matching today"
                title="No current MLB games match these systems"
                description="The desk should be allowed to say that plainly. Try widening the market filter or switching back to the full desk."
                action={
                  <div className="flex flex-wrap justify-center gap-3">
                    <Link href={buildTrendHref(resolvedSearch, { scope: "all" })} className="concept-chip concept-chip-accent">
                      Show full desk
                    </Link>
                    <Link href="/games" className="concept-chip concept-chip-muted">
                      Open games
                    </Link>
                  </div>
                }
              />
            )}
          </section>
        </div>

        <aside className="grid gap-5 content-start">
          <section className="concept-panel grid gap-4 p-5">
            <SectionTitle
              eyebrow="Power rail"
              title="Query + filter posture"
              description="This is the near-term power-user seam: compact, serious, and honest about what is already live."
            />

            <form action="/trends" method="get" className="grid gap-3">
              <input type="hidden" name="mode" value="power" />
              <input type="hidden" name="league" value="MLB" />
              <input type="hidden" name="sport" value="BASEBALL" />

              <div className="grid gap-2">
                <label className="concept-meta">Sport</label>
                <select disabled value="BASEBALL" className="rounded-[1rem] border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white opacity-80">
                  <option value="BASEBALL">MLB only in V1</option>
                </select>
              </div>

              <div className="grid gap-2">
                <label className="concept-meta">Market</label>
                <select name="market" defaultValue={filters.market} className="rounded-[1rem] border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white">
                  <option value="ALL">All MLB markets</option>
                  <option value="moneyline">Moneyline</option>
                  <option value="spread">Run line</option>
                  <option value="total">Game total</option>
                  <option value="team_total">Team total</option>
                </select>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-2">
                  <label className="concept-meta">Sample</label>
                  <select name="sample" defaultValue={String(filters.sample)} className="rounded-[1rem] border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white">
                    <option value="10">10+</option>
                    <option value="20">20+</option>
                    <option value="50">50+</option>
                  </select>
                </div>
                <div className="grid gap-2">
                  <label className="concept-meta">Window</label>
                  <select name="window" defaultValue={filters.window} className="rounded-[1rem] border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white">
                    <option value="30d">30d</option>
                    <option value="90d">90d</option>
                    <option value="365d">365d</option>
                    <option value="all">All history</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-2">
                <label className="concept-meta">Trend family</label>
                <select name="family" defaultValue={family} className="rounded-[1rem] border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white">
                  {TREND_FAMILY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option === "ALL" ? "All families" : option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-2">
                  <label className="concept-meta">Scope</label>
                  <select name="scope" defaultValue={scope} className="rounded-[1rem] border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white">
                    <option value="all">Full desk</option>
                    <option value="today">Matching today</option>
                  </select>
                </div>
                <div className="grid gap-2">
                  <label className="concept-meta">Sort</label>
                  <select name="sort" defaultValue={sort} className="rounded-[1rem] border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white">
                    <option value="matchCount">Live matches</option>
                    <option value="roi">ROI</option>
                    <option value="hitRate">Hit rate</option>
                    <option value="sample">Sample</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="rounded-[1rem] border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm font-medium text-sky-300"
              >
                Update desk
              </button>
            </form>

            <div className="rounded-[1.1rem] border border-white/8 bg-slate-950/55 px-4 py-4 text-sm leading-7 text-slate-400">
              Multi-sport families can come later. This first production pass stays MLB-first so the surface feels premium before the backend gets wider.
            </div>
          </section>

          <section className="concept-panel grid gap-4 p-5">
            <SectionTitle
              eyebrow="System families"
              title="What the desk is seeing"
              description="Category counts help sharper users understand the shape of the current MLB publication without needing a giant results table."
            />
            <div className="grid gap-2">
              {familyCounts.map(([label, count]) => (
                <div key={label} className="concept-list-row">
                  <div>
                    <div className="concept-meta">Family</div>
                    <div className="mt-2 text-base font-semibold text-white">{label}</div>
                  </div>
                  <Badge tone={family === label ? "brand" : "muted"}>{count}</Badge>
                </div>
              ))}
            </div>
          </section>

          <section className="concept-panel grid gap-4 p-5">
            <SectionTitle
              eyebrow="Support states"
              title="What is live vs what is staged"
              description="The desk earns trust by telling you where the backend is ready and where it is still filling in."
            />
            <div className="grid gap-3">
              <div className="concept-list-row">
                <div>
                  <div className="concept-meta">Featured cards</div>
                  <div className="mt-2 text-base font-semibold text-white">{usingReviewScaffold ? "Review scaffold" : "Published trend feed"}</div>
                </div>
                <Badge tone={usingReviewScaffold ? "premium" : "success"}>{usingReviewScaffold ? "partial" : "live"}</Badge>
              </div>
              <div className="concept-list-row">
                <div>
                  <div className="concept-meta">Matching games</div>
                  <div className="mt-2 text-base font-semibold text-white">{matchingItems.length ? "Linked to current slate" : "Waiting on more linkage"}</div>
                </div>
                <Badge tone={matchingItems.length ? "success" : "muted"}>{matchingItems.length ? "active" : "quiet"}</Badge>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
