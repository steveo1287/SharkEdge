"use client";

import { DataTable } from "@/components/ui/data-table";
import { formatAmericanOdds, formatMarketType, formatUnits } from "@/lib/formatters/odds";
import type { BetRecord, SportsbookRecord } from "@/lib/types/domain";

export type TrackerBet = BetRecord & {
  description: string;
  sportsbook: SportsbookRecord;
};

type BetTableProps = {
  bets: TrackerBet[];
  onDelete: (id: string) => void;
};

export function BetTable({ bets, onDelete }: BetTableProps) {
  return (
    <DataTable
      columns={[
        "Date",
        "League",
        "Description",
        "Market",
        "Side",
        "Line",
        "Odds",
        "Book",
        "Stake",
        "To Win",
        "Result",
        "Actions"
      ]}
      rows={bets.map((bet) => [
        bet.placedAt.slice(0, 10),
        bet.league,
        bet.description,
        formatMarketType(bet.marketType),
        bet.side,
        bet.line ?? "--",
        formatAmericanOdds(bet.oddsAmerican),
        bet.sportsbook.name,
        formatUnits(bet.stake).replace(/^\+/, ""),
        formatUnits(bet.toWin),
        bet.result,
        <button
          key={`${bet.id}-delete`}
          type="button"
          onClick={() => onDelete(bet.id)}
          className="text-rose-300"
        >
          Delete
        </button>
      ])}
    />
  );
}
