import { notFound } from "next/navigation";

import { MatchupPanel } from "@/components/game/matchup-panel";
import { OddsTable } from "@/components/game/odds-table";
import { OverviewPanel } from "@/components/game/overview-panel";
import { PropList } from "@/components/game/prop-list";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import { formatGameDateTime } from "@/lib/formatters/date";
import { getMatchupDetail } from "@/services/matchups/matchup-service";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

function getStatusTone(status: string) {
  if (status === "LIVE") {
    return "success" as const;
  }

  if (status === "FINAL") {
    return "neutral" as const;
  }

  if (status === "POSTPONED" || status === "CANCELED") {
    return "danger" as const;
  }

  return "muted" as const;
}

function getSupportTone(status: string) {
  if (status === "LIVE") {
    return "success" as const;
  }

  if (status === "PARTIAL") {
    return "premium" as const;
  }

  return "muted" as const;
}

export default async function GamePage({ params }: PageProps) {
  const { id } = await params;
  const detail = await getMatchupDetail(id);

  if (!detail) {
    notFound();
  }

  return (
    <div className="grid gap-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
              {detail.league.key} | {formatGameDateTime(detail.startTime)}
            </div>
            <div className="mt-3 font-display text-4xl font-semibold text-white">
              {detail.eventLabel}
            </div>
            <div className="mt-2 text-sm text-slate-400">
              {[detail.venue, detail.stateDetail, detail.scoreboard].filter(Boolean).join(" | ") ||
                "Provider-backed matchup drill-in"}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={getStatusTone(detail.status)}>{detail.status}</Badge>
            <Badge tone={getSupportTone(detail.supportStatus)}>{detail.supportStatus}</Badge>
            {detail.lastUpdatedAt ? <Badge tone="muted">Updated {detail.lastUpdatedAt.slice(11, 16)} UTC</Badge> : null}
            <Badge tone={detail.source === "live" ? "success" : detail.source === "mock" ? "premium" : "muted"}>
              {detail.source === "live"
                ? "Live provider mesh"
                : detail.source === "mock"
                  ? "Seeded fallback"
                  : "Catalog scaffold"}
            </Badge>
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
        <SectionTitle
          title="Overview"
          description="Provider-backed coverage state, odds summary, and product-honest context for this event."
        />
        <OverviewPanel detail={detail} />
      </section>

      <section id="odds" className="grid gap-4">
        <SectionTitle
          title="Odds"
          description="Current book comparison and stored range or snapshot history when a real odds path exists."
        />
        <OddsTable detail={detail} />
      </section>

      <section id="props" className="grid gap-4">
        <SectionTitle
          title="Props"
          description="Market support is shown honestly by sport. Live cards render only where a real prop provider exists."
        />
        <PropList props={detail.props} support={detail.propsSupport} />
      </section>

      <section id="matchup" className="grid gap-4">
        <SectionTitle
          title="Matchup"
          description="Team or fighter panels, season metrics, leaders, box score context, and recent form where real sources return it."
        />
        <MatchupPanel detail={detail} />
      </section>

      <section id="trends" className="grid gap-4">
        <SectionTitle
          title="Trends"
          description="Real cards only. No predictive certainty, no fake edge language."
        />
        {detail.trendCards.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {detail.trendCards.map((card) => (
              <Card key={card.id} className="p-5">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  {card.title}
                </div>
                <div className="mt-3 font-display text-3xl font-semibold text-white">
                  {card.value}
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-400">{card.note}</div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Trend cards are limited for this matchup"
            description="Historical or recent-form trend cards will appear here when the current providers return enough real data to support them honestly."
          />
        )}
      </section>
    </div>
  );
}
