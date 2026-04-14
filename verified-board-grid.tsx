import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import type { BoardSportSectionView } from "@/lib/types/domain";
import { formatGameDateTime } from "@/lib/formatters/date";
import { resolveMatchupHref } from "@/lib/utils/entity-routing";

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

function hasVerifiedGameOdds(game: BoardSportSectionView["games"][number]) {
  return (
    game.bestBookCount > 0 &&
    (game.spread.bestOdds !== 0 || game.moneyline.bestOdds !== 0 || game.total.bestOdds !== 0)
  );
}

export function SportSection({ section, focusMarket }: SportSectionProps) {
  const verifiedGames = section.games.filter(hasVerifiedGameOdds);
  const showBoardGames = section.adapterState === "BOARD" && verifiedGames.length > 0;
  const showScoresOnly =
    section.adapterState === "SCORES_ONLY" ||
    (section.adapterState === "BOARD" && verifiedGames.length === 0 && section.scoreboard.length > 0);

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionTitle title={`${section.leagueLabel} board`} description={section.detail} />
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={getStatusTone(section.status)}>{formatStatusLabel(section.status)}</Badge>
          {section.stale ? <Badge tone="danger">Stale</Badge> : null}
        </div>
      </div>

      <Card className="grid gap-4 p-4 text-sm text-slate-400 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="leading-6">{section.scoreboardDetail}</div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-2">
          <div className="rounded-[1.2rem] border border-line/70 bg-slate-950/65 px-3 py-3">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Scores</div>
            <div className="mt-2 text-sm text-white">{section.liveScoreProvider ?? "League feed"}</div>
          </div>
          <div className="rounded-[1.2rem] border border-line/70 bg-slate-950/65 px-3 py-3">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Odds</div>
            <div className="mt-2 text-sm text-white">
              {verifiedGames.length ? section.currentOddsProvider ?? "Verified market rows" : "Not verified"}
            </div>
          </div>
          <div className="rounded-[1.2rem] border border-line/70 bg-slate-950/65 px-3 py-3">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">History</div>
            <div className="mt-2 text-sm text-white">{section.historicalOddsProvider ?? "Pending"}</div>
          </div>
          <div className="rounded-[1.2rem] border border-line/70 bg-slate-950/65 px-3 py-3">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Props</div>
            <div className="mt-2 flex items-center gap-2">
              <Badge tone={getPropsTone(section.propsStatus)}>{formatStatusLabel(section.propsStatus)}</Badge>
            </div>
          </div>
        </div>
        <div className="xl:col-span-2 text-xs leading-6 text-slate-500">
          {section.propsNote}
          {section.propsProviders.length ? ` Providers: ${section.propsProviders.join(", ")}.` : ""}
        </div>
      </Card>

      {showBoardGames ? (
        <div className="grid gap-4 2xl:grid-cols-2">
          {verifiedGames.map((game) => (
            <GameCard key={game.id} game={game} focusMarket={focusMarket} />
          ))}
        </div>
      ) : showScoresOnly ? (
        <div className="grid gap-4 2xl:grid-cols-2">
          {section.scoreboard.map((event) => (
            <Card key={event.id} className="grid gap-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
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
              <div className="rounded-2xl border border-line bg-slate-950/65 px-4 py-3 text-lg font-medium text-white">
                {event.scoreboard ?? "No score posted yet"}
              </div>
              <div className="text-sm leading-6 text-slate-400">
                {event.stateDetail ??
                  "Score and matchup detail are live here even though a full book-by-book board row is not available yet."}
              </div>
              <Link
                href={
                  resolveMatchupHref({
                    leagueKey: section.leagueKey,
                    externalEventId: event.id,
                    fallbackHref: event.detailHref ?? null
                  }) ?? "/games"
                }
                className="inline-flex w-full items-center justify-center rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm font-medium text-sky-300 sm:w-fit"
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
