import Link from "next/link";

import { LeaguePulseRail } from "@/components/intelligence/league-pulse-rail";
import { LiveTrendRadar } from "@/components/trends/live-trend-radar";
import {
  getPublishedTrendFeed,
  type PublishedTrendCard,
  type PublishedTrendSection
} from "@/lib/trends/publisher";
import type { TrendFilters } from "@/lib/types/domain";
import { trendFiltersSchema } from "@/lib/validation/filters";
import { getBoardCommandData } from "@/services/board/board-command-service";
import { getLeagueSnapshots } from "@/services/stats/stats-service";

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

function readValue(searchParams: Record<string, string | string[] | undefined>, key: keyof TrendFilters) {
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

async function getSafeTrendFeed(filters: TrendFilters): Promise<SafeTrendFeed> {
  try {
    const feed = await getPublishedTrendFeed(filters);
    return {
      featured: Array.isArray(feed?.featured) ? feed.featured.slice(0, 6) : [],
      sections: Array.isArray(feed?.sections) ? feed.sections.filter((section) => section.cards.length).slice(0, 6) : [],
      meta: feed?.meta
    };
  } catch {
    return { featured: [], sections: [] };
  }
}

export default async function TrendsPage({ searchParams }: PageProps) {
  const resolvedSearch = (await searchParams) ?? {};
  const filters = buildFilters(resolvedSearch);
  const [feed, board, snapshots] = await Promise.all([
    getSafeTrendFeed(filters),
    getBoardCommandData({ league: filters.league, date: "today" }),
    getLeagueSnapshots(filters.league)
  ]);

  return (
    <div className="grid gap-6 xl:gap-8">
      <section className="surface-panel-strong p-5 md:p-7">
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr] xl:items-end">
          <div>
            <div className="text-[0.68rem] uppercase tracking-[0.26em] text-sky-200">Trend command</div>
            <h1 className="mt-3 text-[2rem] font-semibold tracking-tight text-white md:text-[3rem] md:leading-[1.02]">
              Trends should sit next to prices, not in a dead-end library.
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300 md:text-base">
              This page is built to feel like a sharp desk: live slate context on one side, filtered historical conviction on the other, with enough explanation to trust the card.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="metric-tile">
              <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">Featured</div>
              <div className="mt-2 text-3xl font-semibold text-white">{feed.featured.length}</div>
            </div>
            <div className="metric-tile">
              <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">Active systems</div>
              <div className="mt-2 text-3xl font-semibold text-white">{feed.meta?.activeSystems ?? 0}</div>
            </div>
            <div className="metric-tile">
              <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">Live games</div>
              <div className="mt-2 text-3xl font-semibold text-white">{board.verifiedGames.length}</div>
            </div>
          </div>
        </div>
      </section>

      <LeaguePulseRail snapshots={snapshots} />

      <section className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)] xl:items-start">
        <aside className="grid gap-4 xl:sticky xl:top-6">
          <LiveTrendRadar featured={feed.featured} verifiedGames={board.verifiedGames} />
        </aside>

        <div className="grid gap-4">
          {feed.sections.length ? feed.sections.map((section) => (
            <section key={section.category} className="surface-panel p-4 md:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">Section</div>
                  <h2 className="mt-1 text-2xl font-semibold text-white">{section.category}</h2>
                </div>
                <Link href="/board" className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-200 transition hover:border-sky-400/20">
                  Open board
                </Link>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {section.cards.map((card) => (
                  <article key={card.id} className="rounded-[1.35rem] border border-white/8 bg-slate-950/45 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">{card.leagueLabel} · {card.marketLabel}</div>
                      <div className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-200">{card.confidence}</div>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold text-white">{card.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{card.description}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                      <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1">{card.record}</span>
                      <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1">ROI {typeof card.roi === "number" ? `${card.roi.toFixed(1)}%` : "—"}</span>
                      <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1">Hit {typeof card.hitRate === "number" ? `${card.hitRate.toFixed(0)}%` : "—"}</span>
                      <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1">Sample {card.sampleSize}</span>
                    </div>
                    <div className="mt-4 grid gap-2">
                      {card.whyNow.slice(0, 3).map((reason) => (
                        <div key={reason} className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-sm leading-6 text-slate-300">
                          {reason}
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap gap-2">
                        {card.intelligenceTags.slice(0, 3).map((tag) => (
                          <span key={tag} className="rounded-full border border-sky-400/15 bg-sky-400/10 px-2.5 py-1 text-[0.68rem] text-sky-100">{tag}</span>
                        ))}
                      </div>
                      <Link href={card.href} className="text-sm font-semibold text-sky-300 transition hover:text-sky-200">Open trend →</Link>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )) : (
            <section className="surface-panel p-5 text-sm leading-7 text-slate-300">
              No trend cards survived the current filters. Keep the live board open and widen the league or sample window.
            </section>
          )}
        </div>
      </section>
    </div>
  );
}
