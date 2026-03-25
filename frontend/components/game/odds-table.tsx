import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import type { MatchupDetailView } from "@/lib/types/domain";
import { formatLongDate } from "@/lib/formatters/date";

type OddsTableProps = {
  detail: MatchupDetailView;
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
          {detail.lineMovement.length ? "Line Movement History" : "Market Range"}
        </div>
        <div className="mt-4 grid gap-3">
          {detail.lineMovement.length
            ? detail.lineMovement.map((point) => (
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
              ))
            : detail.marketRanges?.map((range) => (
                <div
                  key={range.label}
                  className="rounded-2xl border border-line bg-slate-950/65 px-4 py-3"
                >
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{range.label}</div>
                  <div className="mt-2 text-sm text-slate-300">{range.value}</div>
                </div>
              ))}
          {!detail.lineMovement.length && !detail.marketRanges?.length ? (
            <div className="rounded-2xl border border-line bg-slate-950/65 px-4 py-3 text-sm text-slate-400">
              Live range analytics and historical snapshots are not available for this matchup yet.
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
