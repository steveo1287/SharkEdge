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
      <section className="panel overflow-hidden px-5 py-5 lg:px-6 lg:py-6">
        <MobileTopBar title="Trends" subtitle="Odds-linked intelligence" compact />

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.08fr,.92fr] xl:items-end">
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-aqua">Trend command</div>
            <h1 className="mt-3 font-display text-[28px] font-semibold tracking-[-0.02em] text-text-primary lg:text-[34px]">
              Trends live next to odds, movement, and today&rsquo;s desk &mdash; never in isolation.
            </h1>
            <p className="mt-3 max-w-3xl text-[13.5px] leading-[1.65] text-bone/65">
              Cards are grouped by actionable context, the board count is visible, and the same surface carries standings, score history, and league storylines instead of dead-end trend tiles.
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/70">
              {summarizeFilters(filters).map((item) => (
                <div key={item} className="rounded-sm border border-bone/[0.10] bg-surface px-2.5 py-1">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-bone/[0.08] bg-surface p-4">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/55">Active</div>
              <div className="mt-2 font-mono text-[28px] font-semibold tabular-nums text-text-primary">{activeSystems}</div>
              <div className="mt-1 text-[11.5px] text-bone/55">systems on desk</div>
            </div>
            <div className="rounded-md border border-bone/[0.08] bg-surface p-4">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/55">Cards</div>
              <div className="mt-2 font-mono text-[28px] font-semibold tabular-nums text-text-primary">{allCards.length}</div>
              <div className="mt-1 text-[11.5px] text-bone/55">surfaced cards</div>
            </div>
            <div className="rounded-md border border-bone/[0.08] bg-surface p-4">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/55">Board</div>
              <div className="mt-2 font-mono text-[28px] font-semibold tabular-nums text-aqua">{boardGameCount}</div>
              <div className="mt-1 text-[11.5px] text-bone/55">verified board rows</div>
            </div>
          </div>
        </div>
      </section>

      <section className="panel px-4 py-4 lg:px-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <SectionTabs
            items={[
              { label: "Featured", active: true, count: featured.length || null },
              { label: "Sections", active: false, count: sections.length || null },
              { label: "Board", href: "/board", active: false, count: boardGameCount || null }
            ]}
          />
          <div className="flex flex-wrap gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/65">
            <div className="rounded-sm border border-bone/[0.10] bg-surface px-2.5 py-1">Trends + odds</div>
            <div className="rounded-sm border border-bone/[0.10] bg-surface px-2.5 py-1">No fake confidence</div>
            <div className="rounded-sm border border-bone/[0.10] bg-surface px-2.5 py-1">League context attached</div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.12fr,.88fr]">
        <div className="panel px-5 py-5 lg:px-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-aqua">Featured trend rail</div>
              <div className="mt-2 font-display text-[22px] font-semibold tracking-[-0.01em] text-text-primary">Best cards on the desk</div>
            </div>
            <div className="rounded-sm border border-bone/[0.10] bg-surface px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/70">
              <span className="font-mono tabular-nums">{featured.length || allCards.length}</span> cards
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            {(featured.length ? featured : allCards.slice(0, 6)).map((card) => (
              <Link
                key={card.id}
                href={card.href}
                className="focusable rounded-md border border-bone/[0.08] bg-surface p-4 transition-colors hover:border-aqua/25 hover:bg-panel"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/55">
                      {card.category} <span className="text-bone/25">·</span> {card.leagueLabel} <span className="text-bone/25">·</span> {card.marketLabel}
                    </div>
                    <div className="mt-2 font-display text-[17px] font-semibold tracking-[-0.01em] text-text-primary">{card.title}</div>
                    <div className="mt-2 text-[12.5px] leading-[1.55] text-bone/60">{card.description}</div>
                  </div>
                  <div className="rounded-sm border border-aqua/25 bg-aqua/[0.08] px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-aqua">
                    {card.confidence}
                  </div>
                </div>

                <div className="mt-4 grid gap-2 md:grid-cols-4">
                  <div className="rounded-md border border-bone/[0.08] bg-panel px-3 py-2.5">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-bone/55">Record</div>
                    <div className="mt-1 font-mono text-[13px] font-semibold tabular-nums text-text-primary">{card.record}</div>
                  </div>
                  <div className="rounded-md border border-bone/[0.08] bg-panel px-3 py-2.5">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-bone/55">Hit rate</div>
                    <div className="mt-1 font-mono text-[13px] font-semibold tabular-nums text-mint">{formatPercent(card.hitRate)}</div>
                  </div>
                  <div className="rounded-md border border-bone/[0.08] bg-panel px-3 py-2.5">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-bone/55">ROI</div>
                    <div className="mt-1 font-mono text-[13px] font-semibold tabular-nums text-aqua">{formatPercent(card.roi)}</div>
                  </div>
                  <div className="rounded-md border border-bone/[0.08] bg-panel px-3 py-2.5">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-bone/55">Sample</div>
                    <div className="mt-1 font-mono text-[13px] font-semibold tabular-nums text-text-primary">{card.sampleSize}</div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/65">
                  {card.intelligenceTags.slice(0, 4).map((tag) => (
                    <div key={`${card.id}-${tag}`} className="rounded-sm border border-bone/[0.10] px-2 py-1">
                      {tag}
                    </div>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </div>

        <aside className="panel px-5 py-5 xl:sticky xl:top-[7rem]">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-aqua">Pulse graph</div>
          <div className="mt-2 font-display text-[19px] font-semibold tracking-[-0.01em] text-text-primary">Trend quality tape</div>
          <div className="mt-3 h-20 w-full">
            <MiniHistoryChart values={trendSeries} height={82} />
          </div>
          <div className="mt-4 grid gap-2">
            {sections.slice(0, 5).map((section) => (
              <div key={section.category} className="rounded-md border border-bone/[0.08] bg-surface px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11.5px] font-semibold uppercase tracking-[0.10em] text-text-primary">{section.category}</div>
                  <div className="font-mono text-[10.5px] tabular-nums text-bone/55">
                    {section.cards.length} cards
                  </div>
                </div>
                <div className="mt-1.5 text-[12px] leading-[1.5] text-bone/55">
                  {section.cards[0]?.railReason ?? "Section ready."}
                </div>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="panel px-5 py-5 lg:px-6">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-aqua">Section grid</div>
        <div className="mt-2 font-display text-[22px] font-semibold tracking-[-0.01em] text-text-primary">Browse the full trend deck</div>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {sections.map((section) => (
            <article key={section.category} className="rounded-md border border-bone/[0.08] bg-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="font-display text-[16px] font-semibold tracking-[-0.01em] text-text-primary">{section.category}</div>
                <div className="rounded-sm border border-bone/[0.10] bg-panel px-2 py-0.5 font-mono text-[10.5px] font-semibold tabular-nums text-bone/75">
                  {section.cards.length}
                </div>
              </div>
              <div className="mt-4 grid gap-2">
                {section.cards.slice(0, 4).map((card) => (
                  <Link
                    key={card.id}
                    href={card.href}
                    className="focusable rounded-md border border-bone/[0.08] bg-panel px-4 py-3 transition-colors hover:border-aqua/25 hover:bg-raised"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[13px] font-semibold text-text-primary">{card.title}</div>
                      <div className="font-mono text-[12px] tabular-nums text-aqua">{card.primaryMetricValue}</div>
                    </div>
                    <div className="mt-1 text-[11.5px] leading-[1.5] text-bone/55">{card.railReason}</div>
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
