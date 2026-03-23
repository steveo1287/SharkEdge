"use client";

import { useEffect, useMemo, useState } from "react";

import { StatCard } from "@/components/ui/stat-card";
import { calculateRecord, calculateROI, calculateUnits, calculateWinRate } from "@/lib/utils/performance";
import type { BetFormInput, SportsbookRecord } from "@/lib/types/domain";
import { createClientBetRecord, describePendingBet } from "@/services/bets/bets-service";

import { BetForm } from "./bet-form";
import { BetTable, type TrackerBet } from "./bet-table";

type BetsWorkspaceProps = {
  initialBets: TrackerBet[];
  sportsbooks: SportsbookRecord[];
  prefill: BetFormInput | null;
};

export function BetsWorkspace({
  initialBets,
  sportsbooks,
  prefill
}: BetsWorkspaceProps) {
  const [bets, setBets] = useState(initialBets);

  useEffect(() => {
    setBets(initialBets);
  }, [initialBets]);

  const summary = useMemo(() => {
    const settled = bets.filter((bet) => bet.result !== "OPEN");
    const record = calculateRecord(settled);
    const units = calculateUnits(settled);
    const risked = settled.reduce((total, bet) => total + bet.stake, 0);

    return {
      record: `${record.wins}-${record.losses}-${record.pushes}`,
      units,
      roi: calculateROI(units, risked),
      winRate: calculateWinRate(record.wins, record.losses, record.pushes)
    };
  }, [bets]);

  function handleAdd(values: BetFormInput) {
    const book = sportsbooks.find((entry) => entry.id === values.sportsbookId) ?? sportsbooks[0];
    const bet = createClientBetRecord(values);

    setBets((current) => [
      {
        ...bet,
        description: describePendingBet(values),
        sportsbook: book
      },
      ...current
    ]);
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Record" value={summary.record} note="Open bets excluded" />
        <StatCard label="Units" value={`${summary.units > 0 ? "+" : ""}${summary.units.toFixed(2)}u`} />
        <StatCard label="ROI" value={`${summary.roi > 0 ? "+" : ""}${summary.roi.toFixed(1)}%`} />
        <StatCard label="Win Rate" value={`${summary.winRate.toFixed(1)}%`} />
      </div>

      <BetForm sportsbooks={sportsbooks} initialValues={prefill} onSubmit={handleAdd} />
      <BetTable bets={bets} onDelete={(id) => setBets((current) => current.filter((bet) => bet.id !== id))} />
    </div>
  );
}
