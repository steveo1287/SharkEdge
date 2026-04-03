import Link from "next/link";

import { TopPlaysPanel } from "@/components/board/top-plays-panel";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import type { LeagueKey, TrendCardView } from "@/lib/types/domain";
import { TrendSignalCard } from "@/app/_components/home-primitives";

export function HomeDeferredSectionsFallback() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="surface-panel p-6 text-sm leading-7 text-slate-400">
          Loading the deeper prop desk without holding up the command center.
        </Card>
        <Card className="surface-panel p-6 text-sm leading-7 text-slate-400">
          Trend support is streaming separately so the front page can stay focused.
        </Card>
      </div>
    </div>
  );
}

export async function HomeDeferredSections({
  focusedLeague
}: {
  focusedLeague: LeagueKey;
}) {
  const [oddsService, trendsPublisher] = await Promise.all([
    import("@/services/odds/props-service"),
    import("@/lib/trends/publisher")
  ]);

  const [propsData, publishedTrendCards] = await Promise.all([
    oddsService.getPropsExplorerData({
      league: focusedLeague,
      marketType: "ALL",
      team: "all",
      player: "all",
      sportsbook: "all",
      valueFlag: "all",
      sortBy: "edge_score"
    }),
    trendsPublisher.getPublishedTrendCards(
      { league: focusedLeague, sample: 5, window: "365d" },
      { limit: 3 }
    )
  ]);

  const trendCards: TrendCardView[] = publishedTrendCards.map((trend) => ({
    id: trend.id,
    title: trend.title,
    value: trend.primaryMetricValue,
    hitRate: typeof trend.hitRate === "number" ? `${trend.hitRate.toFixed(1)}%` : null,
    roi: typeof trend.roi === "number" ? `${trend.roi.toFixed(1)}%` : null,
    sampleSize: trend.sampleSize,
    dateRange: trend.sourceTrend.dateRange,
    note: trend.description,
    explanation: trend.whyNow.join(" "),
    whyItMatters: trend.railReason,
    caution: trend.warning,
    href: trend.href,
    tone:
      trend.confidence === "strong"
        ? "success"
        : trend.confidence === "moderate"
          ? "brand"
          : "premium"
  }));
  const topPlays = propsData.props.slice(0, 4);

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Best prices"
            title="Today's strongest prop pressure"
            description="Lead with current value, then decide whether to go deeper into the prop lab."
          />
          {topPlays.length ? (
            <TopPlaysPanel plays={topPlays} />
          ) : (
            <Card className="surface-panel p-6 text-sm leading-7 text-slate-400">
              No verified top-play props are ready for this scope yet.
            </Card>
          )}
        </section>

        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Trend support"
            title="Signals worth carrying into the lab"
            description="Trends belong here only when they sharpen the read instead of replacing it."
          />
          <div className="grid gap-4">
            {trendCards.length ? trendCards.map((trend) => <TrendSignalCard key={trend.id} trend={trend} />) : null}
            {!trendCards.length ? (
              <Card className="surface-panel p-6 text-sm leading-7 text-slate-400">
                No published trend deck is strong enough to outrank the board right now.
              </Card>
            ) : null}
            <Card className="surface-panel p-5">
              <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">Keep digging</div>
              <div className="mt-3 text-xl font-semibold text-white">Move into the desks that hold the real depth.</div>
              <div className="mt-3 text-sm leading-7 text-slate-400">
                The homepage should orient you. The actual work still happens in the Board, Game, Props, and Performance workflows.
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href="/performance"
                  className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:border-sky-400/25"
                >
                  Open performance
                </Link>
                <Link
                  href="/trends"
                  className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:border-sky-400/25"
                >
                  Open trends
                </Link>
              </div>
            </Card>
          </div>
        </section>
      </div>
    </div>
  );
}
