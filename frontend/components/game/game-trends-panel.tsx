import Link from "next/link";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import type { GameHubView } from "@/lib/adapters/game-ui-adapter";
import type { LeagueKey } from "@/lib/types/domain";

type GameTrendsPanelProps = {
  trends: GameHubView["trends"];
  leagueKey: LeagueKey;
};

function getToneClasses(tone: "success" | "brand" | "premium" | "muted") {
  switch (tone) {
    case "success":
      return "border-emerald-400/20 bg-emerald-500/10";
    case "brand":
      return "border-sky-400/20 bg-sky-500/10";
    case "premium":
      return "border-fuchsia-400/20 bg-fuchsia-500/10";
    default:
      return "border-white/8 bg-slate-950/60";
  }
}

export function GameTrendsPanel({ trends, leagueKey }: GameTrendsPanelProps) {
  if (!trends.cards.length) {
    return (
      <EmptyState
        eyebrow="Trends"
        title="No matchup-linked trend cards are available yet"
        description="The matchup page is live, but the current trend engine did not return active trend cards for this event."
        action={
          <Link
            href={`/trends?league=${leagueKey}`}
            className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-200"
          >
            Open league trends
          </Link>
        }
      />
    );
  }

  return (
    <div className="grid gap-4">
      <SectionTitle
        eyebrow="Trends"
        title="Historical context that still matters today"
        description="Trend cards stay attached to the matchup instead of living in a separate dead-end workflow."
      />

      <div className="grid gap-4 xl:grid-cols-3">
        {trends.cards.map((card) => (
          <Card key={card.id} className={`surface-panel p-5 ${getToneClasses(card.tone)}`}>
            <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
              {card.title}
            </div>
            <div className="mt-3 text-2xl font-semibold text-white">{card.value}</div>
            <div className="mt-3 text-sm leading-6 text-slate-300">{card.note}</div>

            {card.href ? (
              <div className="mt-4">
                <Link
                  href={card.href}
                  className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-200"
                >
                  Open trend {"->"}
                </Link>
              </div>
            ) : null}
          </Card>
        ))}
      </div>

      <div className="flex justify-end">
        <Link
          href={`/trends?league=${leagueKey}`}
          className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200"
        >
          See all league trends
        </Link>
      </div>
    </div>
  );
}

