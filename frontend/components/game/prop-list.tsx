import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { PropCardView } from "@/lib/types/domain";
import { formatAmericanOdds, formatMarketType } from "@/lib/formatters/odds";

type PropListProps = {
  props: PropCardView[];
};

export function PropList({ props }: PropListProps) {
  return (
    <div className="grid gap-4">
      {props.map((prop) => (
        <Card key={prop.id} className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                {prop.team.abbreviation} vs {prop.opponent.abbreviation}
              </div>
              <div className="mt-2 font-display text-2xl font-semibold text-white">
                {prop.player.name}
              </div>
              <div className="mt-1 text-sm text-slate-400">
                {formatMarketType(prop.marketType)} | {prop.side} {prop.line} | {prop.sportsbook.name}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand">{prop.edgeScore.label}</Badge>
              <Badge tone="premium">{prop.edgeScore.score}</Badge>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <div className="text-sm text-slate-300">
              {formatAmericanOdds(prop.oddsAmerican)} | {Math.round(prop.recentHitRate * 100)}%
              recent hit | Matchup rank {prop.matchupRank}
            </div>
            <Link
              href={`/bets?selection=${prop.id}`}
              className="rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-300"
            >
              Log bet
            </Link>
          </div>
        </Card>
      ))}
    </div>
  );
}
