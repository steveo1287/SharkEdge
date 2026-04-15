import {
  getPublishedTrendFeed,
  type PublishedTrendCard,
  type PublishedTrendSection
} from "@/lib/trends/publisher";
import type { TrendFilters } from "@/lib/types/domain";
import { trendFiltersSchema } from "@/lib/validation/filters";
import { getBoardCommandData } from "@/services/board/board-command-service";
import { getLeagueSnapshots } from "@/services/stats/stats-service";
import { TrendCommandCenter } from "@/components/trends/trend-command-center";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readValue(
  searchParams: Record<string, string | string[] | undefined>,
  key: keyof TrendFilters
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function buildFilters(searchParams: Record<string, string | string[] | undefined>) {
  try {
    return trendFiltersSchema.parse({
      sport: readValue(searchParams, "sport"),
      league: readValue(searchParams, "league"),
      market: readValue(searchParams, "market"),
      sportsbook: readValue(searchParams, "sportsbook"),
      side: readValue(searchParams, "side"),
      subject: readValue(searchParams, "subject"),
      team: readValue(searchParams, "team"),
      player: readValue(searchParams, "player"),
      fighter: readValue(searchParams, "fighter"),
      opponent: readValue(searchParams, "opponent"),
      window: readValue(searchParams, "window"),
      sample: readValue(searchParams, "sample")
    });
  } catch {
    return trendFiltersSchema.parse({});
  }
}

function isValidTrendCard(card: unknown): card is PublishedTrendCard {
  if (!card || typeof card !== "object") return false;
  const value = card as Partial<PublishedTrendCard>;

  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.href === "string" &&
    typeof value.leagueLabel === "string" &&
    typeof value.marketLabel === "string" &&
    typeof value.confidence === "string" &&
    typeof value.record === "string" &&
    value.sourceTrend != null &&
    typeof value.sourceTrend === "object" &&
    typeof value.sourceTrend.id === "string" &&
    Array.isArray(value.todayMatches)
  );
}

function isValidTrendSection(section: unknown): section is PublishedTrendSection {
  if (!section || typeof section !== "object") return false;
  const value = section as Partial<PublishedTrendSection>;
  return typeof value.category === "string" && Array.isArray(value.cards);
}

async function getSafeTrendFeed(filters: TrendFilters) {
  try {
    const feed = await getPublishedTrendFeed(filters);

    const featured = Array.isArray(feed?.featured)
      ? feed.featured.filter(isValidTrendCard).slice(0, 6)
      : [];

    const sections = Array.isArray(feed?.sections)
      ? feed.sections
          .filter(isValidTrendSection)
          .map((section) => ({
            ...section,
            cards: section.cards.filter(isValidTrendCard).slice(0, 8)
          }))
          .filter((section) => section.cards.length > 0)
      : [];

    return {
      featured,
      sections,
      meta:
        feed && typeof feed === "object" && "meta" in feed && feed.meta && typeof feed.meta === "object"
          ? feed.meta
          : undefined
    };
  } catch {
    return { featured: [] as PublishedTrendCard[], sections: [] as PublishedTrendSection[], meta: undefined };
  }
}

async function getSafeBoardCount(league: TrendFilters["league"]) {
  try {
    const board = await getBoardCommandData({
      league: league === "ALL" ? "ALL" : league,
      date: "today"
    });
    return board.verifiedGames.length;
  } catch {
    return 0;
  }
}

async function getSafeSnapshots(league: TrendFilters["league"]) {
  try {
    return await getLeagueSnapshots(league === "ALL" ? "ALL" : league);
  } catch {
    return [];
  }
}

export default async function TrendsPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const filters = buildFilters(resolved);

  const [feed, boardGameCount, snapshots] = await Promise.all([
    getSafeTrendFeed(filters),
    getSafeBoardCount(filters.league),
    getSafeSnapshots(filters.league)
  ]);

  const activeSystems =
    typeof feed.meta === "object" && feed.meta && "activeSystems" in feed.meta && typeof feed.meta.activeSystems === "number"
      ? feed.meta.activeSystems
      : feed.sections.flatMap((section) => section.cards).filter((card) => card.todayMatches.length > 0).length;

  return (
    <TrendCommandCenter
      filters={filters}
      featured={feed.featured}
      sections={feed.sections}
      activeSystems={activeSystems}
      boardGameCount={boardGameCount}
      snapshots={snapshots}
    />
  );
}
