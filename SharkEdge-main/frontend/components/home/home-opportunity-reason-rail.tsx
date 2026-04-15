import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { OpportunityView } from "@/lib/types/opportunity";

function getActionTone(actionState: OpportunityView["actionState"]) {
  if (actionState === "BET_NOW") {
    return "success" as const;
  }

  if (actionState === "WAIT") {
    return "premium" as const;
  }

  if (actionState === "WATCH") {
    return "brand" as const;
  }

  return "danger" as const;
}

function getTimingLabel(timingState: OpportunityView["timingState"]) {
  switch (timingState) {
    case "WINDOW_OPEN":
      return "Window open";
    case "WAIT_FOR_PULLBACK":
      return "Wait for pullback";
    case "WAIT_FOR_CONFIRMATION":
      return "Wait for confirmation";
    case "MONITOR_ONLY":
      return "Monitor only";
    case "PASS_ON_PRICE":
      return "Pass on price";
    default:
      return timingState;
  }
}

function formatOdds(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "N/A";
  }

  return `${value > 0 ? "+" : ""}${value}`;
}

export function HomeOpportunityReasonRail({
  opportunities
}: {
  opportunities: OpportunityView[];
}) {
  const rows = opportunities.slice(0, 3);

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {rows.length ? (
        rows.map((opportunity) => (
          <Card key={opportunity.id} className="surface-panel p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
                  {opportunity.league} · {opportunity.marketType.replace(/_/g, " ")}
                </div>
                <div className="mt-2 text-xl font-semibold leading-tight text-white">
                  {opportunity.selectionLabel}
                </div>
                <div className="mt-2 text-sm text-slate-400">
                  {opportunity.eventLabel}
                </div>
              </div>
              <Badge tone={getActionTone(opportunity.actionState)}>
                {opportunity.actionState.replace(/_/g, " ")}
              </Badge>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[1rem] border border-line bg-slate-950/65 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  Price
                </div>
                <div className="mt-2 text-white">
                  {formatOdds(opportunity.displayOddsAmerican)}
                </div>
              </div>
              <div className="rounded-[1rem] border border-line bg-slate-950/65 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  EV
                </div>
                <div className="mt-2 text-white">
                  {typeof opportunity.expectedValuePct === "number"
                    ? `${opportunity.expectedValuePct > 0 ? "+" : ""}${opportunity.expectedValuePct.toFixed(2)}%`
                    : "N/A"}
                </div>
              </div>
              <div className="rounded-[1rem] border border-line bg-slate-950/65 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  Timing
                </div>
                <div className="mt-2 text-white">
                  {getTimingLabel(opportunity.timingState)}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-[1rem] border border-emerald-400/15 bg-emerald-500/6 px-4 py-3">
              <div className="text-[0.66rem] uppercase tracking-[0.18em] text-emerald-300">
                Why it shows
              </div>
              <div className="mt-3 grid gap-2">
                {(opportunity.whyItShows.length
                  ? opportunity.whyItShows.slice(0, 3)
                  : [opportunity.reasonSummary]
                ).map((reason) => (
                  <div
                    key={`${opportunity.id}-${reason}`}
                    className="text-sm leading-6 text-slate-200"
                  >
                    • {reason}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-[1rem] border border-rose-400/15 bg-rose-500/6 px-4 py-3">
              <div className="text-[0.66rem] uppercase tracking-[0.18em] text-rose-300">
                What kills it
              </div>
              <div className="mt-3 grid gap-2">
                {(opportunity.whatCouldKillIt.length
                  ? opportunity.whatCouldKillIt.slice(0, 3)
                  : ["No explicit kill switch attached on this pass."]
                ).map((risk) => (
                  <div
                    key={`${opportunity.id}-${risk}`}
                    className="text-sm leading-6 text-slate-200"
                  >
                    • {risk}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <Badge tone="muted">{opportunity.confidenceTier}</Badge>
                {opportunity.sportsbookName ? (
                  <Badge tone="muted">{opportunity.sportsbookName}</Badge>
                ) : null}
              </div>
              <Link
                href={`/game/${opportunity.eventId}`}
                className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-sky-200"
              >
                Open matchup
              </Link>
            </div>
          </Card>
        ))
      ) : (
        <Card className="surface-panel p-6 text-sm leading-7 text-slate-400 xl:col-span-3">
          No opportunity reasons are ready to surface on this pass.
        </Card>
      )}
    </div>
  );
}