import { DataTable } from "@/components/ui/data-table";
import type { PerformanceBreakdownRow } from "@/lib/types/ledger";
import { formatPercent, formatUnits } from "@/lib/formatters/odds";

type BreakdownPanelProps = {
  rows: PerformanceBreakdownRow[];
};

export function BreakdownPanel({ rows }: BreakdownPanelProps) {
  return (
    <DataTable
      compact
      columns={["Split", "Bets", "Win Rate", "ROI", "Units", "Avg Stake", "CLV"]}
      rows={rows.map((row) => [
        row.label,
        `${row.bets}`,
        `${row.winRate.toFixed(1)}%`,
        formatPercent(row.roi),
        formatUnits(row.units),
        `${row.avgStake.toFixed(2)}u`,
        typeof row.clv === "number" ? `${row.clv > 0 ? "+" : ""}${row.clv.toFixed(2)}%` : "--"
      ])}
    />
  );
}
