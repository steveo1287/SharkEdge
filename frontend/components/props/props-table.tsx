import Link from "next/link";

import { DataTable } from "@/components/ui/data-table";
import type { PropCardView } from "@/lib/types/domain";
import { formatAmericanOdds, formatMarketType } from "@/lib/formatters/odds";

type PropsTableProps = {
  props: PropCardView[];
};

export function PropsTable({ props }: PropsTableProps) {
  return (
    <DataTable
      columns={["Player", "Game", "Market", "Line", "Book", "Hit Rate", "Edge", "Actions"]}
      rows={props.map((prop) => [
        <div key={`${prop.id}-player`}>
          <div className="font-medium text-white">{prop.player.name}</div>
          <div className="text-xs text-slate-500">{prop.team.abbreviation}</div>
        </div>,
        `${prop.team.abbreviation} vs ${prop.opponent.abbreviation}`,
        `${formatMarketType(prop.marketType)} ${prop.side}`,
        `${prop.line} | ${formatAmericanOdds(prop.oddsAmerican)}`,
        prop.sportsbook.name,
        `${Math.round(prop.recentHitRate * 100)}%`,
        `${prop.edgeScore.label} ${prop.edgeScore.score}`,
        <div key={`${prop.id}-actions`} className="flex gap-2">
          <Link href={`/game/${prop.gameId}`} className="text-sky-300">
            Game
          </Link>
          <Link href={`/bets?selection=${prop.id}`} className="text-amber-200">
            Log
          </Link>
        </div>
      ])}
    />
  );
}
