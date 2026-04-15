import Link from "next/link";

import { LeaguePulseGrid } from "@/components/intelligence/league-pulse-grid";
import { MobileTopBar } from "@/components/mobile/mobile-top-bar";
import { SectionTabs } from "@/components/mobile/section-tabs";
import { MiniHistoryChart } from "@/components/charts/mini-history-chart";
import type { LeagueSnapshotView } from "@/lib/types/domain";
import type { PublishedTrendCard, PublishedTrendSection } from "@/lib/trends/publisher";
import type { TrendFilters } from "@/lib/types/domain";

function formatPercent(value: number | null) {
  return typeof value === "number" ? `${value.toFixed(1)}%` : "—";
}

function buildMetricSeries(cards: PublishedTrendCard[]) {
  const series = cards.slice(0, 8).map((card) => card.hitRate ?? card.roi ?? card.rankingScore ?? 0);
  return series.length ? series : [0, 0, 0, 0];
}

function summarizeFilters(filters: TrendFilters) {
  return [
    filters.league === "ALL" ? "All leagues" : filters.league,
    filters.market === "ALL" ? "All markets" : filters.market.replace(/_/g, " "),
    filters.window ?? "365d",
    filters.sportsbook === "all" ? "All books" : filters.sportsbook
  ];
}

type TrendCommandCenterProps = {
  filters: TrendFilters;
  featured: PublishedTrendCard[];
  sections: PublishedTrendSection[];
  activeSystems: number;
  boardGameCount: number;
  snapshots: LeagueSnapshotView[];
};

export function TrendCommandCenter({
  filters,
  featured,
  sections,
  activeSystems,
  boardGameCount,
  snapshots
}: TrendCommandCenterProps) {
  const allCards = sections.flatMap((section) => section.cards);
  const trendSeries = buildMetricSeries(featured.length ? featured : allCards);

  return (
    <div className="grid gap-5">
      <section className="hero-shell overflow-hidden px-5 py-5 lg:px-6 lg:py-6">
        <MobileTopBar title="Trends" subtitle="Odds-linked intelligence" compact />

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.08fr,.92fr] xl:items-end">
          <div>
            <div className="section-kicker">Trend command</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white lg:text-4xl">
              Trends should live next to odds, movement, league context, and what is on today’s desk.
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
              This page makes trends usable. Cards are grouped by actionable context, the board count is visible, and the same experience now carries standings, score history, and league storylines instead of dead-end trend tiles.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-400">
              {summarizeFilters(filters).map((item) => (
                <div key={item} className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="glass-tile">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Active</div>
              <div className="mt-2 text-2xl font-semibold text-white">{activeSystems}</div>
              <div className="mt-1 text-xs text-slate-500">systems on desk</div>
            </div>
            <div className="glass-tile">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Cards</div>
              <div className="mt-2 text-2xl font-semibold text-white">{allCards.length}</div>
              <div className="mt-1 text-xs text-slate-500">surfaced cards</div>
            </div>
            <div className="glass-tile">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Board</div>
              <div className="mt-2 text-2xl font-semibold text-white">{boardGameCount}</div>
              <div className="mt-1 text-xs text-slate-500">verified board rows</div>
            </div>
          </div>
        </div>
      </section>

      <section className="surface-panel-strong px-4 py-4 lg:px-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <SectionTabs
            items={[
              { label: "Featured", active: true, count: featured.length || null },
              { label: "Sections", active: false, count: sections.length || null },
              { label: "Board", href: "/board", active: false, count: boardGameCount || null }
            ]}
          />
          <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-400">
            <div className="rounded-full border border-white/8 px-3 py-1.5">Trends + odds</div>
            <div className="rounded-full border border-white/8 px-3 py-1.5">No fake confidence</div>
            <div className="rounded-full border border-white/8 px-3 py-1.5">League context attached</div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.12fr,.88fr]">
        <div className="surface-panel-strong px-5 py-5 lg:px-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="section-kicker">Featured trend rail</div>
              <div className="mt-2 text-2xl font-semibold tracking-tight text-white">Best cards on the desk</div>
            </div>
            <div className="rounded-full border border-white/8 px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-slate-400">
              {featured.length || allCards.length} cards
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            {(featured.length ? featured : allCards.slice(0, 6)).map((card) => (
              <Link key={card.id} href={card.href} className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] p-4 transition hover:border-sky-400/25 hover:bg-sky-500/[0.04]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                      {card.category} · {card.leagueLabel} · {card.marketLabel}
                    </div>
                    <div className="mt-2 text-lg font-semibold tracking-tight text-white">{card.title}</div>
                    <div className="mt-2 text-sm leading-6 text-slate-400">{card.description}</div>
                  </div>
                  <div className="rounded-full border border-sky-400/20 bg-sky-500/[0.08] px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-sky-200">
                    {card.confidence}
                  </div>
                </div>

                <div className="mt-4 grid gap-2 md:grid-cols-4">
                  <div className="rounded-[1rem] border border-white/8 bg-slate-950/35 px-3 py-3">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Record</div>
                    <div className="mt-1 text-sm font-semibold text-white">{card.record}</div>
                  </div>
                  <div className="rounded-[1rem] border border-white/8 bg-slate-950/35 px-3 py-3">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Hit rate</div>
                    <div className="mt-1 text-sm font-semibold text-white">{formatPercent(card.hitRate)}</div>
                  </div>
                  <div className="rounded-[1rem] border border-white/8 bg-slate-950/35 px-3 py-3">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">ROI</div>
                    <div className="mt-1 text-sm font-semibold text-white">{formatPercent(card.roi)}</div>
                  </div>
                  <div className="rounded-[1rem] border border-white/8 bg-slate-950/35 px-3 py-3">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Sample</div>
                    <div className="mt-1 text-sm font-semibold text-white">{card.sampleSize}</div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">
                  {card.intelligenceTags.slice(0, 4).map((tag) => (
                    <div key={`${card.id}-${tag}`} className="rounded-full border border-white/8 px-3 py-1.5">
                      {tag}
                    </div>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </div>

        <aside className="surface-panel-strong px-5 py-5 xl:sticky xl:top-[7rem]">
          <div className="section-kicker">Pulse graph</div>
          <div className="mt-2 text-xl font-semibold tracking-tight text-white">Trend quality tape</div>
          <div className="mt-3 h-20 w-full">
            <MiniHistoryChart values={trendSeries} height={82} />
          </div>
          <div className="mt-4 grid gap-3">
            {sections.slice(0, 5).map((section) => (
              <div key={section.category} className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-white">{section.category}</div>
                  <div className="text-xs text-slate-500">{section.cards.length} cards</div>
                </div>
                <div className="mt-2 text-xs leading-5 text-slate-400">
                  {section.cards[0]?.railReason ?? "Section ready."}
                </div>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="surface-panel-strong px-5 py-5 lg:px-6">
        <div className="section-kicker">Section grid</div>
        <div className="mt-2 text-2xl font-semibold tracking-tight text-white">Browse the full trend deck</div>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {sections.map((section) => (
            <article key={section.category} className="rounded-[1.25rem] border border-white/8 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-lg font-semibold text-white">{section.category}</div>
                <div className="rounded-full border border-white/8 px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-slate-400">
                  {section.cards.length}
                </div>
              </div>
              <div className="mt-4 grid gap-3">
                {section.cards.slice(0, 4).map((card) => (
                  <Link key={card.id} href={card.href} className="rounded-[1rem] border border-white/8 bg-slate-950/35 px-4 py-3 transition hover:border-sky-400/25 hover:bg-sky-500/[0.04]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-white">{card.title}</div>
                      <div className="text-xs text-sky-300">{card.primaryMetricValue}</div>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{card.railReason}</div>
                  </Link>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <LeaguePulseGrid
        snapshots={snapshots}
        title="League pulse with trend context"
        subtitle="Trend selection gets better when league standings, recent finals, and current storylines stay attached to the research surface."
      />
    </div>
  );
}
