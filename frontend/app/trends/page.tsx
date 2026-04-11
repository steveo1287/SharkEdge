import Link from "next/link";

import { MobileTrendCard } from "@/components/home/mobile-trend-card";
import { MobileTopBar } from "@/components/mobile/mobile-top-bar";
import { SectionTabs } from "@/components/mobile/section-tabs";
import { getPublishedTrendFeed, type PublishedTrendCard } from "@/lib/trends/publisher";
import type { TrendFilters } from "@/lib/types/domain";
import { trendFiltersSchema } from "@/lib/validation/filters";

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
  return query ? `/trends/${encodeURIComponent(card.sourceTrend.id)}?${query}` : `/trends/${encodeURIComponent(card.sourceTrend.id)}`;
}

export default async function TrendsPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const filters = buildFilters(resolved);
  const feed = await getPublishedTrendFeed(filters);
  const sections = feed.sections.filter((section) => section.cards.length > 0);
  const cards = sections.flatMap((section) => section.cards);

  return (
    <div className="grid gap-4">
      <MobileTopBar title="My Trends" subtitle="Discover" />

      <section className="mobile-surface !pb-2">
        <SectionTabs items={[{ label: "For You", active: true }, { label: "Search" }]} />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <select name="league" defaultValue={filters.league} className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white">
            <option value="ALL">All leagues</option>
            <option value="NBA">NBA</option>
            <option value="NCAAB">NCAAB</option>
            <option value="MLB">MLB</option>
            <option value="NHL">NHL</option>
            <option value="NFL">NFL</option>
          </select>
          <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-slate-400">
            {cards.length} systems live
          </div>
        </div>
      </section>

      {feed.featured.length ? (
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-[1.4rem] font-semibold text-white">Hottest</div>
            <Link href="/trends" className="text-sm text-slate-500">Open</Link>
          </div>
          <div className="mobile-scroll-row hide-scrollbar">
            {feed.featured.slice(0, 5).map((card) => (
              <MobileTrendCard key={card.id} card={{ ...card, href: buildTrendDetailHref(card, filters) }} featured={card.id === feed.featured[0]?.id} />
            ))}
          </div>
        </section>
      ) : null}

      {sections.map((section) => (
        <section key={section.category}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-[1.4rem] font-semibold text-white">{section.category}</div>
            <Link href="/trends" className="text-sm text-slate-500">Open</Link>
          </div>
          <div className="mobile-scroll-row hide-scrollbar">
            {section.cards.slice(0, 6).map((card) => (
              <MobileTrendCard key={card.id} card={{ ...card, href: buildTrendDetailHref(card, filters) }} />
            ))}
          </div>
        </section>
      ))}

      {!sections.length ? (
        <div className="mobile-surface text-sm leading-6 text-slate-400">
          No trend systems matched this scope yet. SharkEdge is staying selective instead of stuffing the feed with weak systems.
        </div>
      ) : null}
    </div>
  );
}
