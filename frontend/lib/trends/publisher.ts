import { prisma } from "@/lib/db/prisma";
import type { LeagueKey, TrendFilters } from "@/lib/types/domain";
import {
  getATSTrend,
  getFavoriteROI,
  getOUTrend,
  getRecentForm,
  getUnderdogROI,
  type TrendEngineResult
} from "@/lib/trends/engine";
import { scoreTrendResult } from "@/services/trends/scoring-engine";
import type { TrendFeatureSummary } from "@/services/trends/feature-warehouse";

export type PublishedTrendCategory =
  | "Best of Board"
  | "Most Profitable"
  | "Highest Win Rate"
  | "Hottest"
  | "Systems"
  | "Team Trends"
  | "Totals"
  | "Favorites"
  | "Underdogs"
  | "Overlooked Angles"
  | "CLV-Backed"
  | "Schedule Edges";

export type PublishedTrendCard = {
  id: string;
  title: string;
  description: string;
  category: PublishedTrendCategory;
  confidence: TrendEngineResult["confidence"];
  hitRate: number | null;
  roi: number | null;
  profitUnits: number | null;
  sampleSize: number;
  record: string;
  streak: string | null;
  warning: string | null;
  href: string;
  todayMatches: TrendEngineResult["todayMatches"];
  sourceTrend: TrendEngineResult;
  leagueLabel: string;
  marketLabel: string;
  primaryMetricLabel: "PROFIT" | "RECORD" | "STREAK" | "WIN %" | "EDGE";
  primaryMetricValue: string;
  rankingScore: number;
  whyNow: string[];
  intelligenceTags: string[];
  overlooked: boolean;
  railReason: string;
};

export type PublishedTrendSection = {
  category: PublishedTrendCategory;
  cards: PublishedTrendCard[];
};

type StoredTrendRunResult = {
  roi?: number | null;
  hitRate?: number | null;
  sampleSize?: number | null;
  averageMargin?: number | null;
};

type TrendAnalysis = Awaited<ReturnType<typeof scoreTrendResult>>;
type PublishedCandidate = PublishedTrendCard & {
  analysis: TrendAnalysis;
  canonicalKey: string;
};

const DISCOVER_LEAGUES: LeagueKey[] = ["NBA", "NCAAB", "MLB", "NHL", "NFL", "NCAAF"];
const CATEGORY_ORDER: PublishedTrendCategory[] = [
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
];
const MIN_TREND_SAMPLE_SIZE = 5;
const FEATURED_TREND_SCORE_FLOOR = 760;
const ELITE_TREND_SCORE_FLOOR = 655;

function getSubjectLabel(filters?: Partial<TrendFilters> | null) {
  const subject = filters?.team || filters?.subject || filters?.player || filters?.fighter || "";
  return subject.trim();
}

function shrinkSubject(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  return parts.length <= 2 ? trimmed : parts.slice(-2).join(" ");
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function getLeagueLabel(filters?: Partial<TrendFilters> | null) {
  if (filters?.league && filters.league !== "ALL") {
    return filters.league;
  }

  if (filters?.sport && filters.sport !== "ALL") {
    return filters.sport.replace(/_/g, " ");
  }

  return "Multi-Sport";
}

function getMarketLabel(result: TrendEngineResult, filters?: Partial<TrendFilters> | null) {
  if (filters?.market && filters.market !== "ALL") {
    if (filters.market === "moneyline") return "Moneyline";
    if (filters.market === "spread") return "Spread";
    if (filters.market === "total") return "Total";
    return filters.market.replace(/_/g, " ");
  }

  if (result.id === "ats") return "Spread";
  if (result.id === "ou") return "Total";
  if (result.id === "favorite-roi" || result.id === "underdog-roi") return "Moneyline";
  if (result.id === "recent-form") return "Form";
  return "Trend";
}

function buildRecord(result: TrendEngineResult) {
  return `${result.wins}-${result.losses}${result.pushes ? `-${result.pushes}` : ""}`;
}

function formatProfitUnits(value: number | null) {
  return typeof value === "number" ? `${value > 0 ? "+" : ""}${value.toFixed(1)}u` : "N/A";
}

function formatHitRate(value: number | null) {
  return typeof value === "number" ? `${value.toFixed(0)}%` : "N/A";
}

function formatEdgeScore(value: number) {
  return `${Math.round(value)}`;
}

function buildTrendHref(result: TrendEngineResult, filters?: Partial<TrendFilters> | null) {
  const params = new URLSearchParams();

  if (filters?.sport && filters.sport !== "ALL") params.set("sport", filters.sport);
  if (filters?.league && filters.league !== "ALL") params.set("league", filters.league);
  if (filters?.market && filters.market !== "ALL") params.set("market", filters.market);
  if (filters?.sportsbook && filters.sportsbook !== "all") params.set("sportsbook", filters.sportsbook);
  if (filters?.team) params.set("team", filters.team);
  if (filters?.subject) params.set("subject", filters.subject);
  if (filters?.player) params.set("player", filters.player);
  if (filters?.fighter) params.set("fighter", filters.fighter);
  if (filters?.opponent) params.set("opponent", filters.opponent);
  if (filters?.window) params.set("window", filters.window);
  if (filters?.sample) params.set("sample", String(filters.sample));

  if (result.id === "ats") {
    params.set("market", "spread");
  } else if (result.id === "ou") {
    params.set("market", "total");
  } else if (result.id === "favorite-roi" || result.id === "underdog-roi") {
    params.set("market", "moneyline");
  }

  const query = params.toString();
  return query ? `/trends?${query}` : "/trends";
}

export function determineTrendCategory(result: TrendEngineResult): PublishedTrendCategory {
  const streakLength = result.streak?.startsWith("W") ? Number(result.streak.slice(1)) || 0 : 0;

  if (
    typeof result.profitUnits === "number" &&
    result.profitUnits >= 8 &&
    result.sampleSize >= 20
  ) {
    return "Most Profitable";
  }

  if (
    typeof result.hitRate === "number" &&
    result.hitRate >= 60 &&
    result.sampleSize >= MIN_TREND_SAMPLE_SIZE
  ) {
    return "Highest Win Rate";
  }

  if (streakLength >= 4 && result.sampleSize >= MIN_TREND_SAMPLE_SIZE) {
    return "Hottest";
  }

  if (result.id === "ou") return "Totals";
  if (result.id === "favorite-roi") return "Favorites";
  if (result.id === "underdog-roi") return "Underdogs";
  if (result.id === "recent-form") return "Team Trends";
  return "Systems";
}

function categoryFromAnalysis(
  result: TrendEngineResult,
  context: TrendFeatureSummary
): PublishedTrendCategory {
  const baseCategory = determineTrendCategory(result);

  if (
    typeof context.averageClv === "number" &&
    context.averageClv > 0 &&
    typeof context.positiveClvRate === "number" &&
    context.positiveClvRate >= 56 &&
    result.sampleSize >= 16
  ) {
    return "CLV-Backed";
  }

  if (
    typeof context.restAdvantageDays === "number" &&
    context.restAdvantageDays >= 0.75 &&
    typeof context.scheduleContextScore === "number" &&
    context.scheduleContextScore <= 58 &&
    result.sampleSize >= 14
  ) {
    return "Schedule Edges";
  }

  return baseCategory;
}

function pickSignalPrefix(
  result: TrendEngineResult,
  context: TrendFeatureSummary
) {
  if (result.id === "underdog-roi") {
    if (typeof context.restAdvantageDays === "number" && context.restAdvantageDays >= 0.75) {
      return "Rested Dog Value";
    }
    if (typeof context.upsetRate === "number" && context.upsetRate >= 36) {
      return "Upset Dog Value";
    }
    return "Dog Value";
  }

  if (result.id === "favorite-roi") {
    if (typeof context.revengeRate === "number" && context.revengeRate >= 18) {
      return "Favorite Bounce Spot";
    }
    if (typeof context.holdQuality === "number" && context.holdQuality >= 55) {
      return "Price-Efficient Favorite";
    }
    return "Favorite Edge";
  }

  if (result.id === "ou") {
    if (typeof context.marketTightnessScore === "number" && context.marketTightnessScore >= 62) {
      return "Tight Total Run";
    }
    if (typeof context.scheduleContextScore === "number" && context.scheduleContextScore <= 55) {
      return "Schedule Total Spot";
    }
    return "Total Signal";
  }

  if (result.id === "ats") {
    if (typeof context.underdogCoverRate === "number" && context.underdogCoverRate >= 55) {
      return "Dog Cover Run";
    }
    if (typeof context.favoriteCoverRate === "number" && context.favoriteCoverRate >= 55) {
      return "Favorite Cover Run";
    }
    if (typeof context.restAdvantageDays === "number" && context.restAdvantageDays >= 0.75) {
      return "Rested Spread Edge";
    }
    return "Spread Edge";
  }

  if (result.id === "recent-form") {
    if (result.streak?.startsWith("W")) {
      return "Form Run";
    }
    return "Recent Form";
  }

  return "Trend Edge";
}

function buildTrendTitle(
  result: TrendEngineResult,
  subjectLabel: string,
  context: TrendFeatureSummary
) {
  const subject = shrinkSubject(subjectLabel);
  const prefix = pickSignalPrefix(result, context);

  if (!subject) {
    if (result.id === "favorite-roi" && typeof context.holdQuality === "number" && context.holdQuality >= 55) {
      return "Low-Hold Favorite Edge";
    }
    if (result.id === "underdog-roi" && typeof context.restAdvantageDays === "number" && context.restAdvantageDays >= 0.75) {
      return "Short-Rest Dog Value";
    }
    if (result.id === "ou" && typeof context.revengeRate === "number" && context.revengeRate >= 18) {
      return "Rematch Over Signal";
    }
    if (result.id === "ou" && typeof context.marketTightnessScore === "number" && context.marketTightnessScore >= 62) {
      return "Tight Total Under Run";
    }
    if (result.id === "ats" && typeof context.restAdvantageDays === "number" && context.restAdvantageDays >= 0.75) {
      return "Rested Spread Edge";
    }
    return prefix;
  }

  if (result.id === "ou") {
    const underLean =
      typeof context.totalHitRate === "number" && context.totalHitRate >= 57
        ? "Under"
        : "Total";
    return `${subject} ${underLean} ${prefix === "Total Signal" ? "Signal" : prefix}`;
  }

  if (result.id === "recent-form") {
    if (result.streak?.startsWith("W")) {
      return `${subject} Win Form Run`;
    }
    return `${subject} Form Edge`;
  }

  return `${subject} ${prefix}`;
}

function buildTrendDescription(
  result: TrendEngineResult,
  subjectLabel: string,
  category: PublishedTrendCategory,
  context: TrendFeatureSummary
) {
  if (!result.sampleSize) {
    return result.warning ?? "No real rows match this trend yet.";
  }

  const target = subjectLabel || result.title;
  const record = buildRecord(result);
  const roi = typeof result.roi === "number" ? `${result.roi > 0 ? "+" : ""}${result.roi.toFixed(1)}% ROI` : null;
  const matches =
    result.todayMatches.length > 0
      ? `${result.todayMatches.length} board match${result.todayMatches.length === 1 ? "" : "es"} today.`
      : "Waiting for the next clean board match.";
  const clv =
    typeof context.positiveClvRate === "number" && context.positiveClvRate >= 55
      ? `${context.positiveClvRate.toFixed(0)}% positive CLV support.`
      : "";
  const schedule =
    typeof context.restAdvantageDays === "number" && context.restAdvantageDays >= 0.75
      ? ` Rest edge is carrying ${context.restAdvantageDays.toFixed(1)} days of advantage.`
      : "";

  if (category === "Hottest") {
    return `${record} with ${result.streak ?? "current"} momentum. ${matches}`;
  }

  if (category === "Highest Win Rate") {
    return `${record}${roi ? `, ${roi}` : ""}, elite hit-rate support. ${matches}`;
  }

  if (category === "Most Profitable") {
    return `${formatProfitUnits(result.profitUnits)} on a ${record} profile${roi ? ` with ${roi}` : ""}. ${matches}`;
  }

  if (category === "CLV-Backed") {
    return `${record}${roi ? `, ${roi}` : ""}. ${clv} ${matches}`.replace(/\s+/g, " ").trim();
  }

  if (category === "Schedule Edges") {
    return `${record}${roi ? `, ${roi}` : ""}. ${schedule} ${matches}`.replace(/\s+/g, " ").trim();
  }

  return `${target} is ${record}${roi ? ` with ${roi}` : ""}. ${matches}`;
}

function getPrimaryMetric(card: {
  category: PublishedTrendCategory;
  streak: string | null;
  hitRate: number | null;
  profitUnits: number | null;
  record: string;
  rankingScore: number;
}) {
  if (card.category === "Hottest" && card.streak) {
    return {
      primaryMetricLabel: "STREAK" as const,
      primaryMetricValue: card.streak
    };
  }

  if (card.category === "Highest Win Rate" && typeof card.hitRate === "number") {
    return {
      primaryMetricLabel: "WIN %" as const,
      primaryMetricValue: formatHitRate(card.hitRate)
    };
  }

  if (card.category === "Most Profitable" && typeof card.profitUnits === "number") {
    return {
      primaryMetricLabel: "PROFIT" as const,
      primaryMetricValue: formatProfitUnits(card.profitUnits)
    };
  }

  if (card.category === "Best of Board" || card.category === "Overlooked Angles") {
    return {
      primaryMetricLabel: "EDGE" as const,
      primaryMetricValue: formatEdgeScore(card.rankingScore)
    };
  }

  return {
    primaryMetricLabel: "RECORD" as const,
    primaryMetricValue: card.record
  };
}

function buildWhyNow(card: PublishedTrendCard, context: TrendFeatureSummary) {
  const reasons: string[] = [];

  if (typeof card.profitUnits === "number" && card.profitUnits >= 10) {
    reasons.push(`${card.profitUnits > 0 ? "+" : ""}${card.profitUnits.toFixed(1)}u profit`);
  }

  if (typeof card.roi === "number" && card.roi >= 10) {
    reasons.push(`${card.roi.toFixed(1)}% ROI`);
  }

  if (typeof card.hitRate === "number" && card.hitRate >= 60) {
    reasons.push(`${card.hitRate.toFixed(0)}% hit rate`);
  }

  if (card.streak?.startsWith("W")) {
    reasons.push(`${card.streak} streak`);
  }

  if (card.sampleSize >= 25) {
    reasons.push(`${card.sampleSize} game sample`);
  }

  if (typeof context.averageClv === "number" && context.averageClv > 0) {
    reasons.push(`${context.averageClv > 0 ? "+" : ""}${context.averageClv.toFixed(1)}% avg CLV`);
  }

  if (typeof context.marketTightnessScore === "number" && context.marketTightnessScore >= 60) {
    reasons.push("tight market");
  }

  if (typeof context.bookDisagreementScore === "number" && context.bookDisagreementScore >= 12) {
    reasons.push("book split");
  }

  if (typeof context.restAdvantageDays === "number" && context.restAdvantageDays >= 0.75) {
    reasons.push("rest edge live");
  }

  if (typeof context.revengeRate === "number" && context.revengeRate >= 18) {
    reasons.push("rematch support");
  }

  if (typeof context.consistencyScore === "number" && context.consistencyScore >= 70) {
    reasons.push("stable profile");
  }

  if (card.todayMatches.length > 0) {
    reasons.push(`${card.todayMatches.length} active today`);
  }

  return reasons.slice(0, 3);
}

function buildIntelligenceTags(
  card: Pick<PublishedTrendCard, "marketLabel">,
  context: TrendFeatureSummary
) {
  const tags: string[] = [];

  if (typeof context.averageClv === "number" && context.averageClv > 0) {
    tags.push("CLV-backed");
  }

  if (typeof context.positiveClvRate === "number" && context.positiveClvRate >= 55) {
    tags.push("Beat the close");
  }

  if (typeof context.marketBreadth === "number" && context.marketBreadth >= 3) {
    tags.push("Multi-book");
  }

  if (typeof context.holdQuality === "number" && context.holdQuality >= 55) {
    tags.push("Low-hold");
  }

  if (typeof context.marketTightnessScore === "number" && context.marketTightnessScore >= 60) {
    tags.push("Tight market");
  }

  if (typeof context.restAdvantageDays === "number" && context.restAdvantageDays >= 0.75) {
    tags.push("Schedule edge");
  }

  if (typeof context.revengeRate === "number" && context.revengeRate >= 18) {
    tags.push("Rematch spot");
  }

  if (typeof context.opponentAdjustedMargin === "number" && context.opponentAdjustedMargin > 0.75) {
    tags.push("Opponent-adjusted");
  }

  if (typeof context.consistencyScore === "number" && context.consistencyScore >= 70) {
    tags.push("Consistent");
  }

  if (card.marketLabel === "Spread" && typeof context.atsCoverRate === "number" && context.atsCoverRate >= 56) {
    tags.push("ATS-backed");
  }

  if (card.marketLabel === "Total" && typeof context.totalHitRate === "number" && context.totalHitRate >= 56) {
    tags.push("Totals-backed");
  }

  if (card.marketLabel === "Moneyline" && typeof context.favoriteHitRate === "number" && context.favoriteHitRate >= 56) {
    tags.push("Price-efficient");
  }

  return tags.slice(0, 4);
}

function passesEliteTrendGate(
  card: Pick<PublishedTrendCard, "sampleSize" | "hitRate" | "roi" | "profitUnits" | "streak" | "todayMatches">,
  rankingScore: number,
  context: TrendFeatureSummary
) {
  const streakLength = card.streak?.startsWith("W") ? Number(card.streak.slice(1)) || 0 : 0;
  const baseStrength =
    (typeof card.hitRate === "number" && card.hitRate >= 56) ||
    (typeof card.roi === "number" && card.roi >= 5) ||
    (typeof card.profitUnits === "number" && card.profitUnits >= 5) ||
    streakLength >= 4;
  const marketSupport =
    (typeof context.marketBreadth === "number" && context.marketBreadth >= 2) ||
    (typeof context.positiveClvRate === "number" && context.positiveClvRate >= 54) ||
    (typeof context.holdQuality === "number" && context.holdQuality >= 45);

  return (
    card.sampleSize >= MIN_TREND_SAMPLE_SIZE &&
    rankingScore >= ELITE_TREND_SCORE_FLOOR &&
    baseStrength &&
    marketSupport
  );
}

function isOverlookedTrend(card: PublishedTrendCard, context: TrendFeatureSummary) {
  const quietlyStrong =
    (typeof card.profitUnits === "number" && card.profitUnits >= 8) ||
    (typeof card.hitRate === "number" && card.hitRate >= 61);

  const analyticsSupport =
    (typeof context.positiveClvRate === "number" && context.positiveClvRate >= 55) ||
    (typeof context.bookDisagreementScore === "number" && context.bookDisagreementScore >= 12) ||
    (typeof context.marketTightnessScore === "number" && context.marketTightnessScore >= 60) ||
    (typeof context.restAdvantageDays === "number" && context.restAdvantageDays >= 0.75) ||
    (typeof context.revengeRate === "number" && context.revengeRate >= 18);

  return quietlyStrong && analyticsSupport && card.sampleSize >= 20 && card.todayMatches.length <= 1;
}

function getCanonicalKey(
  result: TrendEngineResult,
  filters: Partial<TrendFilters> | null | undefined,
  _category: PublishedTrendCategory
) {
  const subject = getSubjectLabel(filters);
  return [
    normalizeText(subject || getLeagueLabel(filters)),
    normalizeText(getMarketLabel(result, filters)),
    result.id
  ].join("|");
}

function getRailReason(category: PublishedTrendCategory) {
  switch (category) {
    case "Best of Board":
      return "Highest-ranked, market-backed angles on today’s board.";
    case "Overlooked Angles":
      return "Quietly strong edges with real support that are not flooding the feed.";
    case "Most Profitable":
      return "Historical profit leads this rail.";
    case "Highest Win Rate":
      return "Pure hit-rate quality with real sample support.";
    case "Hottest":
      return "Current streak and form momentum carrying the signal.";
    case "CLV-Backed":
      return "Close-line support separates these angles from empty noise.";
    case "Schedule Edges":
      return "Rest, rematch, and schedule context are doing real work here.";
    case "Favorites":
      return "Favorite pricing angles that still clear the quality gate.";
    case "Underdogs":
      return "Dog-value systems with upset support and cleaner pricing.";
    case "Totals":
      return "Total-market signals with sustainable hit-rate and market support.";
    case "Team Trends":
      return "Team-specific form and role angles that still grade out cleanly.";
    case "Systems":
    default:
      return "Durable betting systems that clear the broader quality floor.";
  }
}

export function packageTrendResult(
  result: TrendEngineResult,
  filters?: Partial<TrendFilters> | null
): PublishedTrendCard {
  const subjectLabel = getSubjectLabel(filters);
  const category = determineTrendCategory(result);
  const record = buildRecord(result);
  const primaryMetric = getPrimaryMetric({
    category,
    streak: result.streak,
    hitRate: result.hitRate,
    profitUnits: result.profitUnits,
    record,
    rankingScore: 0
  });

  return {
    id: `published-${result.id}-${subjectLabel || getLeagueLabel(filters)}`,
    title: subjectLabel ? `${subjectLabel} ${getMarketLabel(result, filters)}` : result.title,
    description: `${subjectLabel || result.title} is ${record} across ${result.dateRange.toLowerCase()}.`,
    category,
    confidence: result.confidence,
    hitRate: result.hitRate,
    roi: result.roi,
    profitUnits: result.profitUnits,
    sampleSize: result.sampleSize,
    record,
    streak: result.streak,
    warning: result.warning,
    href: buildTrendHref(result, filters),
    todayMatches: result.todayMatches,
    sourceTrend: result,
    leagueLabel: getLeagueLabel(filters),
    marketLabel: getMarketLabel(result, filters),
    primaryMetricLabel: primaryMetric.primaryMetricLabel,
    primaryMetricValue: primaryMetric.primaryMetricValue,
    rankingScore: 0,
    whyNow: [],
    intelligenceTags: [],
    overlooked: false,
    railReason: getRailReason(category)
  };
}

async function getDiscoverSubjects(limit = 8) {
  const now = new Date();
  const future = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const events = await prisma.event.findMany({
    where: {
      league: {
        key: {
          in: DISCOVER_LEAGUES
        }
      },
      OR: [{ status: "LIVE" }, { startTime: { gte: now, lte: future } }]
    },
    include: {
      league: { select: { key: true } },
      participants: {
        orderBy: { sortOrder: "asc" },
        include: { competitor: { select: { name: true } } }
      }
    },
    orderBy: [{ status: "asc" }, { startTime: "asc" }],
    take: 10
  });

  const deduped = new Map<string, { league: LeagueKey; subject: string }>();
  for (const event of events) {
    for (const participant of event.participants) {
      const key = `${event.league.key}:${participant.competitor.name.toLowerCase()}`;
      if (!deduped.has(key)) {
        deduped.set(key, {
          league: event.league.key as LeagueKey,
          subject: participant.competitor.name
        });
      }
    }
  }

  return Array.from(deduped.values()).slice(0, limit);
}

function formatStoredTrendCategory(result: StoredTrendRunResult): PublishedTrendCategory {
  if (typeof result.hitRate === "number" && result.hitRate >= 60) {
    return "Highest Win Rate";
  }

  if (typeof result.roi === "number" && result.roi >= 5) {
    return "Most Profitable";
  }

  return "Systems";
}

function buildStoredTrendRecord(result: StoredTrendRunResult) {
  const sampleSize = Math.max(MIN_TREND_SAMPLE_SIZE, Number(result.sampleSize ?? 0));
  const wins =
    typeof result.hitRate === "number" ? Math.round((result.hitRate / 100) * sampleSize) : 0;
  const losses = Math.max(sampleSize - wins, 0);
  return `${wins}-${losses}-0`;
}

function buildStoredTrendCard(
  run: Awaited<ReturnType<typeof prisma.trendRun.findMany>>[number] & {
    savedTrend: {
      id: string;
      name: string;
      sport: string;
    } | null;
  }
): PublishedTrendCard | null {
  const result = (run.resultJson ?? {}) as StoredTrendRunResult;
  const query = (run.queryJson ?? {}) as Record<string, unknown>;
  const sampleSize = Number(result.sampleSize ?? 0);

  if (sampleSize < MIN_TREND_SAMPLE_SIZE || !run.savedTrend) {
    return null;
  }

  const category = formatStoredTrendCategory(result);
  const leagueLabel =
    typeof query.league === "string" && query.league.trim()
      ? query.league.trim().toUpperCase()
      : run.savedTrend.sport.replace(/_/g, " ");
  const marketLabel =
    typeof query.market === "string" && query.market.trim()
      ? query.market.trim()
      : typeof query.side === "string" && query.side.trim()
        ? `${query.side} system`
        : "System";
  const hitRate = typeof result.hitRate === "number" ? result.hitRate : null;
  const roi = typeof result.roi === "number" ? result.roi : null;
  const profitUnits =
    typeof roi === "number" ? Number(((roi / 100) * sampleSize).toFixed(1)) : null;
  const record = buildStoredTrendRecord(result);
  const primaryMetric =
    typeof profitUnits === "number" && profitUnits >= 5
      ? { primaryMetricLabel: "PROFIT" as const, primaryMetricValue: formatProfitUnits(profitUnits) }
      : typeof hitRate === "number"
        ? { primaryMetricLabel: "WIN %" as const, primaryMetricValue: formatHitRate(hitRate) }
        : { primaryMetricLabel: "RECORD" as const, primaryMetricValue: record };

  return {
    id: `stored-${run.id}`,
    title: run.savedTrend.name,
    description: `Stored ${leagueLabel} system with ${sampleSize} tracked games${typeof result.averageMargin === "number" ? ` and ${result.averageMargin.toFixed(1)} average margin` : ""}.`,
    category,
    confidence: sampleSize >= 100 ? "strong" : sampleSize >= 30 ? "moderate" : "weak",
    hitRate,
    roi,
    profitUnits,
    sampleSize,
    record,
    streak: null,
    warning: null,
    href: `/trends?league=${encodeURIComponent(leagueLabel)}&sample=${MIN_TREND_SAMPLE_SIZE}`,
    todayMatches: [],
    sourceTrend: {
      id: `stored-${run.id}`,
      title: run.savedTrend.name,
      hitRate,
      roi,
      profitUnits,
      sampleSize,
      wins: 0,
      losses: 0,
      pushes: 0,
      streak: null,
      confidence: sampleSize >= 100 ? "strong" : sampleSize >= 30 ? "moderate" : "weak",
      warning: null,
      dateRange: "Stored historical run",
      contextLabel: run.savedTrend.name,
      todayMatches: [],
      extra: {
        savedTrendId: run.savedTrend.id
      }
    },
    leagueLabel,
    marketLabel,
    primaryMetricLabel: primaryMetric.primaryMetricLabel,
    primaryMetricValue: primaryMetric.primaryMetricValue,
    rankingScore: Math.round(sampleSize * 2 + (hitRate ?? 0) * 4 + (roi ?? 0) * 6),
    whyNow: [
      `${sampleSize} tracked games`,
      ...(typeof roi === "number" ? [`${roi > 0 ? "+" : ""}${roi.toFixed(1)}% ROI`] : []),
      ...(typeof hitRate === "number" ? [`${hitRate.toFixed(0)}% hit rate`] : [])
    ].slice(0, 3),
    intelligenceTags: ["Stored system"],
    overlooked: false,
    railReason: getRailReason(category)
  } satisfies PublishedTrendCard;
}

async function getStoredTrendRunFallback(): Promise<PublishedTrendCard[]> {
  const runs = await prisma.trendRun.findMany({
    where: {
      savedTrendId: {
        not: null
      }
    },
    include: {
      savedTrend: {
        select: {
          id: true,
          name: true,
          sport: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 24
  });

  return runs
    .map((run) => buildStoredTrendCard(run))
    .filter((card): card is PublishedTrendCard => card !== null)
    .sort((left, right) => right.rankingScore - left.rankingScore);
}

function diversifyCards(cards: PublishedCandidate[], limit: number) {
  const selected: PublishedCandidate[] = [];
  const subjectCounts = new Map<string, number>();
  const marketCounts = new Map<string, number>();
  const leagueCounts = new Map<string, number>();

  for (const card of cards) {
    if (selected.length >= limit) break;

    const subjectKey = normalizeText(card.title.split(" ").slice(0, 2).join(" "));
    const marketKey = normalizeText(card.marketLabel);
    const leagueKey = normalizeText(card.leagueLabel);
    const subjectCount = subjectCounts.get(subjectKey) ?? 0;
    const marketCount = marketCounts.get(marketKey) ?? 0;
    const leagueCount = leagueCounts.get(leagueKey) ?? 0;

    if (
      (subjectCount >= 1 || leagueCount >= 2) &&
      marketCount >= 1 &&
      card.rankingScore < FEATURED_TREND_SCORE_FLOOR + 110
    ) {
      continue;
    }

    selected.push(card);
    subjectCounts.set(subjectKey, subjectCount + 1);
    marketCounts.set(marketKey, marketCount + 1);
    leagueCounts.set(leagueKey, leagueCount + 1);
  }

  return selected;
}

function dedupeCandidates(cards: PublishedCandidate[]) {
  return Array.from(
    new Map(
      cards
        .sort((left, right) => right.rankingScore - left.rankingScore)
        .map((card) => [card.canonicalKey, card] as const)
    ).values()
  );
}

function buildSections(cards: PublishedCandidate[]): PublishedTrendSection[] {
  const sections: PublishedTrendSection[] = [];
  const bestOfBoard = diversifyCards(
    cards.filter((card) => card.rankingScore >= FEATURED_TREND_SCORE_FLOOR),
    4
  );
  const reservedIds = new Set(bestOfBoard.map((card) => card.id));
  if (bestOfBoard.length) {
    sections.push({
      category: "Best of Board",
      cards: bestOfBoard.map(({ analysis, canonicalKey, ...card }) => card)
    });
  }

  const overlooked = cards
    .filter((card) => card.overlooked && !reservedIds.has(card.id))
    .slice(0, 6);
  for (const card of overlooked) {
    reservedIds.add(card.id);
  }
  if (overlooked.length) {
    sections.push({
      category: "Overlooked Angles",
      cards: overlooked.map(({ analysis, canonicalKey, ...card }) => ({
        ...card,
        category: "Overlooked Angles"
      }))
    });
  }

  for (const category of CATEGORY_ORDER) {
    if (category === "Best of Board" || category === "Overlooked Angles") continue;
    const railCards = cards
      .filter((card) => card.category === category && !reservedIds.has(card.id))
      .slice(0, 6)
      .map(({ analysis, canonicalKey, ...card }) => card);
    if (railCards.length >= 2 || (railCards.length === 1 && category === "Systems")) {
      sections.push({ category, cards: railCards });
    }
  }

  return sections;
}

export async function getPublishedTrendCards(
  filters?: Partial<TrendFilters> | null,
  options?: {
    limit?: number;
  }
) {
  const subjectLabel = getSubjectLabel(filters);
  const candidates = await Promise.all([
    getATSTrend(filters),
    getOUTrend(filters),
    getFavoriteROI(filters),
    getUnderdogROI(filters),
    ...(subjectLabel ? [getRecentForm(subjectLabel, filters?.sport ?? "ALL", filters)] : [])
  ]);

  const scored = await Promise.all(
    candidates
      .map((candidate) => candidate.value)
      .filter((result) => result.sampleSize >= MIN_TREND_SAMPLE_SIZE)
      .map(async (result) => {
        const analysis = await scoreTrendResult(result, filters);
        const subject = getSubjectLabel(filters);
        const category = categoryFromAnalysis(result, analysis.context);
        const title = buildTrendTitle(result, subject, analysis.context);
        const record = buildRecord(result);
        const baseCard = packageTrendResult(result, filters);
        const primaryMetric = getPrimaryMetric({
          category,
          streak: result.streak,
          hitRate: result.hitRate,
          profitUnits: result.profitUnits,
          record,
          rankingScore: analysis.total
        });
        const card: PublishedTrendCard = {
          ...baseCard,
          title,
          description: buildTrendDescription(result, subject, category, analysis.context),
          category,
          primaryMetricLabel: primaryMetric.primaryMetricLabel,
          primaryMetricValue: primaryMetric.primaryMetricValue,
          rankingScore: analysis.total,
          whyNow: buildWhyNow(baseCard, analysis.context),
          intelligenceTags: buildIntelligenceTags(baseCard, analysis.context),
          overlooked: false,
          railReason: getRailReason(category)
        };
        const overlooked = isOverlookedTrend(card, analysis.context);
        return {
          ...card,
          overlooked,
          analysis,
          canonicalKey: getCanonicalKey(result, filters, category)
        } satisfies PublishedCandidate;
      })
  );

  const eliteCards = dedupeCandidates(
    scored
      .filter(({ analysis, ...card }) => passesEliteTrendGate(card, card.rankingScore, analysis.context))
      .map((card) => ({
        ...card,
        intelligenceTags: card.intelligenceTags.slice(0, 4),
        whyNow: card.whyNow.slice(0, 3)
      }))
  );

  const fallbackCards = dedupeCandidates(
    scored.filter(
      (card) =>
        card.sampleSize >= MIN_TREND_SAMPLE_SIZE &&
        ((typeof card.hitRate === "number" && card.hitRate >= 54) ||
          (typeof card.roi === "number" && card.roi >= 2) ||
          (typeof card.profitUnits === "number" && card.profitUnits >= 2) ||
          Boolean(card.streak?.startsWith("W")))
    )
  );

  return (eliteCards.length ? eliteCards : fallbackCards)
    .slice(0, options?.limit ?? 4)
    .map(({ analysis, canonicalKey, ...card }) => card);
}

export async function getPublishedTrendSections(filters?: Partial<TrendFilters> | null) {
  const hasFocusedQuery = Boolean(
    filters?.team ||
      filters?.subject ||
      filters?.player ||
      filters?.fighter ||
      (filters?.league && filters.league !== "ALL") ||
      (filters?.sport && filters.sport !== "ALL") ||
      (filters?.market && filters.market !== "ALL")
  );

  const focusedCards = hasFocusedQuery ? await getPublishedTrendCards(filters, { limit: 12 }) : [];
  if (focusedCards.length) {
    return buildSections(
      focusedCards.map((card) => ({
        ...card,
        analysis: {
          total: card.rankingScore,
          breakdown: {} as never,
          context: {} as never
        },
        canonicalKey: `${card.category}|${card.title}|${card.leagueLabel}|${card.marketLabel}`
      }))
    );
  }

  const leagueCards = (
    await Promise.all(
      DISCOVER_LEAGUES.map((league) =>
        getPublishedTrendCards(
          {
            league,
            window: "365d",
            sample: MIN_TREND_SAMPLE_SIZE
          },
          { limit: 4 }
        )
      )
    )
  ).flat();

  const discoverSubjects = await getDiscoverSubjects();
  const subjectCards = (
    await Promise.all(
      discoverSubjects.map(({ league, subject }) =>
        getPublishedTrendCards(
          {
            league,
            team: subject,
            subject,
            window: "365d",
            sample: MIN_TREND_SAMPLE_SIZE
          },
          { limit: 4 }
        )
      )
    )
  ).flat();

  const cards = dedupeCandidates(
    [...leagueCards, ...subjectCards].map((card) => ({
      ...card,
      analysis: {
        total: card.rankingScore,
        breakdown: {} as never,
        context: {} as never
      },
      canonicalKey: `${card.category}|${card.title}|${card.leagueLabel}|${card.marketLabel}`
    }))
  );

  if (!cards.length) {
    const storedFallback = await getStoredTrendRunFallback();
    if (storedFallback.length) {
      return buildSections(
        storedFallback.map((card) => ({
          ...card,
          analysis: {
            total: card.rankingScore,
            breakdown: {} as never,
            context: {} as never
          },
          canonicalKey: `${card.category}|${card.title}|${card.leagueLabel}|${card.marketLabel}`
        }))
      );
    }
  }

  return buildSections(cards);
}

export async function getPublishedTrendFeed(filters?: Partial<TrendFilters> | null) {
  const sections = await getPublishedTrendSections(filters);
  const cards = sections.flatMap((section) => section.cards);

  return {
    sections,
    featured: sections.find((section) => section.category === "Best of Board")?.cards ?? cards.slice(0, 4),
    overlooked: sections.find((section) => section.category === "Overlooked Angles")?.cards ?? [],
    meta: {
      count: cards.length,
      sampleWarning: cards.find((card) => card.warning)?.warning ?? null
    }
  };
}
