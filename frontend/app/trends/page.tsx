import Link from "next/link";

import { MobileTrendCard } from "@/components/home/mobile-trend-card";
import { MobileTopBar } from "@/components/mobile/mobile-top-bar";
import { SectionTabs } from "@/components/mobile/section-tabs";
import {
  getPublishedTrendFeed,
  type PublishedTrendCard,
  type PublishedTrendSection
} from "@/lib/trends/publisher";
import type { TrendFilters } from "@/lib/types/domain";
import { trendFiltersSchema } from "@/lib/validation/filters";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type SafeTrendFeed = {
  featured: PublishedTrendCard[];
  sections: PublishedTrendSection[];
  meta?: {
    activeSystems?: number;
    count?: number;
    sampleWarning?: string | null;
  };
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
  if (!card || typeof card !== "object") {
    return false;
  }

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
  if (!section || typeof section !== "object") {
    return false;
  }

  const value = section as Partial<PublishedTrendSection>;
  return typeof value.category === "string" && Array.isArray(value.cards);
}

async function getSafeTrendFeed(filters: TrendFilters): Promise<SafeTrendFeed> {
  try {
    const feed = await getPublishedTrendFeed(filters);

    const featured = Array.isArray(feed?.featured)
      ? feed.featured.filter(isValidTrendCard).slice(0, 5)
      : [];

    const sections = Array.isArray(feed?.sections)
      ? feed.sections
          .filter(isValidTrendSection)
          .map((section) => ({
            ...section,
            cards: section.cards.filter(isValidTrendCard).slice(0, 6)
          }))
          .filter((section) => section.cards.length > 0)
      : [];

    return {
      featured,
      sections,
      meta:
        feed && typeof feed === "object" && "meta" in feed && feed.meta && typeof feed.meta === "object"
          ? (feed.meta as SafeTrendFeed["meta"])
          : undefined
    };
  } catch {
    return { featured: [], sections: [] };
  }
}

function buildTrendDetailHref(card: PublishedTrendCard, filters: TrendFilters) {
  const params = new URLSearchParams();

  if (filters.sport !== "ALL") params.set("sport", filters.sport);
  if (filters.league !== "ALL") params.set("league", filters.league);
  if (filters.market !== "ALL") params.set("market", filters.market);
  if (filters.sportsbook !== "all") params.set("sportsbook", filters.sportsbook);
  if (filters.side !== "ALL") params.set("side", filters.side);
  if (filters.subject) params.set("subject", filters.subject);
  if (filters.team) params.set("team", filters.team);
  if (filters.player) params.set("player", filters.player);
  if (filters.fighter) params.set("fighter", filters.fighter);
  if (filters.opponent) params.set("opponent", filters.opponent);
  if (filters.window) params.set("window", filters.window);
  if (filters.sample) params.set("sample", String(filters.sample));

  const query = params.toString();
  const basePath = `/trends/${encodeURIComponent(card.sourceTrend.id)}`;

  return query ? `${basePath}?${query}` : basePath;
}

export default async function TrendsPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const filters = buildFilters(resolved);
  const feed = await getSafeTrendFeed(filters);
  const sections = feed.sections;
  const cards = sections.flatMap((section) => section.cards);
  const activeSystems =
    typeof feed.meta?.activeSystems === "number"
      ? feed.meta.activeSystems
      : cards.filter((card) => card.todayMatches.length > 0).length;
  const livePricedCards = cards.filter((card) => typeof card.liveEdgePct === "number");
  const bestLiveEdge = livePricedCards.length
    ? Math.max(...livePricedCards.map((card) => card.liveEdgePct ?? -999))
    : null;

  return (
    <div className="grid gap-4">
      <MobileTopBar title="My Trends" subtitle="Discover" />

      <section className="mobile-surface !pb-2">
        <SectionTabs
          items={[
            { label: "For You", active: true },
            { label: "Search" }
          ]}
        />

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white">
            {filters.league === "ALL" ? "All leagues" : filters.league}
          </div>
          <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-slate-400">
            {activeSystems} active · {cards.length} tracked
          </div>
          <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-slate-400">
            {livePricedCards.length} priced now
          </div>
          <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white">
            {typeof bestLiveEdge === "number" ? `${bestLiveEdge > 0 ? "+" : ""}${bestLiveEdge.toFixed(1)}% best edge` : "No priced edge"}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">
          {[
            filters.market === "ALL" ? "All markets" : filters.market.replace(/_/g, " "),
            filters.window ?? "365d",
            filters.sportsbook === "all" ? "All books" : filters.sportsbook
          ].map((item, index) => (
            <div
              key={item}
              className={
                index === 0
                  ? "rounded-full bg-white px-3 py-1 text-slate-950"
                  : "rounded-full border border-white/8 px-3 py-1"
              }
            >
              {item}
            </div>
          ))}
        </div>
      </section>

      {feed.featured.length ? (
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-[1.4rem] font-semibold text-white">Hottest</div>
            <Link href="/trends" className="text-sm text-slate-500">
              Open
            </Link>
          </div>

          <div className="mobile-scroll-row hide-scrollbar">
            {feed.featured.map((card, index) => (
              <MobileTrendCard
                key={card.id}
                card={{
                  ...card,
                  href: buildTrendDetailHref(card, filters)
                }}
                featured={index === 0}
              />
            ))}
          </div>
        </section>
      ) : null}

      {sections.map((section) => (
        <section key={section.category}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-[1.4rem] font-semibold text-white">
              {section.category}
            </div>
            <Link href="/trends" className="text-sm text-slate-500">
              Open
            </Link>
          </div>

          <div className="mobile-scroll-row hide-scrollbar">
            {section.cards.map((card) => (
              <MobileTrendCard
                key={card.id}
                card={{
                  ...card,
                  href: buildTrendDetailHref(card, filters)
                }}
              />
            ))}
          </div>
        </section>
      ))}

      {!sections.length ? (
        <div className="mobile-surface text-sm leading-6 text-slate-400">
          No trend systems matched this scope yet. SharkEdge is staying selective
          instead of stuffing the feed with weak systems.
        </div>
      ) : null}
    </div>
  );
}
