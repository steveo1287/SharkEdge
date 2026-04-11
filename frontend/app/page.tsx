import Link from "next/link";

import { SharkLogoLockup } from "@/components/branding/shark-logo-lockup";
import { LiveEdgeBoardCard } from "@/components/board/live-edge-board-card";
import { MobileTrendCard } from "@/components/home/mobile-trend-card";
import { HorizontalEventRail } from "@/components/mobile/horizontal-event-rail";
import { SectionTabs } from "@/components/mobile/section-tabs";
import { getPublishedTrendFeed } from "@/lib/trends/publisher";
import { getHomeCommandData } from "@/services/home/home-command-service";
import { listDiscoveredTrendSystems } from "@/services/trends/discovered-systems";

export const dynamic = "force-dynamic";

type DiscoveredTrendCard = Awaited<ReturnType<typeof listDiscoveredTrendSystems>>[number];

type HomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const resolvedSearch = (await searchParams) ?? {};
  const home = await getHomeCommandData(resolvedSearch);
  const focusLeague = home.focusedLeague;
  const [trendFeed, discovered] = await Promise.all([
    getPublishedTrendFeed({ league: focusLeague, window: "365d", sample: 5 }),
    listDiscoveredTrendSystems({ league: focusLeague, limit: 8, activeOnly: true })
  ]);

  const feedSections = trendFeed.sections.filter((section) => section.cards.length > 0).slice(0, 4);
  const featured = trendFeed.featured[0] ?? feedSections[0]?.cards[0] ?? null;
  const railItems = home.verifiedGames.slice(0, 8).map((game, index) => ({
    id: game.id,
    label: `${game.awayTeam.abbreviation} ${game.homeTeam.abbreviation}`,
    note: new Date(game.startTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    href: game.detailHref ?? `/game/${game.id}`,
    active: index === 0
  }));

  return (
    <div className="grid gap-4">
      <section className="mobile-surface">
        <div className="flex items-start justify-between gap-4">
          <div>
            <SharkLogoLockup subtitle="Premium market intelligence" />
            <div className="mt-4 text-sm text-slate-400">Welcome back</div>
            <h1 className="mt-1 text-[2.15rem] font-black tracking-tight text-white">Find the sharpest edge.</h1>
            <p className="mt-2 max-w-[28ch] text-sm leading-6 text-slate-400">
              Live board movement, trend systems, and game pressure in one product-first desk.
            </p>
          </div>
          <Link href="/alerts" className="mobile-icon-button" aria-label="Open alerts">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
              <path d="M12 4a4 4 0 00-4 4v2.4c0 .7-.2 1.38-.56 1.97L6 15h12l-1.44-2.63A3.97 3.97 0 0116 10.4V8a4 4 0 00-4-4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M10 18a2 2 0 004 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </Link>
        </div>

        <div className="mt-5">
          <SectionTabs
            items={[
              { label: "For You", active: true },
              { label: "Search" }
            ]}
          />
        </div>

        {railItems.length ? (
          <div className="mt-4">
            <HorizontalEventRail items={railItems} />
          </div>
        ) : null}
      </section>

      {featured ? (
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-[1.45rem] font-semibold text-white">Featured Signal</div>
            <Link href="/trends" className="text-sm text-slate-500">
              See all
            </Link>
          </div>
          <div className="mobile-scroll-row hide-scrollbar">
            <MobileTrendCard card={featured} featured />
            {trendFeed.featured.slice(1, 3).map((card) => (
              <MobileTrendCard key={card.id} card={card} />
            ))}
          </div>
        </section>
      ) : null}

      {feedSections.map((section) => (
        <section key={section.category}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-[1.45rem] font-semibold text-white">{section.category}</div>
            <Link href="/trends" className="text-sm text-slate-500">
              Open
            </Link>
          </div>
          <div className="mobile-scroll-row hide-scrollbar">
            {section.cards.slice(0, 5).map((card) => (
              <MobileTrendCard key={card.id} card={card} />
            ))}
          </div>
        </section>
      ))}

      {discovered.length ? (
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-[1.45rem] font-semibold text-white">Community Plays</div>
            <Link href="/trends" className="text-sm text-slate-500">
              Open
            </Link>
          </div>
          <div className="mobile-scroll-row hide-scrollbar">
            {discovered.slice(0, 6).map((system: DiscoveredTrendCard) => (
              <Link key={system.id} href={`/trends/${system.slug}`} className="mobile-trend-card min-w-[218px] max-w-[218px]">
                <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                  <div className="truncate">{system.league} · {system.marketType.replace(/_/g, " ")}</div>
                  <div className="rounded-full border border-white/8 px-2 py-0.5 text-[9px]">{system.tier}</div>
                </div>
                <div className="mt-3 line-clamp-3 min-h-[60px] text-[1.02rem] font-semibold leading-5 text-white">
                  {system.name}
                </div>
                <div className="mt-4 text-[2.25rem] font-black leading-none text-[#2dd36f]">
                  {typeof system.totalProfit === "number" ? `${system.totalProfit.toFixed(1)}u` : `${system.wins}-${system.losses}-${system.pushes}`}
                </div>
                <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-slate-500">
                  {typeof system.totalProfit === "number" ? "Profit" : "Record"}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/6 pt-3">
                  <div>
                    <div className="text-[1rem] font-semibold text-[#2dd36f]">{system.wins}-{system.losses}-{system.pushes}</div>
                    <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Record</div>
                  </div>
                  <div>
                    <div className="text-[1rem] font-semibold text-[#2dd36f]">{typeof system.hitRate === "number" ? `${system.hitRate.toFixed(1)}%` : "--"}</div>
                    <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Win %</div>
                  </div>
                  <div>
                    <div className="text-[1rem] font-semibold text-[#2dd36f]">{typeof system.roi === "number" ? `${system.roi.toFixed(1)}%` : "--"}</div>
                    <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">ROI</div>
                  </div>
                </div>
                <div className="mt-4 space-y-2 text-[11px]">
                  <div className="flex items-center gap-2 text-[#2dd36f]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#2dd36f]" />
                    <span>
                      {system.activations.filter((item: DiscoveredTrendCard["activations"][number]) => item.isActive).length || 1} active game
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[#ff9b3f]">
                    <span className="text-[12px]">HOT</span>
                    <span>{system.sampleSize} sample size</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-[1.45rem] font-semibold text-white">LiveEdge Board</div>
          <Link href="/board" className="text-sm text-slate-500">
            Open board
          </Link>
        </div>
        <div className="grid gap-3">
          {home.verifiedGames.slice(0, 4).map((game) => (
            <LiveEdgeBoardCard key={game.id} game={game} />
          ))}
          {!home.verifiedGames.length ? (
            <div className="mobile-surface text-sm leading-6 text-slate-400">
              {home.liveDeskMessage ?? "Verified live rows are thin right now, so the board stays quiet instead of faking depth."}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
