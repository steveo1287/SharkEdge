"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useBetSlip } from "@/components/bets/bet-slip-provider";
import { formatAmericanOdds, formatLine } from "@/lib/formatters/odds";
import { buildParlayIntent, encodeBetIntent, getConfidenceTierLabel } from "@/lib/utils/bet-intelligence";
import { formatLedgerMarketType } from "@/lib/utils/ledger";

export function BetSlipDrawer() {
  const { entries, open, setOpen, removeEntry, clearEntries } = useBetSlip();
  const parlayIntent = buildParlayIntent(entries);

  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="Close bet slip"
          className="fixed inset-0 z-40 bg-slate-950/70"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <aside
        className={[
          "fixed right-0 top-0 z-50 h-full w-full max-w-[460px] transform border-l border-line/80 bg-slate-950/98 p-5 shadow-2xl transition-transform duration-200",
          open ? "translate-x-0" : "translate-x-full"
        ].join(" ")}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-sky-300">Bet Slip</div>
            <div className="mt-2 font-display text-2xl font-semibold text-white">
              {entries.length} saved entry{entries.length === 1 ? "" : "ies"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-2xl border border-line px-4 py-2 text-sm text-slate-300"
          >
            Close
          </button>
        </div>

        <div className="mt-5 grid gap-4 overflow-y-auto pb-28">
          {entries.length ? (
            entries.map((entry) => (
              <Card key={entry.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      {entry.intent.league} {entry.intent.betType === "PARLAY" ? "Parlay" : "Ticket"}
                    </div>
                    <div className="mt-2 font-display text-xl font-semibold text-white">
                      {entry.intent.eventLabel}
                    </div>
                    <div className="mt-2 text-sm text-slate-400">
                      {entry.intent.context?.sourceLabel ?? "Saved from SharkEdge"}
                    </div>
                  </div>
                  <Badge tone="brand">{entry.intent.context?.confidenceTier ?? "C"}</Badge>
                </div>

                <div className="mt-4 grid gap-3">
                  {entry.intent.legs.map((leg, index) => (
                    <div
                      key={`${entry.id}-${index}`}
                      className="rounded-2xl border border-line bg-slate-950/55 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-white">
                            {leg.selection}
                          </div>
                          <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                            {formatLedgerMarketType(leg.marketType)}
                            {typeof leg.line === "number" ? ` | ${formatLine(leg.line)}` : ""}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-white">
                            {formatAmericanOdds(leg.oddsAmerican)}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {leg.sportsbookName ?? "Book pending"}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {typeof leg.context?.expectedValuePct === "number" ? (
                          <Badge tone={leg.context.expectedValuePct > 0 ? "success" : "muted"}>
                            Market EV {leg.context.expectedValuePct > 0 ? "+" : ""}
                            {leg.context.expectedValuePct.toFixed(2)}%
                          </Badge>
                        ) : (
                          <Badge tone="muted">EV unavailable</Badge>
                        )}
                        {typeof leg.context?.marketDeltaAmerican === "number" ? (
                          <Badge tone="premium">
                            Delta {leg.context.marketDeltaAmerican > 0 ? "+" : ""}
                            {leg.context.marketDeltaAmerican}
                          </Badge>
                        ) : null}
                        <Badge tone="muted">
                          {getConfidenceTierLabel(
                            leg.context?.confidenceTier ?? entry.intent.context?.confidenceTier ?? "C"
                          )}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <Link
                    href={`/bets?prefill=${encodeBetIntent(entry.intent)}`}
                    className="rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-300"
                  >
                    Log now
                  </Link>
                  <button
                    type="button"
                    onClick={() => removeEntry(entry.id)}
                    className="rounded-2xl border border-line px-4 py-2 text-sm text-slate-300"
                  >
                    Remove
                  </button>
                </div>
              </Card>
            ))
          ) : (
            <Card className="p-5">
              <div className="font-display text-xl font-semibold text-white">Slip is empty</div>
              <div className="mt-2 text-sm leading-7 text-slate-400">
                Save a side, prop, or matchup play from the board, props explorer, or matchup pages.
              </div>
            </Card>
          )}
        </div>

        <div className="absolute bottom-0 left-0 right-0 border-t border-line/80 bg-slate-950/98 p-5">
          <div className="flex flex-wrap gap-3">
            {parlayIntent ? (
              <Link
                href={`/bets?prefill=${encodeBetIntent(parlayIntent)}`}
                className="flex-1 rounded-2xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-center text-sm font-medium text-amber-200"
              >
                Log slip as parlay
              </Link>
            ) : null}
            <button
              type="button"
              onClick={clearEntries}
              className="rounded-2xl border border-line px-4 py-3 text-sm text-slate-300"
            >
              Clear slip
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
