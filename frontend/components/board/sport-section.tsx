import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import type { BoardSportSectionView } from "@/lib/types/domain";
import { formatGameDateTime } from "@/lib/formatters/date";

import { GameCard } from "./game-card";

function getStatusTone(status: BoardSportSectionView["status"]) {
  if (status === "LIVE") {
    return "success" as const;
  }

  if (status === "PARTIAL") {
    return "premium" as const;
  }

  return "muted" as const;
}

function formatStatusLabel(status: BoardSportSectionView["status"]) {
  return status.replace("_", " ");
}

function getPropsTone(status: BoardSportSectionView["propsStatus"]) {
  if (status === "LIVE") {
    return "success" as const;
  }

  if (status === "PARTIAL") {
    return "premium" as const;
  }

  return "muted" as const;
}

type SportSectionProps = {
  section: BoardSportSectionView;
  focusMarket: string;
};

export function SportSection({ section, focusMarket }: SportSectionProps) {
  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionTitle title={`${section.leagueLabel} Board`} description={section.detail} />
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={getStatusTone(section.status)}>{formatStatusLabel(section.status)}</Badge>
          {section.stale ? <Badge tone="danger">Stale</Badge> : null}
        </div>
      </div>

      <Card className="grid gap-2 p-4 text-sm text-slate-400 xl:grid-cols-[1.4fr_1fr]">
        <div>{section.scoreboardDetail}</div>
        <div className="grid gap-1 text-xs text-slate-500 xl:text-right">
          <div>Scores: {section.liveScoreProvider ?? "Not wired"}</div>
          <div>Current odds: {section.currentOddsProvider ?? "Pending"}</div>
          <div>Historical: {section.historicalOddsProvider ?? "Pending"}</div>
          <div>
            Props:{" "}
            <span className="text-slate-300">
              {formatStatusLabel(section.propsStatus)}
              {section.propsProviders.length ? ` via ${section.propsProviders.join(", ")}` : ""}
            </span>
          </div>
        </div>
        <div className="xl:col-span-2">
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge tone={getPropsTone(section.propsStatus)}>
              Props {formatStatusLabel(section.propsStatus)}
            </Badge>
          </div>
          <div className="mt-2 text-xs leading-6 text-slate-500">{section.propsNote}</div>
        </div>
      </Card>

      {section.adapterState === "BOARD" ? (
        <div className="grid gap-4 2xl:grid-cols-2">
          {section.games.map((game) => (
            <GameCard key={game.id} game={game} focusMarket={focusMarket} />
          ))}
        </div>
      ) : section.adapterState === "SCORES_ONLY" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {section.scoreboard.map((event) => (
            <Card key={event.id} className="grid gap-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    {formatGameDateTime(event.startTime)}
                  </div>
                  <div className="mt-2 font-display text-2xl font-semibold text-white">
                    {event.label}
                  </div>
                </div>
                <Badge tone={event.status === "LIVE" ? "success" : event.status === "FINAL" ? "neutral" : "muted"}>
                  {event.status}
                </Badge>
              </div>
              <div className="text-sm text-slate-400">
                {event.stateDetail ?? "Score/state context is live, but a full odds board row is not ready for this event yet."}
              </div>
              <div className="text-lg font-medium text-white">
                {event.scoreboard ?? "No score posted yet"}
              </div>
              <Link
                href={event.detailHref ?? `/game/${event.id}`}
                className="w-fit rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-300"
              >
                Open matchup
              </Link>
            </Card>
          ))}
        </div>
      ) : section.adapterState === "NO_EVENTS" ? (
        <EmptyState
          title={`No scheduled ${section.leagueLabel} events in this window`}
          description={`${section.scoreboardDetail} SharkEdge is keeping coverage visible instead of implying the adapter failed.`}
        />
      ) : (
        <EmptyState
          title={
            section.status === "COMING_SOON"
              ? `${section.leagueLabel} coverage is pending`
              : `${section.leagueLabel} is visible with limited board depth`
          }
          description={section.detail}
        />
      )}
    </section>
  );
}
