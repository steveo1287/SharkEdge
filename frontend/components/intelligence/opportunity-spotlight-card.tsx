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

function formatStake(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "$0";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2
  }).format(value);
}

export function OpportunitySpotlightCard({
  opportunity,
  href,
  ctaLabel
}: Props) {
  const oddsLabel = formatOdds(opportunity.displayOddsAmerican);
  const evLabel = formatPercent(opportunity.expectedValuePct);
  const lineLabel = formatLine(opportunity.displayLine);
  const stakeLabel = formatStake(opportunity.sizing.recommendedStake);
  const bankrollLabel = `${opportunity.sizing.bankrollPct.toFixed(2)}% BR`;
  const hasPortfolioPenalty =
    opportunity.sizing.correlationPenalty < 0.99 ||
    opportunity.sizing.competitionPenalty < 0.99;

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
          <div className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-500">
            Stake {stakeLabel} • {bankrollLabel}
            {hasPortfolioPenalty
              ? ` • Corr ${(opportunity.sizing.correlationPenalty * 100).toFixed(0)}% • Comp ${(opportunity.sizing.competitionPenalty * 100).toFixed(0)}%`
              : ""}
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

          <Badge tone={opportunity.sizing.recommendation === "NO_BET" ? "danger" : "muted"}>
            Size {opportunity.sizing.label}
          </Badge>

          {hasPortfolioPenalty ? (
            <Badge tone="danger">Portfolio clipped</Badge>
          ) : null}

          {opportunity.executionContext?.status === "HISTORICAL" ? (
            <Badge
              tone={
                opportunity.executionContext.classification === "EXCELLENT_ENTRY"
                  ? "success"
                  : opportunity.executionContext.classification === "MISSED_OPPORTUNITY"
                    ? "danger"
                    : "muted"
              }
            >
              Exec {opportunity.executionContext.executionScore}
            </Badge>
          ) : null}

          {opportunity.truthCalibration.status === "APPLIED" ? (
            <Badge
              tone={opportunity.truthCalibration.scoreDelta >= 0 ? "brand" : "danger"}
            >
              Cal {opportunity.truthCalibration.scoreDelta >= 0 ? "+" : ""}
              {opportunity.truthCalibration.scoreDelta}
            </Badge>
          ) : null}

          {opportunity.marketMicrostructure.status === "APPLIED" ? (
            <Badge
              tone={
                opportunity.marketMicrostructure.regime === "STALE_COPY"
                  ? "success"
                  : opportunity.marketMicrostructure.regime === "FRAGMENTED"
                    ? "danger"
                    : "premium"
              }
            >
              {opportunity.marketMicrostructure.regime.toLowerCase().replace(/_/g, " ")}
            </Badge>
          ) : null}
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
