import { notFound } from "next/navigation";

import { MatchupPanel } from "@/components/game/matchup-panel";
import { OddsTable } from "@/components/game/odds-table";
import { OverviewPanel } from "@/components/game/overview-panel";
import { PropList } from "@/components/game/prop-list";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import { formatGameDateTime } from "@/lib/formatters/date";
import { getGameDetail } from "@/services/odds/odds-service";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function GamePage({ params }: PageProps) {
  const { id } = await params;
  const detail = getGameDetail(id);

  if (!detail) {
    notFound();
  }

  return (
    <div className="grid gap-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
              {detail.league.key} | {formatGameDateTime(detail.game.startTime)}
            </div>
            <div className="mt-3 font-display text-4xl font-semibold text-white">
              {detail.awayTeam.name} @ {detail.homeTeam.name}
            </div>
            <div className="mt-2 text-sm text-slate-400">{detail.game.venue}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="brand">{detail.edgeScore.label}</Badge>
            <Badge tone="premium">Edge {detail.edgeScore.score}</Badge>
            <Badge tone="muted">{detail.game.status}</Badge>
          </div>
        </div>
      </Card>

      <nav className="flex flex-wrap gap-2">
        {["Overview", "Odds", "Props", "Matchup", "Trends"].map((item) => (
          <a
            key={item}
            href={`#${item.toLowerCase()}`}
            className="rounded-full border border-line bg-slate-900/70 px-4 py-2 text-sm text-slate-300"
          >
            {item}
          </a>
        ))}
      </nav>

      <section id="overview" className="grid gap-4">
        <SectionTitle title="Overview" description="Best prices, consensus, injuries, and high-signal matchup notes." />
        <OverviewPanel detail={detail} />
      </section>

      <section id="odds" className="grid gap-4">
        <SectionTitle title="Odds" description="Book-by-book comparison and historical pricing snapshots." />
        <OddsTable detail={detail} />
      </section>

      <section id="props" className="grid gap-4">
        <SectionTitle title="Props" description="Related player props for the matchup with quick log actions." />
        <PropList props={detail.props} />
      </section>

      <section id="matchup" className="grid gap-4">
        <SectionTitle title="Matchup" description="Team pace, efficiency, form, and split context." />
        <MatchupPanel detail={detail} />
      </section>

      <section id="trends" className="grid gap-4">
        <SectionTitle title="Trends" description="Future hook for saved matchup-specific trends and query output." />
        <Card className="p-5 text-sm leading-7 text-slate-400">
          The trends section is intentionally scaffolded but not fully live. The
          MVP is already storing saved trend and run records in the schema so the
          future engine can slot in without reworking page structure.
        </Card>
      </section>
    </div>
  );
}
