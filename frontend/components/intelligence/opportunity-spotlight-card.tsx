import Link from "next/link";

import { Card } from "@/components/ui/card";
import {
  getOpportunityTrapLine,
  OpportunityBadgeRow
} from "@/components/intelligence/opportunity-badges";
import type { OpportunityView } from "@/lib/types/opportunity";
import { formatAmericanOdds } from "@/lib/formatters/odds";

export function OpportunitySpotlightCard({
  opportunity,
  href,
  ctaLabel = "Open"
}: {
  opportunity: OpportunityView;
  href: string;
  ctaLabel?: string;
}) {
  const trapLine = getOpportunityTrapLine(opportunity);

  return (
    <Card className="surface-panel p-5">
      <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
        {opportunity.league} | {opportunity.marketType.replace(/_/g, " ")}
      </div>
      <div className="mt-3 text-2xl font-semibold text-white">{opportunity.selectionLabel}</div>
      <div className="mt-2 text-sm text-slate-400">{opportunity.eventLabel}</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-[1rem] border border-line bg-slate-950/65 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Price</div>
          <div className="mt-2 text-white">
            {typeof opportunity.displayOddsAmerican === "number"
              ? formatAmericanOdds(opportunity.displayOddsAmerican)
              : "N/A"}
          </div>
        </div>
        <div className="rounded-[1rem] border border-line bg-slate-950/65 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">EV</div>
          <div className="mt-2 text-white">
            {typeof opportunity.expectedValuePct === "number"
              ? `${opportunity.expectedValuePct > 0 ? "+" : ""}${opportunity.expectedValuePct.toFixed(2)}%`
              : "N/A"}
          </div>
        </div>
        <div className="rounded-[1rem] border border-line bg-slate-950/65 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Fair</div>
          <div className="mt-2 text-white">
            {typeof opportunity.fairPriceAmerican === "number"
              ? formatAmericanOdds(opportunity.fairPriceAmerican)
              : "N/A"}
          </div>
        </div>
      </div>
      <div className="mt-4 text-sm leading-6 text-slate-300">{opportunity.reasonSummary}</div>
      <div className="mt-4">
        <OpportunityBadgeRow opportunity={opportunity} />
      </div>
      {trapLine ? (
        <div className="mt-4 rounded-[1rem] border border-rose-400/20 bg-rose-500/8 px-4 py-3 text-sm leading-6 text-rose-100">
          {trapLine}
        </div>
      ) : null}
      <div className="mt-4 flex items-center justify-between gap-3 text-sm text-slate-400">
        <span>{opportunity.sportsbookName ?? "Best market"}</span>
        <Link
          href={href}
          className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-sky-200"
        >
          {ctaLabel}
        </Link>
      </div>
    </Card>
  );
}
