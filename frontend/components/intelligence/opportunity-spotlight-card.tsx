import Link from "next/link";

import { formatOpportunityAction } from "@/components/intelligence/opportunity-badges";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { OpportunityView } from "@/lib/types/opportunity";

type Props = {
  opportunity: OpportunityView;
  href: string;
  ctaLabel: string;
};

function getTone(action: string) {
  if (action === "BET_NOW") return "success" as const;
  if (action === "WAIT") return "brand" as const;
  if (action === "WATCH") return "premium" as const;
  return "muted" as const;
}

function formatOdds(value: number | null) {
  if (typeof value !== "number") {
    return null;
  }

  return `${value > 0 ? "+" : ""}${value}`;
}

function formatPercent(value: number | null) {
  if (typeof value !== "number") {
    return null;
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatLine(value: string | number | null) {
  if (typeof value === "number") {
    return `${value}`;
  }

  if (typeof value === "string" && value.trim().length) {
    return value;
  }

  return null;
}

export function OpportunitySpotlightCard({
  opportunity,
  href,
  ctaLabel
}: Props) {
  const oddsLabel = formatOdds(opportunity.displayOddsAmerican);
  const evLabel = formatPercent(opportunity.expectedValuePct);
  const lineLabel = formatLine(opportunity.displayLine);

  return (
    <Card className="surface-panel p-4 sm:p-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge tone={getTone(opportunity.actionState)}>
            {formatOpportunityAction(opportunity.actionState)}
          </Badge>

          <div className="text-xs text-slate-500">
            Score {Math.round(opportunity.opportunityScore)}
          </div>
        </div>

        <div className="min-w-0">
          <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
            {opportunity.eventLabel}
          </div>
          <div className="mt-2 text-lg font-semibold text-white sm:text-xl">
            {opportunity.selectionLabel}
          </div>
          <div className="mt-2 text-sm leading-6 text-slate-300">
            {opportunity.reasonSummary}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge tone="muted">{opportunity.marketType.replace(/_/g, " ")}</Badge>

          {opportunity.sportsbookName ? (
            <Badge tone="brand">{opportunity.sportsbookName}</Badge>
          ) : null}

          {oddsLabel ? <Badge tone="premium">{oddsLabel}</Badge> : null}

          {evLabel ? <Badge tone="success">EV {evLabel}</Badge> : null}

          {lineLabel ? <Badge tone="muted">Line {lineLabel}</Badge> : null}
        </div>

        <Link
          href={href}
          className="mt-2 w-full rounded-full bg-sky-500 px-4 py-2 text-center text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
        >
          {ctaLabel}
        </Link>
      </div>
    </Card>
  );
}