import Link from "next/link";

import { TopPlaysPanel } from "@/components/board/top-plays-panel";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import type { LeagueKey } from "@/lib/types/domain";

export function HomeDeferredSectionsFallback() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="surface-panel p-6 text-sm leading-7 text-slate-400">
          Loading the deeper prop desk without holding up the command center.
        </Card>
        <Card className="surface-panel p-6 text-sm leading-7 text-slate-400">
          Research-lab trend support is paused so the front page can stay simulator-first.
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
  const oddsService = await import("@/services/odds/props-service");

  const propsData = await oddsService.getPropsExplorerData({
    league: focusedLeague,
    marketType: "ALL",
    team: "all",
    player: "all",
    sportsbook: "all",
    valueFlag: "all",
    sortBy: "edge_score"
  });

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
            eyebrow="Research lab paused"
            title="SharkTrends is hibernating"
            description="Premium-style trend mining needs premium historical context. For now, compute goes to sims and accuracy."
          />
          <div className="grid gap-4">
            <Card className="surface-panel p-6 text-sm leading-7 text-slate-400">
              Trend discovery routes remain available as a lab, but the homepage no longer imports trend publishers or warms trend caches. That keeps Railway focused on MLB and UFC simulations.
            </Card>
            <Card className="surface-panel p-5">
              <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">Keep digging</div>
              <div className="mt-3 text-xl font-semibold text-white">Move into the simulator desks that hold the real depth.</div>
              <div className="mt-3 text-sm leading-7 text-slate-400">
                The homepage should orient you. The actual work now happens in MLB Sim Lab, SharkFights, Accuracy, and Saved Plays.
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href="/performance"
                  className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:border-sky-400/25"
                >
                  Open performance
                </Link>
                <Link
                  href="/sharktrends"
                  className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:border-sky-400/25"
                >
                  Open paused lab
                </Link>
              </div>
            </Card>
          </div>
        </section>
      </div>
    </div>
  );
}
