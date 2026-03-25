"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatAmericanOdds, formatLine, formatUnits } from "@/lib/formatters/odds";
import type { LedgerBetView } from "@/lib/types/ledger";
import { formatLedgerMarketType } from "@/lib/utils/ledger";

type BetTableProps = {
  bets: LedgerBetView[];
  onEdit: (bet: LedgerBetView) => void;
  onQuickSettle: (
    bet: LedgerBetView,
    result: Exclude<LedgerBetView["result"], "OPEN">
  ) => Promise<void> | void;
  onArchive: (bet: LedgerBetView) => void;
  onDelete: (bet: LedgerBetView) => void;
};

function getResultTone(result: LedgerBetView["result"]) {
  if (result === "WIN") {
    return "success" as const;
  }

  if (result === "LOSS") {
    return "danger" as const;
  }

  if (result === "PUSH" || result === "VOID") {
    return "premium" as const;
  }

  return "muted" as const;
}

export function BetTable({
  bets,
  onEdit,
  onQuickSettle,
  onArchive,
  onDelete
}: BetTableProps) {
  return (
    <div className="grid gap-4">
      {bets.map((bet) => (
        <Card key={bet.id} className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                {bet.league} | {new Date(bet.placedAt).toLocaleString("en-US", {
                  dateStyle: "short",
                  timeStyle: "short"
                })}
              </div>
              <div className="mt-2 font-display text-2xl font-semibold text-white">
                {bet.eventLabel ?? bet.selection}
              </div>
              <div className="mt-2 text-sm text-slate-400">
                {bet.betType === "PARLAY"
                  ? `${bet.legs.length}-leg parlay`
                  : `${formatLedgerMarketType(bet.marketType)} | ${bet.selection}`}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone={getResultTone(bet.result)}>{bet.result}</Badge>
              {bet.isLive ? <Badge tone="brand">Live ticket</Badge> : null}
              {typeof bet.clvPercentage === "number" ? (
                <Badge tone={bet.clvPercentage >= 0 ? "success" : "danger"}>
                  CLV {bet.clvPercentage >= 0 ? "+" : ""}
                  {bet.clvPercentage.toFixed(2)}%
                </Badge>
              ) : (
                <Badge tone="muted">CLV unavailable</Badge>
              )}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <div className="rounded-2xl border border-line bg-slate-950/55 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Odds</div>
              <div className="mt-2 text-lg font-medium text-white">
                {formatAmericanOdds(bet.oddsAmerican)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {bet.sportsbook?.name ?? "Book pending"}
              </div>
            </div>
            <div className="rounded-2xl border border-line bg-slate-950/55 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Line</div>
              <div className="mt-2 text-lg font-medium text-white">
                {bet.line === null ? "--" : formatLine(bet.line)}
              </div>
            </div>
            <div className="rounded-2xl border border-line bg-slate-950/55 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Risk / To Win</div>
              <div className="mt-2 text-lg font-medium text-white">
                {formatUnits(bet.riskAmount).replace(/^\+/, "")} / {formatUnits(bet.toWin)}
              </div>
            </div>
            <div className="rounded-2xl border border-line bg-slate-950/55 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Market EV</div>
              <div className="mt-2 text-lg font-medium text-white">
                {typeof bet.context?.expectedValuePct === "number"
                  ? `${bet.context.expectedValuePct > 0 ? "+" : ""}${bet.context.expectedValuePct.toFixed(2)}%`
                  : "--"}
              </div>
            </div>
            <div className="rounded-2xl border border-line bg-slate-950/55 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Source</div>
              <div className="mt-2 text-sm font-medium text-white">
                {bet.context?.sourceLabel ?? "Manual entry"}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {bet.context?.confidenceTier ?? "No confidence tier"}
              </div>
            </div>
            <div className="rounded-2xl border border-line bg-slate-950/55 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Closing</div>
              <div className="mt-2 text-lg font-medium text-white">
                {typeof bet.closingOddsAmerican === "number"
                  ? formatAmericanOdds(bet.closingOddsAmerican)
                  : "--"}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {bet.closingLine === null ? "Line unavailable" : `Line ${formatLine(bet.closingLine)}`}
              </div>
            </div>
          </div>

          {bet.context?.supportNote ? (
            <div className="mt-4 rounded-2xl border border-line bg-slate-950/45 px-4 py-3 text-sm text-slate-400">
              {bet.context.supportNote}
            </div>
          ) : null}

          {bet.legs.length > 1 ? (
            <div className="mt-4 grid gap-2">
              {bet.legs.map((leg) => (
                <div
                  key={leg.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line/70 bg-slate-950/45 px-4 py-3"
                >
                  <div>
                    <div className="text-sm font-medium text-white">
                      {leg.marketLabel}: {leg.selection}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {leg.eventLabel ?? "Event pending"} | {formatAmericanOdds(leg.oddsAmerican)}
                    </div>
                  </div>
                  <Badge tone={getResultTone(leg.result)}>{leg.result}</Badge>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {bet.result === "OPEN"
                ? (["WIN", "LOSS", "PUSH", "VOID"] as const).map((result) => (
                    <button
                      key={`${bet.id}-${result}`}
                      type="button"
                      onClick={() => onQuickSettle(bet, result)}
                      className="rounded-2xl border border-line px-3 py-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-300"
                    >
                      Mark {result}
                    </button>
                  ))
                : null}
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => onEdit(bet)} className="text-sky-300">
                Edit
              </button>
              <button type="button" onClick={() => onArchive(bet)} className="text-amber-300">
                Archive
              </button>
              <button type="button" onClick={() => onDelete(bet)} className="text-rose-300">
                Delete
              </button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
