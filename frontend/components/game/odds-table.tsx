import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import type { GameDetailView } from "@/lib/types/domain";
import { formatLongDate } from "@/lib/formatters/date";

type OddsTableProps = {
  detail: GameDetailView;
};

export function OddsTable({ detail }: OddsTableProps) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <DataTable
        columns={["Sportsbook", "Spread", "Moneyline", "Total"]}
        rows={detail.books.map((row) => [
          row.sportsbook.name,
          row.spread,
          row.moneyline,
          row.total
        ])}
      />

      <Card className="p-5">
        <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
          Line Movement History
        </div>
        <div className="mt-4 grid gap-3">
          {detail.lineMovement.map((point) => (
            <div
              key={point.capturedAt}
              className="rounded-2xl border border-line bg-slate-950/65 px-4 py-3"
            >
              <div className="text-xs text-slate-500">{formatLongDate(point.capturedAt)}</div>
              <div className="mt-2 flex items-center justify-between text-sm text-slate-300">
                <span>Spread {point.spreadLine}</span>
                <span>Total {point.totalLine}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
