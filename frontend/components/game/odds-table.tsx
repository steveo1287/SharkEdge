import { LineMovementChart } from "@/components/charts/line-movement-chart";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { formatLongDate } from "@/lib/formatters/date";
import { americanToImplied, stripVig } from "@/lib/odds/index";
import type { MatchupDetailView } from "@/lib/types/domain";

type OddsTableProps = {
  detail: MatchupDetailView;
};

function isMissingMarket(value: string) {
  return !value || value === "Pending" || value === "No market" || value === "-";
}

function formatCell(value: string, bestHint: string | null) {
  if (isMissingMarket(value)) {
    return <span className="text-slate-500">-</span>;
  }

  const highlighted = bestHint && value.includes(bestHint);
  const prices = Array.from(value.matchAll(/([+-]\d{2,4})/g))
    .map((match) => Number(match[1]))
    .filter((price) => Number.isFinite(price));
  const noVig =
    prices.length >= 2
      ? stripVig(
          prices
            .map((price) => americanToImplied(price))
            .filter((probability): probability is number => typeof probability === "number")
        )
      : [];

  return (
    <div className="flex flex-col gap-1.5">
      <span className={highlighted ? "font-medium text-white" : "text-slate-300"}>{value}</span>
      {highlighted ? (
        <span className="text-[11px] uppercase tracking-[0.18em] text-sky-300">Best available</span>
      ) : null}
      {noVig.length >= 2 ? (
        <span className="text-[11px] text-slate-500">
          No-vig {`${(noVig[0] * 100).toFixed(1)}% / ${(noVig[1] * 100).toFixed(1)}%`}
        </span>
      ) : null}
    </div>
  );
}

function TapeCard({
  label,
  value,
  note
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="concept-metric">
      <div className="concept-meta">{label}</div>
      <div className="mt-2 text-base font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs leading-5 text-slate-500">{note}</div>
    </div>
  );
}

export function OddsTable({ detail }: OddsTableProps) {
  const openingPoint = detail.lineMovement[0] ?? null;
  const currentPoint = detail.lineMovement[detail.lineMovement.length - 1] ?? null;
  const spreadHint = detail.oddsSummary?.bestSpread ?? null;
  const moneylineHint = detail.oddsSummary?.bestMoneyline ?? null;
  const totalHint = detail.oddsSummary?.bestTotal?.replace("O/U ", "") ?? null;
  const spreadMove =
    openingPoint && currentPoint && typeof openingPoint.spreadLine === "number" && typeof currentPoint.spreadLine === "number"
      ? currentPoint.spreadLine - openingPoint.spreadLine
      : null;
  const totalMove =
    openingPoint && currentPoint && typeof openingPoint.totalLine === "number" && typeof currentPoint.totalLine === "number"
      ? currentPoint.totalLine - openingPoint.totalLine
      : null;

  return (
    <div className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
      <DataTable
        columns={["Sportsbook", "Spread", "Moneyline", "Total"]}
        rows={detail.books.map((row) => [
          <div key={`${row.sportsbook.id}-book`}>
            <div className="text-sm font-semibold text-white">{row.sportsbook.name}</div>
            <div className="mt-1 font-mono text-[0.66rem] uppercase tracking-[0.16em] text-slate-500">book row</div>
          </div>,
          formatCell(row.spread, spreadHint),
          formatCell(row.moneyline, moneylineHint),
          formatCell(row.total, totalHint)
        ])}
      />

      <div className="grid gap-4">
        <Card className="surface-panel p-5">
          <div className="concept-meta">Market tape</div>
          <div className="mt-4 grid gap-3">
            <LineMovementChart points={detail.lineMovement} metric="spreadLine" label="Spread history" compact />
            <LineMovementChart points={detail.lineMovement} metric="totalLine" label="Total history" compact />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <TapeCard
              label="Opening spread"
              value={openingPoint?.spreadLine !== null && openingPoint?.spreadLine !== undefined ? String(openingPoint.spreadLine) : "N/A"}
              note="First stored spread snapshot for this matchup."
            />
            <TapeCard
              label="Current spread"
              value={currentPoint?.spreadLine !== null && currentPoint?.spreadLine !== undefined ? String(currentPoint.spreadLine) : "N/A"}
              note="Most recent spread snapshot currently stored."
            />
            <TapeCard
              label="Spread move"
              value={spreadMove === null ? "N/A" : `${spreadMove > 0 ? "+" : ""}${spreadMove.toFixed(1)} pts`}
              note="Opening versus latest tracked spread."
            />
            <TapeCard
              label="Total move"
              value={totalMove === null ? "N/A" : `${totalMove > 0 ? "+" : ""}${totalMove.toFixed(1)} pts`}
              note="Opening versus latest tracked total."
            />
          </div>
        </Card>

        <Card className="surface-panel p-5">
          <div className="concept-meta">Snapshot timeline</div>
          <div className="mt-4 grid gap-3">
            {detail.lineMovement.length ? (
              detail.lineMovement.map((point, index) => (
                <div
                  key={point.capturedAt}
                  className={
                    index === detail.lineMovement.length - 1
                      ? "concept-list-row border-sky-400/20 bg-sky-500/10"
                      : "concept-list-row"
                  }
                >
                  <div className="concept-meta">
                    {formatLongDate(point.capturedAt)}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-300">
                    <span>Spread {point.spreadLine ?? "-"}</span>
                    <span>Total {point.totalLine ?? "-"}</span>
                  </div>
                </div>
              ))
            ) : detail.marketRanges?.length ? (
              detail.marketRanges.map((range) => (
                <div
                  key={range.label}
                  className="concept-list-row"
                >
                  <div className="concept-meta">{range.label}</div>
                  <div className="mt-2 text-sm text-slate-300">{range.value}</div>
                </div>
              ))
            ) : (
              <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-3 text-sm leading-6 text-slate-400">
                Historical market snapshots are not available for this matchup yet.
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
