import Link from "next/link";

import { BetActionButton } from "@/components/bets/bet-action-button";
import { DataTable } from "@/components/ui/data-table";
import type { PropCardView } from "@/lib/types/domain";
import { formatAmericanOdds, formatMarketType } from "@/lib/formatters/odds";
import { buildPropBetIntent } from "@/lib/utils/bet-intelligence";

type PropsTableProps = {
  props: PropCardView[];
};

function renderValueFlag(flag: PropCardView["valueFlag"]) {
  if (!flag || flag === "NONE") {
    return "No flag";
  }

  return flag.replace(/_/g, " ");
}

export function PropsTable({ props }: PropsTableProps) {
  return (
    <DataTable
      columns={[
        "Player",
        "League",
        "Matchup",
        "Market",
        "Best Price",
        "Market EV",
        "Books",
        "Signal",
        "Actions"
      ]}
      rows={props.map((prop) => [
        <div key={`${prop.id}-player`}>
          <div className="font-medium text-white">{prop.player.name}</div>
          <div className="text-xs text-slate-500">
            {prop.teamResolved ? prop.team.abbreviation : "Team TBD"}
          </div>
        </div>,
        prop.leagueKey,
        prop.gameLabel ?? `${prop.team.abbreviation} vs ${prop.opponent.abbreviation}`,
        <div key={`${prop.id}-market`}>
          <div className="text-white">{formatMarketType(prop.marketType)} {prop.side}</div>
          <div className="text-xs text-slate-500">{prop.line}</div>
        </div>,
        <div key={`${prop.id}-best`}>
          <div className="text-white">
            {formatAmericanOdds(prop.bestAvailableOddsAmerican ?? prop.oddsAmerican)}
          </div>
          <div className="text-xs text-slate-500">
            {prop.bestAvailableSportsbookName ?? prop.sportsbook.name}
          </div>
        </div>,
        <div key={`${prop.id}-ev`}>
          <div className="text-white">
            {typeof prop.expectedValuePct === "number"
              ? `${prop.expectedValuePct > 0 ? "+" : ""}${prop.expectedValuePct.toFixed(2)}%`
              : "Unavailable"}
          </div>
          <div className="text-xs text-slate-500">
            {typeof prop.marketDeltaAmerican === "number"
              ? `Delta ${prop.marketDeltaAmerican > 0 ? "+" : ""}${prop.marketDeltaAmerican}`
              : "No consensus delta"}
          </div>
        </div>,
        `${prop.sportsbookCount ?? 1}`,
        <div key={`${prop.id}-signal`}>
          <div className="text-white">{renderValueFlag(prop.valueFlag)}</div>
          <div className="text-xs text-slate-500">
            {typeof prop.averageOddsAmerican === "number"
              ? `Avg ${formatAmericanOdds(prop.averageOddsAmerican)}`
              : "Market avg pending"}
          </div>
        </div>,
        <div key={`${prop.id}-actions`} className="flex gap-2">
          <Link href={prop.gameHref ?? `/game/${prop.gameId}`} className="text-sky-300">
            Game
          </Link>
          <BetActionButton intent={buildPropBetIntent(prop, "props", "/props")} className="px-3 py-1.5 text-xs">
            Slip
          </BetActionButton>
          <BetActionButton
            intent={buildPropBetIntent(prop, "props", "/props")}
            mode="log"
            className="px-3 py-1.5 text-xs"
          >
            Log
          </BetActionButton>
        </div>
      ])}
    />
  );
}
