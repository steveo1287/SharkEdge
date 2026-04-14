import Link from "next/link";

import { LeagueBadge } from "@/components/identity/league-badge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import type { BoardSportSectionView } from "@/lib/types/domain";

type Props = {
  sections: BoardSportSectionView[];
};

function getStatusTone(status: BoardSportSectionView["status"]) {
  if (status === "LIVE") {
    return "success" as const;
  }

  if (status === "PARTIAL") {
    return "premium" as const;
  }

  return "muted" as const;
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

export function LeagueDeskGrid({ sections }: Props) {
  return (
    <section className="grid gap-4">
      <SectionTitle
        eyebrow="League desks"
        title="Open the slate by league"
        description="Each league gets a clean desk card with status, game count, and direct routing."
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {sections.map((section) => (
          <Card key={section.leagueKey} className="surface-panel p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <LeagueBadge league={section.leagueKey} />
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    {section.sport}
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-white">
                    {section.leagueLabel}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge tone={getStatusTone(section.status)}>{section.status}</Badge>
                <Badge tone={getPropsTone(section.propsStatus)}>
                  Props {section.propsStatus}
                </Badge>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-[1.1rem] border border-white/8 bg-slate-950/60 p-4">
                <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
                  Games
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {section.games.length}
                </div>
              </div>

              <div className="rounded-[1.1rem] border border-white/8 bg-slate-950/60 p-4">
                <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
                  Scoreboard
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {section.scoreboard.length}
                </div>
              </div>

              <div className="rounded-[1.1rem] border border-white/8 bg-slate-950/60 p-4">
                <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
                  Odds
                </div>
                <div className="mt-2 text-sm font-medium text-white">
                  {section.currentOddsProvider ?? "Pending"}
                </div>
              </div>
            </div>

            <div className="mt-4 text-sm leading-6 text-slate-300">
              {section.note || "League activity and edge overview."}
            </div>

            <div className="mt-2 text-sm leading-6 text-slate-400">
              {section.propsNote}
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={`/leagues/${section.leagueKey}`}
                className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-300"
              >
                Enter league
              </Link>

              {section.games[0] ? (
                <Link
                  href={section.games[0].detailHref ?? `/game/${section.games[0].id}`}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-white"
                >
                  Lead matchup
                </Link>
              ) : null}
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}