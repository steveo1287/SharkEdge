import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatOpportunityAction } from "@/components/intelligence/opportunity-badges";
import type { OpportunityView } from "@/lib/types/opportunity";

type Props = {
  opportunity: OpportunityView;
  href: string;
  ctaLabel: string;
};

function getTone(action: string) {
  if (action === "BET_NOW") return "success";
  if (action === "WAIT") return "brand";
  if (action === "WATCH") return "premium";
  return "muted";
}

export function OpportunitySpotlightCard({
  opportunity,
  href,
  ctaLabel
}: Props) {
  return (
    <Card className="surface-panel p-4 sm:p-5">
      <div className="flex flex-col gap-4">
        {/* HEADER */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge tone={getTone(opportunity.actionState)}>
            {formatOpportunityAction(opportunity.actionState)}
          </Badge>

          <div className="text-xs text-slate-500">
            Score {Math.round(opportunity.opportunityScore)}
          </div>
        </div>

        {/* TITLE */}
        <div className="text-lg font-semibold text-white sm:text-xl">
          {opportunity.title}
        </div>

        {/* SUMMARY */}
        <div className="text-sm leading-6 text-slate-300">
          {opportunity.reasonSummary}
        </div>

        {/* META */}
        <div className="flex flex-wrap gap-2">
          {opportunity.market ? (
            <Badge tone="muted">{opportunity.market}</Badge>
          ) : null}

          {opportunity.edge ? (
            <Badge tone="premium">{opportunity.edge}</Badge>
          ) : null}
        </div>

        {/* CTA */}
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