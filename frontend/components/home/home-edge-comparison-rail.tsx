import Link from "next/link";

import { OpportunityBadgeRow } from "@/components/intelligence/opportunity-badges";
import { Card } from "@/components/ui/card";
import { formatAmericanOdds } from "@/lib/formatters/odds";
import type { OpportunityView } from "@/lib/types/opportunity";

function formatSignedPercent(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number") {
    return "N/A";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function formatFreshness(minutes: number | null | undefined) {
  if (typeof minutes !== "number") {
    return "Unknown";
  }

  return `${minutes}m`;
}

export function HomeEdgeComparisonRail({
  opportunities
}: {
  opportunities: OpportunityView[];
}) {
  const rows = opportunities.slice(0, 4);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
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
              <div className="text-right">
                <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
                  Book
                </div>
                <div className="mt-2 text-sm font-medium text-white">
                  {opportunity.sportsbookName ?? "Best market"}
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <div className="rounded-[1rem] border border-line bg-slate-950/65 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  Price
                </div>
                <div className="mt-2 text-white">
                  {typeof opportunity.displayOddsAmerican === "number"
                    ? formatAmericanOdds(opportunity.displayOddsAmerican)
                    : "N/A"}
                </div>
              </div>

              <div className="rounded-[1rem] border border-line bg-slate-950/65 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  Fair
                </div>
                <div className="mt-2 text-white">
                  {typeof opportunity.fairPriceAmerican === "number"
                    ? formatAmericanOdds(opportunity.fairPriceAmerican)
                    : "N/A"}
                </div>
              </div>

              <div className="rounded-[1rem] border border-line bg-slate-950/65 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  EV
                </div>
                <div className="mt-2 text-white">
                  {formatSignedPercent(opportunity.expectedValuePct)}
                </div>
              </div>

              <div className="rounded-[1rem] border border-line bg-slate-950/65 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  Freshness
                </div>
                <div className="mt-2 text-white">
                  {formatFreshness(opportunity.providerFreshnessMinutes)}
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  Edge score
                </div>
                <div className="mt-2 text-white">
                  {opportunity.edgeScore.toFixed(1)}
                </div>
              </div>

              <div className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  Opportunity
                </div>
                <div className="mt-2 text-white">
                  {opportunity.opportunityScore}
                </div>
              </div>

              <div className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  Market depth
                </div>
                <div className="mt-2 text-white">
                  {opportunity.bookCount} books
                </div>
              </div>
            </div>

            <div className="mt-4">
              <OpportunityBadgeRow opportunity={opportunity} />
            </div>

            <div className="mt-4 text-sm leading-6 text-slate-300">
              {opportunity.reasonSummary}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="text-sm text-slate-400">
                {opportunity.staleFlag
                  ? "Stale risk is active on this number."
                  : "Feed looks fresh enough for homepage consideration."}
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
        <Card className="surface-panel p-6 text-sm leading-7 text-slate-400 xl:col-span-2">
          No comparison rows are ready on this pass.
        </Card>
      )}
    </div>
  );
}